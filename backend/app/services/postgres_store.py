"""PostgresStore — drop-in MockStore replacement backed by SQLAlchemy repositories."""

from __future__ import annotations  # noqa: E501

from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import Integer, func, select, text
from sqlalchemy import String as SAString
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import (
    DeletedProject as DeletedProjectORM,
)
from app.models import (
    ExtractedField as ExtractedFieldORM,
)
from app.models import (
    OperationLog as OperationLogORM,
)
from app.models import (
    ParseEvent as ParseEventORM,
)
from app.models import (
    Project as ProjectORM,
)
from app.models import (
    ProjectMetric as ProjectMetricORM,
)
from app.models import (
    RawFile as RawFileORM,
)
from app.models import (
    ReportDelivery as ReportDeliveryORM,
)
from app.models import (
    ReportSection as ReportSectionORM,
)
from app.models import (
    ReportSectionMeta as ReportSectionMetaORM,
)
from app.models import (
    ReportVersion as ReportVersionORM,
)
from app.models import (
    RuleField as RuleFieldORM,
)
from app.models import (
    RuleTemplate as RuleTemplateORM,
)
from app.models import (
    RuleTemplateVersion as RuleTemplateVersionORM,
)
from app.models import (
    SystemMessage as SystemMessageORM,
)
from app.models import (
    User as UserORM,
)
from app.models import (
    UserPreference as UserPreferenceORM,
)
from app.schemas.domain import (
    AppUser,
    CreateProjectRequest,
    CreateRuleTemplateRequest,
    CreateUserRequest,
    DeletedProjectRecord,
    ExtractedField,
    LogResult,
    OperationLog,
    ParseEvent,
    ParseStatus,
    Project,
    ProjectMetric,
    RawFile,
    ReportDelivery,
    ReportSection,
    ReportSectionMeta,
    ReportVersion,
    RuleTemplate,
    RuleTemplateVersion,
    SaveRuleRequest,
    SystemMessage,
    UpdateProjectRequest,
    UpdateReportSectionRequest,
    UpdateRuleFieldRequest,
    UpdateRuleTemplateRequest,
    UpdateUserPreferenceRequest,
    UpdateUserRequest,
    UploadItem,
    UserPreference,
    UserStatus,
)


def now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def now_time() -> str:
    return datetime.now().strftime("%H:%M:%S")


def default_category_id(title: str) -> str:
    if "封面" in title:
        return "cover"
    if "结论" in title:
        return "conclusion"
    if "几何" in title:
        return "geometry"
    if "位置" in title:
        return "position"
    if "电气" in title:
        return "electric"
    if "附件" in title:
        return "attachment"
    return "custom"


class PostgresStore:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── helpers ──────────────────────────────────────────────

    def snapshot(self, data: Any) -> Any:
        return data

    def _next_id(self, prefix: str, model: type) -> int:
        """Return next numeric id like prefix+N (e.g. 'p', ProjectORM → 7)."""
        from sqlalchemy import func as safunc
        col = model.id
        # Extract numeric suffix from IDs matching prefixNNN pattern
        stripped = safunc.regexp_replace(safunc.cast(col, SAString), r"\D", "", "g")
        result = self.db.execute(
            select(safunc.max(safunc.nullif(stripped, "").cast(Integer)))
        ).scalar()
        return (result or 0) + 1

    def _build_rule_template(self, orm: RuleTemplateORM) -> RuleTemplate:
        fields = self.db.execute(
            select(RuleFieldORM)
            .where(RuleFieldORM.template_id == orm.id)
            .order_by(RuleFieldORM.sort_order)
        ).scalars().all()
        return RuleTemplate(
            id=orm.id, category=orm.category, name=orm.name,
            version=orm.version,
            updatedAt=orm.updated_at.strftime("%Y-%m-%d") if orm.updated_at else "",
            fields=[
                dict(id=f.id, name=f.name, code=f.code, type=f.type,
                     required=f.required, source=f.source, format=f.format or "",
                     validation=f.validation or "", example=f.example or "")
                for f in fields
            ],
        )

    # ── properties ───────────────────────────────────────────

    @property
    def project_metrics(self) -> list[ProjectMetric]:
        rows = self.db.execute(select(ProjectMetricORM)).scalars().all()
        return [ProjectMetric(label=r.label, value=r.value, change=r.change) for r in rows]

    @property
    def projects(self) -> list[Project]:
        rows = self.db.execute(
            select(ProjectORM).where(ProjectORM.deleted_at.is_(None))
            .order_by(ProjectORM.created_at.desc())
        ).scalars().all()
        return [
            Project(id=r.id, name=r.name, code=r.code, type=r.type,
                    owner=r.owner, ownerId=r.owner_id, status=r.status,
                    progress=r.progress, visibility=r.visibility,
                    allowedUserIds=r.allowed_user_ids or [],
                    updatedAt=r.updated_at.strftime("%Y-%m-%d %H:%M") if r.updated_at else "")
            for r in rows
        ]

    @property
    def raw_files(self) -> list[RawFile]:
        rows = self.db.execute(select(RawFileORM)).scalars().all()
        return [self._raw_file_schema(r) for r in rows]

    @property
    def rule_templates(self) -> list[RuleTemplate]:
        rows = self.db.execute(select(RuleTemplateORM).order_by(RuleTemplateORM.id)).scalars().all()
        return [self._build_rule_template(r) for r in rows]

    @property
    def rule_template_versions(self) -> list[RuleTemplateVersion]:
        rows = self.db.execute(select(RuleTemplateVersionORM)).scalars().all()
        return [RuleTemplateVersion(id=r.id, templateId=r.template_id, version=r.version,
                                    label=r.label, status=r.status,
                                    createdAt=r.created_at.strftime("%Y-%m-%d") if r.created_at else "",
                                    actor=r.actor)
                for r in rows]

    @property
    def report_sections(self) -> list[ReportSection]:
        rows = self.db.execute(
            select(ReportSectionORM).order_by(ReportSectionORM.sort_order)
        ).scalars().all()
        return [ReportSection(id=r.id, title=r.title, content=r.content, status=r.status)
                for r in rows]

    @property
    def report_versions(self) -> list[ReportVersion]:
        rows = self.db.execute(
            select(ReportVersionORM).order_by(ReportVersionORM.created_at.desc())
        ).scalars().all()
        return [ReportVersion(id=r.id, label=r.label,
                              createdAt=r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else "",
                              actor=r.actor, kind=r.kind)
                for r in rows]

    @property
    def report_deliveries(self) -> list[ReportDelivery]:
        rows = self.db.execute(
            select(ReportDeliveryORM).order_by(ReportDeliveryORM.created_at.desc())
        ).scalars().all()
        return [ReportDelivery(id=r.id, kind=r.kind, scope=r.scope,
                               fileName=r.file_name, filePath=r.file_path, format=r.format,
                               status=r.status, sectionId=r.section_id,
                               createdAt=r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else "")
                for r in rows]

    @property
    def report_section_meta(self) -> dict[str, ReportSectionMeta]:
        rows = self.db.execute(select(ReportSectionMetaORM)).scalars().all()
        return {r.section_id: ReportSectionMeta(
            sectionId=r.section_id, categoryId=r.category_id,
            revisionName=r.revision_name,
        ) for r in rows}

    @property
    def users(self) -> list[AppUser]:
        rows = self.db.execute(select(UserORM).order_by(UserORM.id)).scalars().all()
        return [AppUser(id=r.id, name=r.name, role=r.role, department=r.department,
                        status=r.status, lastLogin=r.last_login,
                        password_hash=r.password_hash)
                for r in rows]

    @property
    def user_preferences(self) -> list[UserPreference]:
        rows = self.db.execute(select(UserPreferenceORM)).scalars().all()
        return [UserPreference(userId=r.user_id, currentProjectId=r.current_project_id)
                for r in rows]

    @property
    def messages(self) -> list[SystemMessage]:
        rows = self.db.execute(select(SystemMessageORM)).scalars().all()
        return [SystemMessage(id=r.id, title=r.title, content=r.content,
                              module=r.module, type=r.type, read=r.read,
                              time=r.time, projectId=r.project_id)
                for r in rows]

    @property
    def operation_logs(self) -> list[OperationLog]:
        rows = self.db.execute(select(OperationLogORM)).scalars().all()
        return [OperationLog(id=r.id, module=r.module, actor=r.actor,
                             action=r.action, result=r.result, time=r.time)
                for r in rows]

    # ── auth ─────────────────────────────────────────────────

    def find_login_user(self, account: str) -> AppUser | None:
        aliases = {"zhanggong": "u1", "ligong": "u2", "admin": "admin", "zhaogong": "u4"}
        normalized = account.strip().lower()
        user_id = aliases.get(normalized, normalized)
        user = self.db.execute(
            select(UserORM).where(
                (func.lower(UserORM.id) == user_id) | (func.lower(UserORM.name) == normalized)
            )
        ).scalars().first()
        if user is None:
            return None
        return AppUser(id=user.id, name=user.name, role=user.role,
                       department=user.department, status=user.status,
                       lastLogin=user.last_login, password_hash=user.password_hash)

    def record_login(self, user_id: str) -> AppUser | None:
        user = self.db.get(UserORM, user_id)
        if user is None:
            return None
        user.last_login = now_iso()
        self._add_log("登录认证", user.name, "用户登录")
        self.db.flush()
        return AppUser(id=user.id, name=user.name, role=user.role,
                       department=user.department, status=user.status,
                       lastLogin=user.last_login, password_hash=user.password_hash)

    def create_password_ticket(self, username: str = "") -> str:
        # same as mock: return fake ticket
        count = self.db.execute(
            select(func.count()).select_from(OperationLogORM)
            .where(OperationLogORM.module == "账号协助")
        ).scalar() or 0
        return f"PWD-{count + 1:04d}"

    # ── users ────────────────────────────────────────────────

    def create_user(self, payload: CreateUserRequest) -> AppUser:
        existing = self.db.execute(
            select(UserORM).where(UserORM.name == payload.name)
        ).scalar_one_or_none()
        if existing is not None:
            raise ValueError(f"用户名「{payload.name}」已存在，请使用不同的用户名。")
        nid = self._next_id("u", UserORM)
        user = UserORM(id=f"u{nid}", name=payload.name, role=payload.role,
                       department=payload.department, status=payload.status,
                       last_login="尚未登录",
                       password_hash=hash_password(payload.password) if payload.password else None)
        self.db.add(user)
        pref = UserPreferenceORM(user_id=f"u{nid}")
        self.db.add(pref)
        self._add_log("用户管理", "管理员", f"新增用户：{user.name}")
        self.db.flush()
        return AppUser(id=user.id, name=user.name, role=user.role,
                       department=user.department, status=user.status,
                       lastLogin=user.last_login)

    def update_user(self, user_id: str, payload: UpdateUserRequest) -> AppUser | None:
        user = self.db.get(UserORM, user_id)
        if user is None:
            return None
        changes = payload.model_dump(exclude_none=True)
        for k, v in changes.items():
            if k == "lastLogin":
                user.last_login = v
            elif hasattr(user, k):
                setattr(user, k, v)
        self._add_log("用户管理", "管理员", f"编辑用户：{user.name}")
        self.db.flush()
        return AppUser(id=user.id, name=user.name, role=user.role,
                       department=user.department, status=user.status,
                       lastLogin=user.last_login)

    def update_user_status(self, user_id: str, status: UserStatus) -> AppUser | None:
        user = self.update_user(user_id, UpdateUserRequest(status=status))
        if user:
            self._add_log("用户管理", "管理员", f"{status}用户：{user.name}", "警告")
        return user

    def delete_user(self, user_id: str) -> AppUser | None:
        user = self.db.get(UserORM, user_id)
        if user is None:
            return None
        result = AppUser(id=user.id, name=user.name, role=user.role,
                         department=user.department, status=user.status,
                         lastLogin=user.last_login)
        pref = self.db.execute(
            select(UserPreferenceORM).where(UserPreferenceORM.user_id == user_id)
        ).scalar_one_or_none()
        if pref is not None:
            self.db.delete(pref)
        self.db.delete(user)
        self._add_log("用户管理", "管理员", f"删除用户：{user.name}", "警告")
        self.db.flush()
        return result

    def import_users(self, _data: Any = None) -> list[AppUser]:
        imported = [
            CreateUserRequest(name="钱工", role="编制员", department="检测三部"),
            CreateUserRequest(name="孙工", role="审核员", department="质量部"),
        ]
        users = [self.create_user(p) for p in imported]
        self._add_log("用户管理", "管理员", f"批量导入 {len(users)} 个用户")
        return users

    # ── projects ─────────────────────────────────────────────

    def create_project(self, payload: CreateProjectRequest, owner_id: str | None = None) -> Project:
        nid = self._next_id("p", ProjectORM)
        pid = f"p{nid}"
        code = f"PJT-{datetime.now().strftime('%Y%m%d%H%M')}-{str(nid).zfill(3)}"
        ts = now_iso()
        proj = ProjectORM(id=pid, name=payload.name.strip(), code=code,
                          type=payload.type.strip(), owner=payload.owner.strip(),
                          owner_id=owner_id, status="待上传", progress=0,
                          visibility=payload.visibility,
                          allowed_user_ids=(
                              payload.allowedUserIds if payload.allowedUserIds else None
                          ))
        self.db.add(proj)
        self._add_log("项目管理", "管理员", f"新建项目：{proj.name}")
        self.db.flush()
        return Project(id=proj.id, name=proj.name, code=proj.code, type=proj.type,
                       owner=proj.owner, ownerId=proj.owner_id, status=proj.status,
                       progress=proj.progress, visibility=proj.visibility,
                       allowedUserIds=proj.allowed_user_ids or [],
                       updatedAt=ts)

    def list_projects_for_user(self, user_id: str, role: str) -> list[Project]:
        if role == "管理员":
            return self.snapshot(self.projects)
        all_projects = self.db.execute(
            select(ProjectORM).where(ProjectORM.deleted_at.is_(None)).order_by(ProjectORM.created_at.desc())
        ).scalars().all()
        result: list[Project] = []
        ts = now_iso()
        for proj in all_projects:
            if (proj.visibility == "public"
                    or proj.owner_id == user_id
                    or (proj.allowed_user_ids and user_id in proj.allowed_user_ids)):
                result.append(Project(
                    id=proj.id, name=proj.name, code=proj.code, type=proj.type,
                    owner=proj.owner, ownerId=proj.owner_id, status=proj.status,
                    progress=proj.progress, visibility=proj.visibility,
                    allowedUserIds=proj.allowed_user_ids or [],
                    updatedAt=proj.updated_at.strftime("%Y-%m-%d %H:%M") if proj.updated_at else ts,
                ))
        return result

    def delete_project(self, project_id: str, actor: str = "管理员") -> DeletedProjectRecord | None:
        proj = self.db.get(ProjectORM, project_id)
        if proj is None:
            return None
        proj.deleted_at = datetime.now()
        self._add_log("项目管理", actor, f"删除项目：{proj.name}", "警告")
        self.db.flush()
        log_id = self.db.execute(
            select(OperationLogORM.id).order_by(OperationLogORM.created_at.desc()).limit(1)
        ).scalar() or "l0"
        self.db.add(DeletedProjectORM(
            id=f"dp-{proj.id}-{now_iso()[:10]}",
            project_id=proj.id,
            project_data={"id": proj.id, "name": proj.name, "code": proj.code,
                          "type": proj.type, "owner": proj.owner, "status": proj.status,
                          "progress": proj.progress, "visibility": proj.visibility,
                          "allowedUserIds": proj.allowed_user_ids or []},
            deleted_at=datetime.now(), actor=actor, log_id=log_id,
        ))
        self.db.flush()
        ts_str = proj.updated_at.strftime("%Y-%m-%d %H:%M") if proj.updated_at else ""
        return DeletedProjectRecord(
            project=Project(id=proj.id, name=proj.name, code=proj.code, type=proj.type,
                            owner=proj.owner, ownerId=proj.owner_id, status=proj.status,
                            progress=proj.progress, visibility=proj.visibility,
                            allowedUserIds=proj.allowed_user_ids or [],
                            updatedAt=ts_str),
            deletedAt=now_iso(), actor=actor, logId=log_id,
        )

    def restore_project(self, project_id: str, actor: str = "管理员") -> Project | None:
        proj = self.db.get(ProjectORM, project_id)
        if proj is None:
            return None
        proj.deleted_at = None
        self._add_log("项目管理", actor, f"恢复项目：{proj.name}")
        self.db.flush()
        ts_str = proj.updated_at.strftime("%Y-%m-%d %H:%M") if proj.updated_at else ""
        return Project(id=proj.id, name=proj.name, code=proj.code, type=proj.type,
                       owner=proj.owner, ownerId=proj.owner_id, status=proj.status,
                       progress=proj.progress, visibility=proj.visibility,
                       allowedUserIds=proj.allowed_user_ids or [],
                       updatedAt=ts_str)

    def update_project(
        self, project_id: str, payload: UpdateProjectRequest, user_id: str, role: str
    ) -> Project | None:
        proj = self.db.get(ProjectORM, project_id)
        if proj is None:
            return None
        changes = payload.model_dump(exclude_none=True)
        if "visibility" in changes:
            proj.visibility = changes["visibility"]
        if "allowedUserIds" in changes:
            proj.allowed_user_ids = changes["allowedUserIds"] if changes["allowedUserIds"] else None
        if "name" in changes:
            proj.name = changes["name"]
        if "owner" in changes:
            proj.owner = changes["owner"]
        if "type" in changes:
            proj.type = changes["type"]
        if "status" in changes:
            proj.status = changes["status"]
        if "progress" in changes:
            proj.progress = changes["progress"]
        self._add_log("项目管理", "管理员", f"编辑项目：{proj.name}")
        self.db.flush()
        ts_str = proj.updated_at.strftime("%Y-%m-%d %H:%M") if proj.updated_at else ""
        return Project(id=proj.id, name=proj.name, code=proj.code, type=proj.type,
                       owner=proj.owner, ownerId=proj.owner_id, status=proj.status,
                       progress=proj.progress, visibility=proj.visibility,
                       allowedUserIds=proj.allowed_user_ids or [],
                       updatedAt=ts_str)

    # ── files / records ──────────────────────────────────────

    def _raw_file_schema(self, rf: RawFileORM) -> RawFile:
        return RawFile(
            id=rf.id,
            projectId=rf.project_id,
            name=rf.name,
            type=rf.type,
            size=rf.size or "",
            uploadedAt=str(rf.uploaded_at) if rf.uploaded_at else "",
            parseStatus=rf.parse_status,
            detectedType=rf.detected_type,
            typeConfirmed=rf.type_confirmed,
            serverPath=rf.file_path or None,
            parseJobId=rf.parse_job_id,
            parseRunId=rf.parse_run_id,
            parseRunPath=rf.parse_run_path,
            fieldsApproved=bool(rf.fields_approved),
            approvedAt=rf.approved_at,
        )

    def list_record_files(self, project_id: str | None = None) -> list[RawFile]:
        stmt = select(RawFileORM)
        if project_id:
            stmt = stmt.where(RawFileORM.project_id == project_id)
        rows = self.db.execute(stmt).scalars().all()
        return [self._raw_file_schema(r) for r in rows]

    def upload_files(self, files: list[UploadItem], project_id: str | None = None) -> list[RawFile]:
        ts = now_iso()
        created: list[RawFile] = []
        for item in files:
            fid = f"f{self._next_id('f', RawFileORM)}"
            rf = RawFileORM(
                id=fid, project_id=project_id, name=item.name, type=item.type,
                size=item.size, uploaded_at=ts, parse_status="解析中",
                detected_type=item.detectedType, type_confirmed=False,
            )
            self.db.add(rf)
            self.db.flush()
            # events
            self.db.add(ParseEventORM(file_id=fid, time=now_time(),
                                      label="上传完成，等待解析调度", state="done", sort_order=0))
            self.db.add(ParseEventORM(file_id=fid, time=now_time(),
                                      label="已创建大模型抽取任务", state="active", sort_order=1))
            self.db.flush()
            created.append(self._raw_file_schema(rf))
        self._add_log("原始记录上传", "张工", f"批量上传 {len(created)} 个文件")
        return created

    def _copy_base_fields_for_file(self, file_id: str) -> None:
        existing = self.db.execute(
            select(func.count()).select_from(ExtractedFieldORM)
            .where(ExtractedFieldORM.file_id == file_id)
        ).scalar() or 0
        if existing > 0:
            return
        base_fields = self.db.execute(
            select(ExtractedFieldORM).where(ExtractedFieldORM.is_base.is_(True))
        ).scalars().all()
        for bf in base_fields:
            self.db.add(ExtractedFieldORM(
                id=f"{file_id}-{bf.id}",
                file_id=file_id,
                name=bf.name,
                value=bf.value,
                confidence=bf.confidence,
                section=bf.section,
                is_base=False,
            ))

    def replace_file_fields(self, file_id: str, fields: list[ExtractedField]) -> None:
        rows = self.db.execute(
            select(ExtractedFieldORM).where(
                ExtractedFieldORM.file_id == file_id,
                ExtractedFieldORM.is_base.is_(False),
            )
        ).scalars().all()
        for row in rows:
            self.db.delete(row)
        for field in fields:
            self.db.add(ExtractedFieldORM(
                id=f"{file_id}-{field.id}",
                file_id=file_id,
                name=field.name,
                value=field.value,
                confidence=field.confidence,
                section=field.section,
                is_base=False,
            ))
        self.reset_file_approval(file_id)
        self.db.flush()

    def bind_file_run_metadata(
        self,
        file_ids: list[str],
        job_id: str | None = None,
        run_id: str | None = None,
        run_path: str | None = None,
    ) -> None:
        if not file_ids:
            return
        rows = self.db.execute(
            select(RawFileORM).where(RawFileORM.id.in_(file_ids))
        ).scalars().all()
        for rf in rows:
            if job_id is not None:
                rf.parse_job_id = job_id
            if run_id is not None:
                rf.parse_run_id = run_id
            if run_path is not None:
                rf.parse_run_path = run_path
            rf.fields_approved = False
            rf.approved_at = None
        self.db.flush()

    def reset_file_approval(self, file_id: str) -> None:
        rf = self.db.get(RawFileORM, file_id)
        if rf is None:
            return
        rf.fields_approved = False
        rf.approved_at = None

    def reset_run_approval(self, run_id: str) -> None:
        rows = self.db.execute(
            select(RawFileORM).where(RawFileORM.parse_run_id == run_id)
        ).scalars().all()
        for rf in rows:
            rf.fields_approved = False
            rf.approved_at = None
        self.db.flush()

    def update_run_field_value(
        self,
        run_id: str,
        section: str,
        field_name: str,
        value: str,
    ) -> int:
        file_ids = [
            row.id for row in self.db.execute(
                select(RawFileORM).where(RawFileORM.parse_run_id == run_id)
            ).scalars().all()
        ]
        if not file_ids:
            return 0
        rows = self.db.execute(
            select(ExtractedFieldORM).where(
                ExtractedFieldORM.file_id.in_(file_ids),
                ExtractedFieldORM.name == field_name,
                ExtractedFieldORM.section == section,
            )
        ).scalars().all()
        for row in rows:
            row.value = value
            row.confidence = 100
        if rows:
            self.reset_run_approval(run_id)
            self._add_log("原始记录上传", "张工", f"人工修正字段：{field_name}")
            self.db.flush()
        return len(rows)

    def mark_files_fields_approved(self, run_id: str) -> None:
        rows = self.db.execute(
            select(RawFileORM).where(RawFileORM.parse_run_id == run_id)
        ).scalars().all()
        approved_at = now_iso()
        for rf in rows:
            rf.fields_approved = True
            rf.approved_at = approved_at
        self.db.flush()

    def _append_unique_parse_event(self, file_id: str, label: str) -> None:
        exists = self.db.execute(
            select(func.count()).select_from(ParseEventORM)
            .where(ParseEventORM.file_id == file_id, ParseEventORM.label == label)
        ).scalar() or 0
        if exists:
            return
        self.db.add(ParseEventORM(
            file_id=file_id,
            time=now_time(),
            label=label,
            state="pending",
            sort_order=self._pe_next_sort(file_id),
        ))

    def validate_record_workspaces(self, project_id: str | None = None) -> None:
        stmt = select(RawFileORM)
        if project_id:
            stmt = stmt.where(RawFileORM.project_id == project_id)
        rows = self.db.execute(stmt).scalars().all()
        for rf in rows:
            label = ""
            if (
                rf.parse_status != "解析中"
                and rf.parse_run_path
                and not (Path(rf.parse_run_path) / "status.json").is_file()
            ):
                label = "历史解析工作区不存在，请重新解析"
            elif rf.parse_status == "解析成功" and (not rf.parse_run_id or not rf.parse_run_path):
                label = "缺少历史 run 信息，请重新解析"
            elif rf.parse_status == "解析中" and not rf.parse_job_id:
                label = "缺少解析任务信息，请重新解析"
            if not label:
                continue
            rf.parse_status = "解析失败"
            rf.fields_approved = False
            rf.approved_at = None
            self._append_unique_parse_event(rf.id, label)
            self._add_log("大模型解析", "系统", f"{rf.name} {label}", "警告")
        self.db.flush()

    def set_file_path(self, file_id: str, server_path: str) -> RawFile | None:  # pragma: no cover — stub
        rf = self.db.get(RawFileORM, file_id)
        if rf is None:
            return None
        rf.file_path = server_path
        self.db.flush()
        return self._raw_file_schema(rf)

    def update_file_status(self, file_id: str, parse_status: ParseStatus,
                           detected_type: str = "") -> RawFile | None:
        rf = self.db.get(RawFileORM, file_id)
        if rf is None:
            return None
        rf.parse_status = parse_status
        rf.fields_approved = False
        rf.approved_at = None
        if detected_type:
            rf.detected_type = detected_type
        if parse_status == "解析中":
            events = [ParseEventORM(file_id=file_id, time=now_time(),
                                    label="重新进入解析队列", state="active",
                                    sort_order=self._pe_next_sort(file_id))]
            log_result: LogResult = "成功"
        elif parse_status == "解析成功":
            events = [
                ParseEventORM(file_id=file_id, time=now_time(),
                              label="字段提取完成", state="done",
                              sort_order=self._pe_next_sort(file_id)),
                ParseEventORM(file_id=file_id, time=now_time(),
                              label="结构化结果已写入字段库", state="done",
                              sort_order=self._pe_next_sort(file_id) + 1),
            ]
            self._copy_base_fields_for_file(file_id)
            log_result = "成功"
        else:
            events = [
                ParseEventORM(file_id=file_id, time=now_time(),
                              label="解析失败，等待人工处理", state="pending",
                              sort_order=self._pe_next_sort(file_id)),
            ]
            log_result = "警告"
        for ev in events:
            self.db.add(ev)
        self._add_log("大模型解析", "系统", f"{rf.name} 解析状态更新为 {parse_status}", log_result)
        self.db.flush()
        return self._raw_file_schema(rf)

    def _pe_next_sort(self, file_id: str) -> int:
        m = self.db.execute(
            select(func.coalesce(func.max(ParseEventORM.sort_order), -1))
            .where(ParseEventORM.file_id == file_id)
        ).scalar()
        return (m or -1) + 1

    def get_parse_events(self, file_id: str) -> list[ParseEvent]:
        rows = self.db.execute(
            select(ParseEventORM).where(ParseEventORM.file_id == file_id)
            .order_by(ParseEventORM.sort_order)
        ).scalars().all()
        return [ParseEvent(time=r.time, label=r.label, state=r.state) for r in rows]

    def get_fields_by_file(self, file_id: str) -> list[ExtractedField]:
        rows = self.db.execute(
            select(ExtractedFieldORM).where(ExtractedFieldORM.file_id == file_id)
        ).scalars().all()
        return [ExtractedField(id=r.id, name=r.name, value=r.value, confidence=r.confidence,
                               section=r.section)
                for r in rows]

    def get_base_fields(self) -> list[ExtractedField]:
        rows = self.db.execute(
            select(ExtractedFieldORM).where(ExtractedFieldORM.is_base.is_(True))
        ).scalars().all()
        return [ExtractedField(id=r.id, name=r.name, value=r.value, confidence=r.confidence,
                               section=r.section)
                for r in rows]

    def add_manual_field(self, file_id: str, payload: Any) -> ExtractedField:
        nid = self._next_id("manual-", ExtractedFieldORM)
        fid = f"{file_id}-manual-{nid}"
        ef = ExtractedFieldORM(id=fid, file_id=file_id, name=payload.name,
                               value=payload.value, confidence=100, is_base=False)
        self.db.add(ef)
        self.update_file_status(file_id, "解析成功")
        self._add_log("原始记录上传", "张工", f"人工补录字段：{payload.name}")
        self.db.flush()
        return ExtractedField(id=ef.id, name=ef.name, value=ef.value, confidence=ef.confidence,
                              section=ef.section)

    # ── rules ────────────────────────────────────────────────

    def create_rule_template(self, payload: CreateRuleTemplateRequest) -> RuleTemplate:
        tid = f"rt{self._next_id('rt', RuleTemplateORM)}"
        rt = RuleTemplateORM(id=tid, category=payload.category, name=payload.name,
                             version="v1.0.0")
        self.db.add(rt)
        self.db.flush()
        # copy fields from base template if specified
        if payload.baseTemplateId:
            base_fields = self.db.execute(
                select(RuleFieldORM).where(RuleFieldORM.template_id == payload.baseTemplateId)
                .order_by(RuleFieldORM.sort_order)
            ).scalars().all()
            for i, bf in enumerate(base_fields):
                self.db.add(RuleFieldORM(
                    id=f"{tid}-{bf.id}", template_id=tid, name=bf.name, code=bf.code,
                    type=bf.type, required=bf.required, source=bf.source,
                    format=bf.format or "", validation=bf.validation or "",
                    example=bf.example or "", sort_order=i,
                ))
        # version record
        self.db.add(RuleTemplateVersionORM(
            id=f"rtv{self._next_id('rtv', RuleTemplateVersionORM)}",
            template_id=tid, version="v1.0.0", label="v1.0.0 生效中",
            status="生效中", actor="管理员",
        ))
        self._add_log("规则配置", "管理员", f"新建规则模板：{rt.name}")
        self.db.flush()
        return self._build_rule_template(rt)

    def update_rule_template(self, template_id: str, payload: UpdateRuleTemplateRequest) -> RuleTemplate | None:
        rt = self.db.get(RuleTemplateORM, template_id)
        if rt is None:
            return None
        changes = payload.model_dump(exclude_none=True)
        for k, v in changes.items():
            if hasattr(rt, k):
                setattr(rt, k, v)
        self._add_log("规则配置", "管理员", f"编辑规则模板：{rt.name}")
        self.db.flush()
        return self._build_rule_template(rt)

    def update_rule_field(self, template_id: str, field_id: str,
                          payload: UpdateRuleFieldRequest) -> RuleTemplate | None:
        changes = payload.model_dump(exclude_none=True)
        if not changes:
            return self._build_rule_template(self.db.get(RuleTemplateORM, template_id))
        rf = self.db.execute(
            select(RuleFieldORM).where(
                RuleFieldORM.template_id == template_id, RuleFieldORM.id == field_id
            )
        ).scalars().first()
        if rf is None:
            return None
        for k, v in changes.items():
            if hasattr(rf, k):
                setattr(rf, k, v)
        self._add_log("规则配置", "管理员", f"编辑字段定义：{rf.name}")
        self.db.flush()
        return self._build_rule_template(self.db.get(RuleTemplateORM, template_id))

    def get_rule_template_versions(self, template_id: str) -> list[RuleTemplateVersion]:
        rows = self.db.execute(
            select(RuleTemplateVersionORM).where(RuleTemplateVersionORM.template_id == template_id)
            .order_by(RuleTemplateVersionORM.created_at.desc())
        ).scalars().all()
        return [RuleTemplateVersion(id=r.id, templateId=r.template_id, version=r.version,
                                    label=r.label, status=r.status,
                                    createdAt=r.created_at.strftime("%Y-%m-%d") if r.created_at else "",
                                    actor=r.actor)
                for r in rows]

    def save_rule(self, payload: SaveRuleRequest) -> tuple[str, RuleTemplate | None]:
        template_id = payload.templateId
        if not template_id:
            row = self.db.execute(select(RuleTemplateORM).limit(1)).scalars().first()
            if row is None:
                return "规则保存失败，模板不存在", None
            template_id = row.id
        rt = self.db.get(RuleTemplateORM, template_id)
        if rt is None:
            self._add_log("规则配置", "管理员", f"保存规则失败：模板 {template_id} 不存在", "失败")
            return "规则保存失败，模板不存在", None
        parts = rt.version.lstrip("v").split(".")
        try:
            parts[-1] = str(int(parts[-1] or "0") + 1)
        except ValueError:
            parts.append("1")
        next_version = f"v{'.'.join(parts)}"
        rt.version = next_version
        self.db.add(RuleTemplateVersionORM(
            id=f"rtv{self._next_id('rtv', RuleTemplateVersionORM)}",
            template_id=rt.id, version=next_version,
            label=f"{next_version} 生效中", status="生效中",
            actor="管理员",
        ))
        target = payload.fieldId or "通用判定规则"
        self._add_log("规则配置", "管理员", f"保存{rt.name}：{target}")
        self.db.flush()
        return "规则已保存，并记录版本变更", self._build_rule_template(rt)

    def copy_rule_template(self, template_id: str) -> RuleTemplate | None:
        rt = self.db.get(RuleTemplateORM, template_id)
        if rt is None:
            return None
        return self.create_rule_template(CreateRuleTemplateRequest(
            name=f"{rt.name} 副本", category=rt.category, baseTemplateId=rt.id,
        ))

    # ── reports ──────────────────────────────────────────────

    def generate_report(self) -> list[ReportSection]:
        self.db.execute(text("DELETE FROM report_section_meta"))
        self.db.execute(text("DELETE FROM report_sections"))
        self.db.flush()
        sections = [
            ReportSectionORM(id="s1", title="封面", status="已校验",
                             content="委托单位：某智能制造有限公司\n样品名称：智能制造产线\n型号规格：IML-2405\n检测日期：2024-05-20\n报告日期：2024-05-21"),
            ReportSectionORM(id="s2", title="检验结论", status="待完善",
                             content="经检测，样品几何精度、位置精度和电气参数符合当前模板判定要求。\n\n检验项目：平面度\n实测值：0.012 mm\n标准值：0.020 mm\n判定结果：合格\n\n建议补充引用标准编号和检测环境信息。"),
            ReportSectionORM(id="s3", title="几何精度检测", status="已生成",
                             content="一、平面度检测\n测量位置：左侧工作面\n实测值：0.012 mm\n标准值：0.020 mm\n判定结果：合格\n\n二、直线度检测\n测量位置：导轨基准面\n实测值：0.008 mm\n标准值：0.015 mm\n判定结果：合格"),
            ReportSectionORM(id="s4", title="位置精度检测", status="已生成",
                             content="一、平行度检测\n测量位置：工作台面\n实测值：0.025 mm\n标准值：0.030 mm\n判定结果：合格\n\n二、垂直度检测\n测量位置：主轴轴线\n实测值：0.015 mm\n标准值：0.020 mm\n判定结果：合格"),
            ReportSectionORM(id="s5", title="附件", status="已生成",
                             content="原始记录文件：平面度检测记录.xlsx、主轴精度检测记录.pdf\n解析日志与规则版本记录：v2.1.0\n检测设备：三坐标测量机 MC-500\n检测环境：温度 20±2°C，湿度 50±10%RH"),
        ]
        for s in sections:
            self.db.add(s)
            self.db.flush()
            self.db.add(ReportSectionMetaORM(section_id=s.id,
                                              category_id=default_category_id(s.title)))
        self._add_log("报告生成", "张工", "生成 Word/PDF 报告初稿")
        self.add_report_version("V1.2 系统 重新生成 Word/PDF", "generated", "系统")
        self.add_report_delivery("preview", "report", "智能制造产线项目检测报告.pdf", "pdf")
        self.db.flush()
        return [ReportSection(id=s.id, title=s.title, content=s.content, status=s.status)
                for s in sections]

    def submit_report(self, project_id: str = "p1") -> None:
        proj = self.db.get(ProjectORM, project_id)
        if proj:
            proj.status = "待审核"
            proj.progress = max(proj.progress, 90)
        self._add_log("报告生成", "张工", "提交审核", "警告")
        self.db.flush()

    def add_report_version(self, label: str, kind: str, actor: str = "张工") -> ReportVersion:
        count = self.db.execute(
            select(func.count()).select_from(ReportVersionORM)
        ).scalar() or 0
        rv = ReportVersionORM(
            id=f"{kind}-{count + 1}", label=label, actor=actor, kind=kind,
        )
        self.db.add(rv)
        self.db.flush()
        return ReportVersion(id=rv.id, label=rv.label,
                             createdAt=rv.created_at.strftime("%Y-%m-%d %H:%M") if rv.created_at else "",
                             actor=rv.actor, kind=rv.kind)

    def add_report_delivery(self, kind: str, scope: str, file_name: str,
                            file_format: str, section_id: str | None = None,
                            file_path: str | None = None) -> ReportDelivery:
        did = f"d{self._next_id('d', ReportDeliveryORM)}"
        rd = ReportDeliveryORM(id=did, kind=kind, scope=scope, file_name=file_name,
                               file_path=file_path, format=file_format, status="ready",
                               section_id=section_id)
        self.db.add(rd)
        self.db.flush()
        return ReportDelivery(id=rd.id, kind=rd.kind, scope=rd.scope,
                               fileName=rd.file_name, filePath=rd.file_path, format=rd.format,
                               status=rd.status, sectionId=rd.section_id,
                               createdAt=rd.created_at.strftime("%Y-%m-%d %H:%M") if rd.created_at else "")

    def add_report_section(self, title: str, content: str = "") -> ReportSection:
        sid = f"s{self._next_id('s', ReportSectionORM)}"
        rs = ReportSectionORM(id=sid, title=title, content=content, status="待完善")
        self.db.add(rs)
        self.db.flush()
        self.db.add(ReportSectionMetaORM(section_id=sid, category_id=default_category_id(title)))
        self._add_log("报告生成", "张工", f"新增报告章节：{title}")
        self.db.flush()
        return ReportSection(id=rs.id, title=rs.title, content=rs.content, status=rs.status)

    def update_report_section(self, section_id: str,
                               payload: UpdateReportSectionRequest) -> ReportSection | None:
        rs = self.db.get(ReportSectionORM, section_id)
        if rs is None:
            return None
        changes = payload.model_dump(exclude_none=True, exclude={"categoryId"})
        for k, v in changes.items():
            if hasattr(rs, k):
                setattr(rs, k, v)
        if payload.categoryId:
            meta = self.db.get(ReportSectionMetaORM, section_id)
            if meta:
                meta.category_id = payload.categoryId
        self._add_log("报告生成", "张工", f"更新报告章节：{rs.title}")
        self.db.flush()
        return ReportSection(id=rs.id, title=rs.title, content=rs.content, status=rs.status)

    def delete_report_section(self, section_id: str) -> bool:
        rs = self.db.get(ReportSectionORM, section_id)
        if rs is None:
            return False
        count = self.db.execute(
            select(func.count()).select_from(ReportSectionORM)
        ).scalar() or 0
        if count <= 1:
            return False
        self.db.delete(rs)
        self.db.execute(text("DELETE FROM report_section_meta WHERE section_id = :sid"),
                        {"sid": section_id})
        self._add_log("报告生成", "张工", f"删除报告章节：{rs.title}", "警告")
        self.db.flush()
        return True

    def get_report_section_meta(self, section_id: str) -> ReportSectionMeta | None:
        rsm = self.db.get(ReportSectionMetaORM, section_id)
        if rsm is None:
            return None
        return ReportSectionMeta(sectionId=rsm.section_id, categoryId=rsm.category_id,
                                 revisionName=rsm.revision_name)

    # ── messages ─────────────────────────────────────────────

    def mark_message_read(self, message_id: str) -> SystemMessage | None:
        msg = self.db.get(SystemMessageORM, message_id)
        if msg is None:
            return None
        msg.read = True
        self.db.flush()
        return SystemMessage(id=msg.id, title=msg.title, content=msg.content,
                             module=msg.module, type=msg.type, read=msg.read,
                             time=msg.time, projectId=msg.project_id)

    def get_unread_count(self) -> int:
        return self.db.execute(
            select(func.count()).select_from(SystemMessageORM)
            .where(SystemMessageORM.read.is_(False))
        ).scalar() or 0

    # ── logs ─────────────────────────────────────────────────

    def _add_log(self, module: str, actor: str, action: str, result: LogResult = "成功") -> None:
        lid = f"l-{uuid4().hex}"
        self.db.add(OperationLogORM(id=lid, module=module, actor=actor,
                                    action=action, result=result, time=now_iso()))

    def add_log(self, module: str, actor: str, action: str, result: LogResult = "成功") -> None:
        self._add_log(module, actor, action, result)
        self.db.flush()

    def filter_logs(self, q: str | None = None, module: str | None = None,
                    result: LogResult | None = None,
                    actor: str | None = None) -> list[OperationLog]:
        stmt = select(OperationLogORM)
        if module and module != "全部模块":
            stmt = stmt.where(OperationLogORM.module == module)
        if result and result != "全部结果":
            stmt = stmt.where(OperationLogORM.result == result)
        if actor:
            stmt = stmt.where(OperationLogORM.actor == actor)
        if q:
            keyword = q.strip().lower()
            stmt = stmt.where(
                func.lower(func.concat(OperationLogORM.module, " ",
                                       OperationLogORM.actor, " ",
                                       OperationLogORM.action)).contains(keyword)
            )
        rows = self.db.execute(
            stmt.order_by(OperationLogORM.created_at.desc())
        ).scalars().all()
        return [OperationLog(id=r.id, module=r.module, actor=r.actor,
                             action=r.action, result=r.result, time=r.time)
                for r in rows]

    def get_log_detail(self, log_id: str) -> OperationLog | None:
        r = self.db.get(OperationLogORM, log_id)
        if r is None:
            return None
        return OperationLog(id=r.id, module=r.module, actor=r.actor,
                            action=r.action, result=r.result, time=r.time)

    # ── preferences ──────────────────────────────────────────

    def find_user_preference(self, user_id: str) -> UserPreference | None:
        r = self.db.execute(
            select(UserPreferenceORM).where(UserPreferenceORM.user_id == user_id)
        ).scalars().first()
        if r is None:
            return None
        return UserPreference(userId=r.user_id, currentProjectId=r.current_project_id)

    def update_user_preference(self, user_id: str,
                                payload: UpdateUserPreferenceRequest) -> UserPreference:
        cpid = payload.currentProjectId
        if cpid:
            exists = self.db.get(ProjectORM, cpid)
            if exists is None:
                cpid = None
        r = self.db.execute(
            select(UserPreferenceORM).where(UserPreferenceORM.user_id == user_id)
        ).scalars().first()
        if r:
            r.current_project_id = cpid
        else:
            r = UserPreferenceORM(user_id=user_id, current_project_id=cpid)
            self.db.add(r)
        self.db.flush()
        return UserPreference(userId=r.user_id, currentProjectId=r.current_project_id)

    # ── aliases for MockStore API compatibility ───────────────

    get_log = get_log_detail
    get_rule_versions = get_rule_template_versions
    get_user_preference = find_user_preference
    set_user_status = update_user_status

    # ── supplementary properties ──────────────────────────────

    @property
    def base_fields(self) -> list[ExtractedField]:
        return self.get_base_fields()

    @property
    def default_parse_events(self) -> list[ParseEvent]:
        rows = self.db.execute(
            select(ParseEventORM).where(ParseEventORM.file_id.is_(None))
        ).scalars().all()
        return [ParseEvent(time=r.time, label=r.label, state=r.state) for r in rows]

    @property
    def parse_events(self) -> dict[str, list[ParseEvent]]:
        rows = self.db.execute(
            select(ParseEventORM).where(ParseEventORM.file_id.isnot(None))
            .order_by(ParseEventORM.sort_order)
        ).scalars().all()
        result: dict[str, list[ParseEvent]] = {}
        for r in rows:
            result.setdefault(r.file_id, []).append(
                ParseEvent(time=r.time, label=r.label, state=r.state)
            )
        return result

    @property
    def fields_by_file(self) -> dict[str, list[ExtractedField]]:
        rows = self.db.execute(
            select(ExtractedFieldORM).where(ExtractedFieldORM.is_base.is_(False))
        ).scalars().all()
        result: dict[str, list[ExtractedField]] = {}
        for r in rows:
            result.setdefault(r.file_id, []).append(
                ExtractedField(id=r.id, name=r.name, value=r.value, confidence=r.confidence,
                               section=r.section)
            )
        return result

    @property
    def deleted_projects(self) -> list[DeletedProjectRecord]:
        rows = self.db.execute(select(DeletedProjectORM)).scalars().all()
        result: list[DeletedProjectRecord] = []
        for r in rows:
            pd = r.project_data or {}
            result.append(DeletedProjectRecord(
                project=Project(
                    id=pd.get("id", ""), name=pd.get("name", ""),
                    code=pd.get("code", ""), type=pd.get("type", ""),
                    owner=pd.get("owner", ""), status=pd.get("status", ""),
                    progress=pd.get("progress", 0), updatedAt=pd.get("updatedAt", ""),
                ),
                deletedAt=r.deleted_at.strftime("%Y-%m-%d %H:%M") if r.deleted_at else "",
                actor=r.actor or "", logId=r.log_id or "",
            ))
        return result

    # ── supplementary methods ─────────────────────────────────

    def delete_file(self, file_id: str) -> bool:
        rf = self.db.get(RawFileORM, file_id)
        if rf is None:
            return False
        self.db.delete(rf)
        self._add_log("原始记录上传", "张工", f"删除文件：{rf.name}", "警告")
        self.db.flush()
        return True

    def export_records(self, formats: list[str]) -> str:
        self._add_log("原始记录上传", "张工", f"导出解析结果：{', '.join(formats)}")
        return "智能制造产线项目_解析结果.zip"

    def export_report(self, scope: str, file_format: str) -> ReportDelivery:
        suffix = "docx" if file_format == "word" else "pdf"
        file_name = f"{scope}_检测报告.{suffix}"
        delivery = self.add_report_delivery("export", scope, file_name, suffix)
        self._add_log("报告生成", "张工", f"导出{scope} {file_format.upper()}")
        return delivery

    def export_users(self) -> int:
        count = self.db.execute(select(func.count()).select_from(UserORM)).scalar() or 0
        self._add_log("用户管理", "管理员", f"导出用户 {count} 条")
        return count

    def register_file_preview(self, file_id: str) -> RawFile | None:
        rf = self.db.get(RawFileORM, file_id)
        if rf:
            self._add_log("原始记录上传", "张工", f"预览文件：{rf.name}")
            return self._raw_file_schema(rf)
        return None

    def register_report_preview(self, scope: str, section_id: str | None) -> str:
        if scope == "section" and section_id:
            sec = self.db.get(ReportSectionORM, section_id)
            file_name = f"{sec.title if sec else '当前章节'}预览.pdf"
        else:
            file_name = "智能制造产线项目检测报告.pdf"
            section_id = None
        self.add_report_delivery("preview", scope, file_name, "pdf", section_id)
        self._add_log("报告生成", "张工", f"预览 PDF：{file_name}")
        return file_name

    def reorder_report_sections(self, section_ids: list[str]) -> list[ReportSection]:
        for i, sid in enumerate(section_ids):
            sec = self.db.get(ReportSectionORM, sid)
            if sec:
                sec.sort_order = i
        self._add_log("报告生成", "张工", "调整报告目录顺序")
        self.db.flush()
        return sorted(self.report_sections, key=lambda s: section_ids.index(s.id) if s.id in section_ids else 999)

    def rollback_report(self, version_id: str, label: str) -> str:
        version = f"V{len(self.report_sections) + 1}.0 张工 回退至 {label}"
        self.add_report_version(version, "rollback")
        self._add_log("报告生成", "张工", f"回退报告版本：{version_id} / {label}", "警告")
        return version

    def save_report_draft(self) -> ReportVersion:
        label = f"V{len(self.report_versions) + 1}.0 张工 保存草稿"
        version = self.add_report_version(label, "draft")
        self._add_log("报告生成", "张工", "保存报告草稿")
        return version

    def update_file_type(self, file_id: str, detected_type: str) -> RawFile | None:
        rf = self.db.get(RawFileORM, file_id)
        if rf is None:
            return None
        rf.detected_type = detected_type
        rf.type_confirmed = True
        self._add_log("原始记录上传", "张工", f"确认文件类型：{rf.name} -> {detected_type}")
        self.db.flush()
        return self._raw_file_schema(rf)

    def upsert_field(self, file_id: str, field_id: str | None, payload: Any) -> ExtractedField:
        if field_id:
            ef = self.db.get(ExtractedFieldORM, field_id)
            if ef:
                ef.value = payload.value
                ef.confidence = 100
                self.reset_file_approval(file_id)
                self._add_log("原始记录上传", "张工", f"人工修正字段：{ef.name}")
                self.db.flush()
                return ExtractedField(id=ef.id, name=ef.name, value=ef.value,
                                      confidence=ef.confidence, section=ef.section)
        nid = self._next_id("manual-", ExtractedFieldORM)
        fid = f"{file_id}-manual-{nid}"
        ef = ExtractedFieldORM(id=fid, file_id=file_id, name=payload.name,
                               value=payload.value, confidence=100, is_base=False)
        self.db.add(ef)
        self.update_file_status(file_id, "解析成功")
        self._add_log("原始记录上传", "张工", f"人工补录字段：{payload.name}")
        self.db.flush()
        return ExtractedField(id=ef.id, name=ef.name, value=ef.value, confidence=ef.confidence,
                              section=ef.section)

    def upload_report_revision(self, section_id: str, file_name: str) -> ReportVersion | None:
        sec = self.db.get(ReportSectionORM, section_id)
        if sec is None:
            return None
        sec.status = "待完善"
        meta = self.db.get(ReportSectionMetaORM, section_id)
        if meta:
            meta.revision_name = file_name
        self.add_report_delivery("revision", sec.title or "", file_name, "docx", section_id)
        version = self.add_report_version(
            f"V{len(self.report_versions) + 1}.0 张工 上传更正版 Word", "revision",
        )
        self._add_log("报告生成", "张工", f"上传章节更正版：{file_name}")
        return version

    def mark_all_messages_read(self) -> None:
        self.db.execute(text("UPDATE system_messages SET read = TRUE"))
        self.db.flush()
