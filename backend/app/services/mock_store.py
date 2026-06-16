import json
import os
from copy import deepcopy
from datetime import datetime
from itertools import count
from pathlib import Path
from typing import Any

from app.schemas.domain import (
    AddManualFieldRequest,
    AppUser,
    CreateProjectRequest,
    CreateRuleTemplateRequest,
    CreateUserRequest,
    DeletedProjectRecord,
    DetectedType,
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
    UpdateReportSectionRequest,
    UpdateRuleFieldRequest,
    UpdateRuleTemplateRequest,
    UpdateUserPreferenceRequest,
    UpdateUserRequest,
    UploadItem,
    UserPreference,
    UserStatus,
)


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def now_time() -> str:
    return datetime.now().strftime("%H:%M:%S")


class MockStore:
    def __init__(self) -> None:
        self._file_ids = count(3)
        self._section_ids = count(5)
        self._field_ids = count(20)
        self._log_ids = count(6)
        self._user_ids = count(5)
        self._password_ticket_ids = count(1)
        self._message_ids = count(6)
        self.project_metrics: list[ProjectMetric] = [
            ProjectMetric(label="本月完成报告", value="36", change="+12% 较上月"),
            ProjectMetric(label="待处理任务", value="18", change="-5% 较上月"),
            ProjectMetric(label="解析成功率", value="92.6%", change="+3.2% 较上月"),
            ProjectMetric(label="平均生成耗时", value="28.6 分钟", change="-8.1% 较上月"),
        ]
        self.projects: list[Project] = [
            Project(
                id="p1",
                name="数字化工厂智能制造产线检验",
                code="PJT-20240520-001",
                type="几何精度",
                owner="张工",
                status="解析中",
                progress=60,
                updatedAt="2024-05-20 10:30",
            ),
            Project(
                id="p2",
                name="自动化设备安装验收检测",
                code="PJT-20240519-002",
                type="位置精度",
                owner="李工",
                status="待生成",
                progress=80,
                updatedAt="2024-05-20 09:15",
            ),
            Project(
                id="p3",
                name="液压开关柜出厂检验",
                code="PJT-20240519-003",
                type="电气参数",
                owner="王工",
                status="待审核",
                progress=90,
                updatedAt="2024-05-19 16:45",
            ),
            Project(
                id="p4",
                name="机器人焊接单元精度检测",
                code="PJT-20240518-004",
                type="几何精度",
                owner="赵工",
                status="待上传",
                progress=0,
                updatedAt="2024-05-19 11:20",
            ),
            Project(
                id="p5",
                name="产线综合性能检测测试",
                code="PJT-20240518-005",
                type="综合检测",
                owner="陈工",
                status="已完成",
                progress=100,
                updatedAt="2024-05-18 14:35",
            ),
        ]
        self.deleted_projects: list[DeletedProjectRecord] = []
        self.raw_files: list[RawFile] = [
            RawFile(
                id="f1",
                name="平面度检测记录.xlsx",
                type="Excel",
                size="1.12 MB",
                uploadedAt="2024-05-20 10:30",
                parseStatus="解析成功",
                detectedType="几何精度",
                typeConfirmed=False,
            ),
            RawFile(
                id="f2",
                name="设备照片_01.jpg",
                type="JPG",
                size="3.21 MB",
                uploadedAt="2024-05-20 10:31",
                parseStatus="解析失败",
                detectedType="未识别",
                typeConfirmed=False,
            ),
        ]
        self.default_parse_events: list[ParseEvent] = [
            ParseEvent(time="10:30:15", label="开始解析文件", state="done"),
            ParseEvent(time="10:30:20", label="表格检测完成，识别到 8 个表格", state="done"),
            ParseEvent(time="10:30:30", label="大模型提取中...", state="active"),
            ParseEvent(time="10:30:45", label="已提取 24/34 个字段", state="pending"),
        ]
        self.parse_events: dict[str, list[ParseEvent]] = {
            "f1": [
                ParseEvent(time="10:30:15", label="开始解析文件", state="done"),
                ParseEvent(time="10:30:20", label="OCR/结构化解析完成", state="done"),
                ParseEvent(time="10:30:30", label="字段提取完成", state="done"),
                ParseEvent(time="10:30:45", label="结构化结果已写入字段库", state="done"),
            ],
            "f2": [
                ParseEvent(time="10:31:15", label="开始解析文件", state="done"),
                ParseEvent(
                    time="10:31:22", label="表格边界识别失败，等待人工处理", state="pending"
                ),
            ],
        }
        self.base_fields: list[ExtractedField] = [
            ExtractedField(id="e1", name="检验项目", value="平面度", confidence=98),
            ExtractedField(id="e2", name="测量位置", value="左侧工作面", confidence=96),
            ExtractedField(id="e3", name="实测值", value="0.012 mm", confidence=98),
            ExtractedField(id="e4", name="标准值", value="0.020 mm", confidence=97),
            ExtractedField(id="e5", name="单位", value="mm", confidence=100),
            ExtractedField(id="e6", name="判定结果", value="合格", confidence=99),
        ]
        self.fields_by_file: dict[str, list[ExtractedField]] = {
            file.id: self.create_field_set(file.id, index)
            for index, file in enumerate(self.raw_files)
        }
        self.rule_templates: list[RuleTemplate] = [
            RuleTemplate(
                id="rt1",
                category="几何精度",
                name="平面度检测模板",
                version="v2.1.0",
                updatedAt="2024-05-18",
                fields=[
                    {
                        "id": "rf1",
                        "name": "检验项目",
                        "code": "inspection_item",
                        "type": "文本",
                        "required": True,
                        "source": "固定值",
                        "format": "{value}",
                        "validation": "必填",
                        "example": "平面度",
                    },
                    {
                        "id": "rf2",
                        "name": "测量位置",
                        "code": "measure_position",
                        "type": "文本",
                        "required": True,
                        "source": "原始记录",
                        "format": "{value}",
                        "validation": "必填",
                        "example": "左侧工作面",
                    },
                    {
                        "id": "rf3",
                        "name": "实测值",
                        "code": "actual_value",
                        "type": "数值",
                        "required": True,
                        "source": "原始记录",
                        "format": "{value} mm",
                        "validation": "必填，数值范围 -9999 ~ 9999",
                        "example": "0.012",
                    },
                    {
                        "id": "rf4",
                        "name": "标准值",
                        "code": "standard_value",
                        "type": "数值",
                        "required": True,
                        "source": "固定值",
                        "format": "{value} mm",
                        "validation": "必填，保留 3 位小数",
                        "example": "0.020",
                    },
                    {
                        "id": "rf5",
                        "name": "判定结果",
                        "code": "judgement",
                        "type": "文本",
                        "required": True,
                        "source": "规则生成",
                        "format": "{value}",
                        "validation": "合格/不合格",
                        "example": "合格",
                    },
                    {
                        "id": "rf6",
                        "name": "备注",
                        "code": "remark",
                        "type": "文本",
                        "required": False,
                        "source": "人工填写",
                        "format": "{value}",
                        "validation": "非必填",
                        "example": "无",
                    },
                ],
            ),
            RuleTemplate(
                id="rt2",
                category="位置精度",
                name="直线度检测模板",
                version="v1.8.0",
                updatedAt="2024-04-26",
                fields=[],
            ),
        ]
        self.rule_template_versions: list[RuleTemplateVersion] = [
            RuleTemplateVersion(
                id="rtv1",
                templateId="rt1",
                version="v2.1.0",
                label="v2.1.0 生效中",
                status="生效中",
                createdAt="2024-05-18",
                actor="管理员",
            ),
            RuleTemplateVersion(
                id="rtv2",
                templateId="rt1",
                version="v2.0.0",
                label="v2.0.0 已发布",
                status="已发布",
                createdAt="2024-05-01",
                actor="管理员",
            ),
            RuleTemplateVersion(
                id="rtv3",
                templateId="rt1",
                version="v1.0.0",
                label="v1.0.0 已归档",
                status="已归档",
                createdAt="2024-04-10",
                actor="管理员",
            ),
            RuleTemplateVersion(
                id="rtv4",
                templateId="rt2",
                version="v1.8.0",
                label="v1.8.0 生效中",
                status="生效中",
                createdAt="2024-04-26",
                actor="管理员",
            ),
        ]
        self.report_sections: list[ReportSection] = [
            ReportSection(
                id="s1",
                title="封面",
                status="已校验",
                content="委托单位：某智能制造有限公司\n样品名称：智能制造产线\n型号规格：IML-2405",
            ),
            ReportSection(
                id="s2",
                title="检验结论",
                status="待完善",
                content="经检测，样品几何精度、位置精度和电气参数符合当前模板判定要求。建议补充引用标准编号。",
            ),
            ReportSection(
                id="s3",
                title="几何精度检测",
                status="已生成",
                content="平面度实测值为 0.012 mm，标准值为 0.020 mm，判定结果为合格。",
            ),
            ReportSection(
                id="s4",
                title="附件",
                status="已生成",
                content="原始记录、设备照片、解析日志与规则版本记录。",
            ),
        ]
        self.report_versions: list[ReportVersion] = [
            ReportVersion(
                id="initial-1",
                label="V1.0 系统 生成初稿",
                createdAt="2024-05-20 11:00",
                actor="系统",
                kind="initial",
            ),
            ReportVersion(
                id="draft-1",
                label="V1.1 张工 保存草稿",
                createdAt="2024-05-20 11:12",
                actor="张工",
                kind="draft",
            ),
        ]
        self.report_deliveries: list[ReportDelivery] = [
            ReportDelivery(
                id="d1",
                kind="preview",
                scope="report",
                fileName="智能制造产线项目检测报告.pdf",
                format="pdf",
                status="ready",
                sectionId=None,
                createdAt="2024-05-20 11:18",
            )
        ]
        self.report_section_meta: dict[str, ReportSectionMeta] = {
            section.id: ReportSectionMeta(
                sectionId=section.id,
                categoryId=self.default_category_id(section.title),
            )
            for section in self.report_sections
        }
        self.users: list[AppUser] = [
            AppUser(
                id="u1",
                name="张工",
                role="编制员",
                department="检测一部",
                status="启用",
                lastLogin="2024-05-20 10:05",
            ),
            AppUser(
                id="u2",
                name="李工",
                role="审核员",
                department="质量部",
                status="启用",
                lastLogin="2024-05-20 09:40",
            ),
            AppUser(
                id="u3",
                name="管理员",
                role="管理员",
                department="系统管理",
                status="启用",
                lastLogin="2024-05-20 08:18",
            ),
            AppUser(
                id="u4",
                name="赵工",
                role="编制员",
                department="检测二部",
                status="禁用",
                lastLogin="2024-05-10 15:20",
            ),
        ]
        self.user_preferences: list[UserPreference] = [
            UserPreference(userId="u1", currentProjectId="p1"),
            UserPreference(userId="u2", currentProjectId="p2"),
            UserPreference(userId="u3", currentProjectId="p1"),
            UserPreference(userId="u4", currentProjectId="p4"),
        ]
        self.messages: list[SystemMessage] = [
            SystemMessage(
                id="m1",
                title="平面度检测记录解析完成",
                content="必要字段 6/6 已满足报告生成条件，可进入报告生成页面继续处理。",
                module="原始记录上传",
                type="成功",
                read=False,
                time="2024-05-20 10:35",
                projectId="p1",
            ),
            SystemMessage(
                id="m2",
                title="设备照片识别失败",
                content="设备照片_01.jpg 未识别出检测类型，请手动选择检测类型后重新解析。",
                module="原始记录上传",
                type="警告",
                read=False,
                time="2024-05-20 10:32",
                projectId="p1",
            ),
            SystemMessage(
                id="m3",
                title="报告生成草稿已保存",
                content="智能制造产线项目检测报告已生成 Word/PDF 草稿，等待人工核对。",
                module="报告生成",
                type="提醒",
                read=False,
                time="2024-05-20 11:18",
                projectId="p1",
            ),
            SystemMessage(
                id="m4",
                title="规则模板版本更新",
                content="几何精度模板已更新到 v2.1.0，新上传记录将使用新版字段规则。",
                module="规则配置",
                type="提醒",
                read=True,
                time="2024-05-18 16:22",
            ),
            SystemMessage(
                id="m5",
                title="用户登录成功",
                content="张工已完成身份认证，系统记录本次登录日志。",
                module="系统",
                type="成功",
                read=True,
                time="2024-05-20 10:05",
            ),
        ]
        self.logs: list[OperationLog] = [
            OperationLog(
                id="l1",
                module="登录认证",
                actor="张工",
                action="用户登录",
                result="成功",
                time="2024-05-20 10:05:12",
            ),
            OperationLog(
                id="l2",
                module="原始记录上传",
                actor="张工",
                action="上传平面度检测记录",
                result="成功",
                time="2024-05-20 10:30:02",
            ),
            OperationLog(
                id="l3",
                module="大模型解析",
                actor="系统",
                action="解析设备照片_01.jpg",
                result="失败",
                time="2024-05-20 10:31:15",
            ),
            OperationLog(
                id="l4",
                module="规则配置",
                actor="管理员",
                action="保存平面度判定规则",
                result="成功",
                time="2024-05-18 16:22:08",
            ),
            OperationLog(
                id="l5",
                module="报告生成",
                actor="张工",
                action="提交审核",
                result="警告",
                time="2024-05-20 11:20:36",
            ),
        ]
        self.data_dir = Path(
            os.getenv("INSPECTION_DATA_DIR", str(Path(__file__).resolve().parents[3] / "data"))
        )
        self._load_or_create_data_files()

    def _collection_tables(self) -> dict[str, tuple[str, type]]:
        return {
            "project_metrics": ("project_metrics.json", ProjectMetric),
            "projects": ("projects.json", Project),
            "deleted_projects": ("deleted_projects.json", DeletedProjectRecord),
            "raw_files": ("raw_files.json", RawFile),
            "default_parse_events": ("parse_timeline.json", ParseEvent),
            "base_fields": ("extracted_fields.json", ExtractedField),
            "report_sections": ("report_sections.json", ReportSection),
            "report_versions": ("report_versions.json", ReportVersion),
            "report_deliveries": ("report_deliveries.json", ReportDelivery),
            "rule_templates": ("rule_templates.json", RuleTemplate),
            "rule_template_versions": ("rule_template_versions.json", RuleTemplateVersion),
            "users": ("users.json", AppUser),
            "user_preferences": ("user_preferences.json", UserPreference),
            "messages": ("messages.json", SystemMessage),
            "logs": ("operation_logs.json", OperationLog),
        }

    def _dict_list_tables(self) -> dict[str, tuple[str, type]]:
        return {
            "parse_events": ("parse_events_by_file.json", ParseEvent),
            "fields_by_file": ("fields_by_file.json", ExtractedField),
            "report_section_meta": ("report_section_meta.json", ReportSectionMeta),
        }

    def _table_path(self, file_name: str) -> Path:
        return self.data_dir / file_name

    def _dump_value(self, value: Any) -> Any:
        if hasattr(value, "model_dump"):
            return value.model_dump()
        if isinstance(value, list):
            return [self._dump_value(item) for item in value]
        if isinstance(value, dict):
            return {key: self._dump_value(item) for key, item in value.items()}
        return value

    def _read_json(self, file_name: str) -> Any:
        with self._table_path(file_name).open(encoding="utf-8") as file:
            return json.load(file)

    def _write_json(self, file_name: str, value: Any) -> None:
        with self._table_path(file_name).open("w", encoding="utf-8") as file:
            json.dump(self._dump_value(value), file, ensure_ascii=False, indent=2)
            file.write("\n")

    def _load_or_create_data_files(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        has_existing_file = False

        for attr, (file_name, model) in self._collection_tables().items():
            if not self._table_path(file_name).exists():
                continue
            has_existing_file = True
            setattr(self, attr, [model.model_validate(item) for item in self._read_json(file_name)])

        for attr, (file_name, model) in self._dict_list_tables().items():
            if not self._table_path(file_name).exists():
                continue
            has_existing_file = True
            table = self._read_json(file_name)
            if attr == "report_section_meta":
                setattr(
                    self,
                    attr,
                    {key: model.model_validate(item) for key, item in table.items()},
                )
            else:
                setattr(
                    self,
                    attr,
                    {
                        key: [model.model_validate(item) for item in items]
                        for key, items in table.items()
                    },
                )

        self._reset_counters()
        if not has_existing_file:
            self.add_log("系统", "系统", "初始化本地 data 数据表")
        else:
            self.save_all()

    def _next_numeric_id(self, prefix: str, ids: list[str]) -> int:
        numbers: list[int] = []
        for raw_id in ids:
            if not raw_id.startswith(prefix):
                continue
            suffix = raw_id[len(prefix) :]
            numeric = ""
            for char in suffix:
                if not char.isdigit():
                    break
                numeric += char
            if numeric:
                numbers.append(int(numeric))
        return max(numbers, default=0) + 1

    def _reset_counters(self) -> None:
        self._file_ids = count(self._next_numeric_id("f", [file.id for file in self.raw_files]))
        self._section_ids = count(
            self._next_numeric_id("s", [section.id for section in self.report_sections])
        )
        self._field_ids = count(
            self._next_numeric_id(
                "",
                [
                    field.id.split("-manual-", 1)[-1]
                    for fields in self.fields_by_file.values()
                    for field in fields
                    if "-manual-" in field.id
                ],
            )
        )
        self._log_ids = count(self._next_numeric_id("l", [log.id for log in self.logs]))
        self._user_ids = count(self._next_numeric_id("u", [user.id for user in self.users]))
        self._password_ticket_ids = count(1)
        self._message_ids = count(
            self._next_numeric_id("m", [message.id for message in self.messages])
        )
        self._delivery_ids = count(
            self._next_numeric_id("d", [delivery.id for delivery in self.report_deliveries])
        )
        self._rule_template_ids = count(
            self._next_numeric_id("rt", [template.id for template in self.rule_templates])
        )
        self._rule_version_ids = count(
            self._next_numeric_id("rtv", [version.id for version in self.rule_template_versions])
        )

    def default_category_id(self, title: str) -> str:
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

    def add_report_version(
        self,
        label: str,
        kind: str,
        actor: str = "张工",
    ) -> ReportVersion:
        version = ReportVersion(
            id=f"{kind}-{len(self.report_versions) + 1}",
            label=label,
            createdAt=now_text(),
            actor=actor,
            kind=kind,
        )
        self.report_versions.insert(0, version)
        self.save_all()
        return version

    def add_report_delivery(
        self,
        kind: str,
        scope: str,
        file_name: str,
        file_format: str,
        section_id: str | None = None,
    ) -> ReportDelivery:
        delivery = ReportDelivery(
            id=f"d{next(self._delivery_ids)}",
            kind=kind,
            scope=scope,
            fileName=file_name,
            format=file_format,
            status="ready",
            sectionId=section_id,
            createdAt=now_text(),
        )
        self.report_deliveries.insert(0, delivery)
        self.save_all()
        return delivery

    def save_all(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        for attr, (file_name, _) in self._collection_tables().items():
            self._write_json(file_name, getattr(self, attr))
        for attr, (file_name, _) in self._dict_list_tables().items():
            self._write_json(file_name, getattr(self, attr))

    def snapshot(self, data):
        return deepcopy(data)

    def create_field_set(self, file_id: str, index: int) -> list[ExtractedField]:
        return [
            field.model_copy(
                update={
                    "id": f"{file_id}-{field.id}",
                    "value": field.value
                    if index == 0
                    else f"{field.value}{index + 1 if field.name == '检验项目' else ''}",
                    "confidence": max(88, field.confidence - index),
                }
            )
            for field in self.base_fields
        ]

    def create_project(self, payload: CreateProjectRequest) -> Project:
        next_id = f"p{self._next_numeric_id('p', [project.id for project in self.projects])}"
        created_at = now_text()
        project = Project(
            id=next_id,
            name=payload.name.strip(),
            code=f"PJT-{datetime.now().strftime('%Y%m%d%H%M')}-{next_id[1:].zfill(3)}",
            type=payload.type.strip(),
            owner=payload.owner.strip(),
            status="待上传",
            progress=0,
            updatedAt=created_at,
        )
        self.projects.insert(0, project)
        self.add_log("项目管理", "管理员", f"新建项目：{project.name}")
        return project

    def delete_project(self, project_id: str, actor: str = "管理员") -> DeletedProjectRecord | None:
        project = next((item for item in self.projects if item.id == project_id), None)
        if not project:
            return None

        self.projects = [item for item in self.projects if item.id != project_id]
        self.add_log("项目管理", actor, f"删除项目：{project.name}", "警告")
        log_id = self.logs[0].id
        record = DeletedProjectRecord(
            project=project,
            deletedAt=now_text(),
            actor=actor,
            logId=log_id,
        )
        self.deleted_projects = [
            record,
            *[item for item in self.deleted_projects if item.project.id != project_id],
        ]
        self.save_all()
        return record

    def restore_project(self, project_id: str, actor: str = "管理员") -> Project | None:
        record = next(
            (item for item in self.deleted_projects if item.project.id == project_id),
            None,
        )
        if not record:
            return None

        if not any(project.id == project_id for project in self.projects):
            restored = record.project.model_copy(update={"updatedAt": now_text()})
            self.projects.insert(0, restored)
        else:
            restored = next(project for project in self.projects if project.id == project_id)

        self.deleted_projects = [
            item for item in self.deleted_projects if item.project.id != project_id
        ]
        self.add_log("项目管理", actor, f"恢复项目：{restored.name}")
        return restored

    def add_log(self, module: str, actor: str, action: str, result: LogResult = "成功") -> None:
        self.logs.insert(
            0,
            OperationLog(
                id=f"l{next(self._log_ids)}",
                module=module,
                actor=actor,
                action=action,
                result=result,
                time=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            ),
        )
        self.save_all()

    def create_password_ticket(self) -> str:
        return f"PWD-{next(self._password_ticket_ids):04d}"

    def find_login_user(self, account: str) -> AppUser | None:
        aliases = {
            "zhanggong": "u1",
            "ligong": "u2",
            "admin": "u3",
            "zhaogong": "u4",
        }
        normalized = account.strip().lower()
        user_id = aliases.get(normalized, normalized)
        return next(
            (
                user
                for user in self.users
                if user.id.lower() == user_id or user.name.lower() == normalized
            ),
            None,
        )

    def record_login(self, user_id: str) -> AppUser | None:
        for index, user in enumerate(self.users):
            if user.id != user_id:
                continue
            updated = user.model_copy(update={"lastLogin": now_text()})
            self.users[index] = updated
            self.add_log("登录认证", updated.name, "用户登录")
            return updated
        return None

    def mark_message_read(self, message_id: str) -> SystemMessage | None:
        for index, message in enumerate(self.messages):
            if message.id != message_id:
                continue
            updated = message.model_copy(update={"read": True})
            self.messages[index] = updated
            self.save_all()
            return updated
        return None

    def mark_all_messages_read(self) -> None:
        self.messages = [message.model_copy(update={"read": True}) for message in self.messages]
        self.save_all()

    def create_user(self, payload: CreateUserRequest) -> AppUser:
        user = AppUser(
            id=f"u{next(self._user_ids)}",
            name=payload.name,
            role=payload.role,
            department=payload.department,
            status=payload.status,
            lastLogin="尚未登录",
        )
        self.users.insert(0, user)
        self.user_preferences.insert(0, UserPreference(userId=user.id, currentProjectId=None))
        self.add_log("用户管理", "管理员", f"新增用户：{user.name}")
        return user

    def import_users(self) -> list[AppUser]:
        imported = [
            CreateUserRequest(name="钱工", role="编制员", department="检测三部"),
            CreateUserRequest(name="孙工", role="审核员", department="质量部"),
        ]
        users = [self.create_user(payload) for payload in imported]
        self.add_log("用户管理", "管理员", f"批量导入 {len(users)} 个用户")
        return users

    def export_users(self) -> int:
        rows = len(self.users)
        self.add_log("用户管理", "管理员", f"导出用户 {rows} 条")
        return rows

    def get_user_preference(self, user_id: str) -> UserPreference:
        preference = next(
            (item for item in self.user_preferences if item.userId == user_id),
            None,
        )
        if preference:
            return preference
        preference = UserPreference(
            userId=user_id,
            currentProjectId=self.projects[0].id if self.projects else None,
        )
        self.user_preferences.append(preference)
        self.save_all()
        return preference

    def update_user_preference(
        self,
        user_id: str,
        payload: UpdateUserPreferenceRequest,
    ) -> UserPreference:
        current_project_id = payload.currentProjectId
        if current_project_id and not any(
            project.id == current_project_id for project in self.projects
        ):
            current_project_id = None
        for index, preference in enumerate(self.user_preferences):
            if preference.userId != user_id:
                continue
            updated = preference.model_copy(update={"currentProjectId": current_project_id})
            self.user_preferences[index] = updated
            self.save_all()
            return updated
        preference = UserPreference(userId=user_id, currentProjectId=current_project_id)
        self.user_preferences.append(preference)
        self.save_all()
        return preference

    def update_user(self, user_id: str, payload: UpdateUserRequest) -> AppUser | None:
        for index, user in enumerate(self.users):
            if user.id != user_id:
                continue
            changes = payload.model_dump(exclude_none=True)
            updated = user.model_copy(update=changes)
            self.users[index] = updated
            self.add_log("用户管理", "管理员", f"编辑用户：{updated.name}")
            return updated
        return None

    def set_user_status(self, user_id: str, status: UserStatus) -> AppUser | None:
        user = self.update_user(user_id, UpdateUserRequest(status=status))
        if user:
            self.add_log("用户管理", "管理员", f"{status}用户：{user.name}", "警告")
        return user

    def filter_logs(
        self,
        q: str | None = None,
        module: str | None = None,
        result: LogResult | None = None,
    ) -> list[OperationLog]:
        keyword = q.strip().lower() if q else ""
        filtered = self.logs
        if module and module != "全部模块":
            filtered = [log for log in filtered if log.module == module]
        if result and result != "全部结果":
            filtered = [log for log in filtered if log.result == result]
        if keyword:
            filtered = [
                log
                for log in filtered
                if keyword in f"{log.module} {log.actor} {log.action}".lower()
            ]
        return filtered

    def get_log(self, log_id: str) -> OperationLog | None:
        return next((log for log in self.logs if log.id == log_id), None)

    def upload_files(self, files: list[UploadItem]) -> list[RawFile]:
        uploaded_at = now_text()
        created: list[RawFile] = []
        for item in files:
            file = RawFile(
                id=f"f{next(self._file_ids)}",
                name=item.name,
                type=item.type,
                size=item.size,
                uploadedAt=uploaded_at,
                parseStatus="解析中",
                detectedType=item.detectedType,
                typeConfirmed=False,
            )
            created.append(file)
            self.raw_files.append(file)
            self.parse_events[file.id] = [
                ParseEvent(time=now_time(), label="上传完成，等待解析调度", state="done"),
                ParseEvent(time=now_time(), label="已创建大模型抽取任务", state="active"),
            ]
            self.fields_by_file[file.id] = self.create_field_set(file.id, len(self.raw_files) - 1)
        self.add_log("原始记录上传", "张工", f"批量上传 {len(created)} 个文件")
        return created

    def update_file_type(self, file_id: str, detected_type: DetectedType) -> RawFile | None:
        for index, file in enumerate(self.raw_files):
            if file.id != file_id:
                continue
            updated = file.model_copy(update={"detectedType": detected_type, "typeConfirmed": True})
            self.raw_files[index] = updated
            self.add_log("原始记录上传", "张工", f"确认文件类型：{file.name} -> {detected_type}")
            return updated
        return None

    def update_file_status(self, file_id: str, parse_status: ParseStatus) -> RawFile | None:
        for index, file in enumerate(self.raw_files):
            if file.id != file_id:
                continue
            updated = file.model_copy(update={"parseStatus": parse_status})
            self.raw_files[index] = updated
            if parse_status == "解析中":
                events = [ParseEvent(time=now_time(), label="重新进入解析队列", state="active")]
                log_result: LogResult = "成功"
            elif parse_status == "解析成功":
                events = [
                    ParseEvent(time=now_time(), label="字段提取完成", state="done"),
                    ParseEvent(time=now_time(), label="结构化结果已写入字段库", state="done"),
                ]
                log_result = "成功"
            else:
                events = [
                    ParseEvent(
                        time=now_time(),
                        label="解析失败，等待人工处理",
                        state="pending",
                    )
                ]
                log_result = "警告"
            self.parse_events.setdefault(file_id, []).extend(events)
            self.add_log(
                "大模型解析",
                "系统",
                f"{file.name} 解析状态更新为 {parse_status}",
                log_result,
            )
            return updated
        return None

    def delete_file(self, file_id: str) -> bool:
        file = next((item for item in self.raw_files if item.id == file_id), None)
        if not file:
            return False
        self.raw_files = [item for item in self.raw_files if item.id != file_id]
        self.parse_events.pop(file_id, None)
        self.fields_by_file.pop(file_id, None)
        self.add_log("原始记录上传", "张工", f"删除文件：{file.name}", "警告")
        return True

    def get_file(self, file_id: str) -> RawFile | None:
        return next((item for item in self.raw_files if item.id == file_id), None)

    def export_records(self, formats: list[str]) -> str:
        self.add_log("原始记录上传", "张工", f"导出解析结果：{', '.join(formats)}")
        return "智能制造产线项目_解析结果.zip"

    def register_file_preview(self, file_id: str) -> RawFile | None:
        file = self.get_file(file_id)
        if file:
            self.add_log("原始记录上传", "张工", f"预览文件：{file.name}")
        return file

    def upsert_field(
        self, file_id: str, field_id: str | None, payload: AddManualFieldRequest
    ) -> ExtractedField:
        fields = self.fields_by_file.setdefault(file_id, [])
        if field_id:
            for index, field in enumerate(fields):
                if field.id == field_id:
                    updated = field.model_copy(update={"value": payload.value, "confidence": 100})
                    fields[index] = updated
                    self.add_log("原始记录上传", "张工", f"人工修正字段：{field.name}")
                    return updated
        created = ExtractedField(
            id=f"{file_id}-manual-{next(self._field_ids)}",
            name=payload.name,
            value=payload.value,
            confidence=100,
        )
        fields.append(created)
        self.update_file_status(file_id, "解析成功")
        self.add_log("原始记录上传", "张工", f"人工补录字段：{payload.name}")
        return created

    def save_rule(self, payload: SaveRuleRequest) -> tuple[str, RuleTemplate | None]:
        template_id = payload.templateId or self.rule_templates[0].id
        for index, template in enumerate(self.rule_templates):
            if template.id != template_id:
                continue
            parts = template.version.lstrip("v").split(".")
            version_tail = parts[-1] if parts else "0"
            try:
                parts[-1] = str(int(version_tail) + 1)
            except ValueError:
                parts.append("1")
            next_version = f"v{'.'.join(parts)}"
            updated = template.model_copy(
                update={"version": next_version, "updatedAt": now_text()[:10]}
            )
            self.rule_templates[index] = updated
            self.rule_template_versions.insert(
                0,
                RuleTemplateVersion(
                    id=f"rtv{next(self._rule_version_ids)}",
                    templateId=template.id,
                    version=next_version,
                    label=f"{next_version} 生效中",
                    status="生效中",
                    createdAt=now_text()[:10],
                    actor="管理员",
                ),
            )
            target = payload.fieldId or "通用判定规则"
            self.add_log("规则配置", "管理员", f"保存{template.name}：{target}")
            return "规则已保存，并记录版本变更", updated

        self.add_log("规则配置", "管理员", f"保存规则失败：模板 {template_id} 不存在", "失败")
        return "规则保存失败，模板不存在", None

    def create_rule_template(self, payload: CreateRuleTemplateRequest) -> RuleTemplate:
        base = next(
            (template for template in self.rule_templates if template.id == payload.baseTemplateId),
            None,
        )
        template_id = f"rt{next(self._rule_template_ids)}"
        fields = [
            field.model_copy(update={"id": f"{template_id}-{field.id}"})
            for field in (base.fields if base else [])
        ]
        template = RuleTemplate(
            id=template_id,
            category=payload.category,
            name=payload.name,
            version="v1.0.0",
            updatedAt=now_text()[:10],
            fields=fields,
        )
        self.rule_templates.insert(0, template)
        self.rule_template_versions.insert(
            0,
            RuleTemplateVersion(
                id=f"rtv{next(self._rule_version_ids)}",
                templateId=template.id,
                version=template.version,
                label=f"{template.version} 生效中",
                status="生效中",
                createdAt=template.updatedAt,
                actor="管理员",
            ),
        )
        self.add_log("规则配置", "管理员", f"新建规则模板：{template.name}")
        return template

    def copy_rule_template(self, template_id: str) -> RuleTemplate | None:
        source = next(
            (template for template in self.rule_templates if template.id == template_id),
            None,
        )
        if not source:
            return None
        return self.create_rule_template(
            CreateRuleTemplateRequest(
                name=f"{source.name} 副本",
                category=source.category,
                baseTemplateId=source.id,
            )
        )

    def update_rule_template(
        self,
        template_id: str,
        payload: UpdateRuleTemplateRequest,
    ) -> RuleTemplate | None:
        for index, template in enumerate(self.rule_templates):
            if template.id != template_id:
                continue
            changes = payload.model_dump(exclude_none=True)
            updated = template.model_copy(update={**changes, "updatedAt": now_text()[:10]})
            self.rule_templates[index] = updated
            self.add_log("规则配置", "管理员", f"编辑规则模板：{updated.name}")
            return updated
        return None

    def update_rule_field(
        self,
        template_id: str,
        field_id: str,
        payload: UpdateRuleFieldRequest,
    ) -> RuleTemplate | None:
        changes = payload.model_dump(exclude_none=True)
        if not changes:
            return next(
                (template for template in self.rule_templates if template.id == template_id),
                None,
            )

        for template_index, template in enumerate(self.rule_templates):
            if template.id != template_id:
                continue
            updated_fields = []
            field_found = False
            field_name = field_id
            for field in template.fields:
                if field.id != field_id:
                    updated_fields.append(field)
                    continue
                field_found = True
                updated_field = field.model_copy(update=changes)
                field_name = updated_field.name
                updated_fields.append(updated_field)
            if not field_found:
                return None

            updated_template = template.model_copy(
                update={"fields": updated_fields, "updatedAt": now_text()[:10]}
            )
            self.rule_templates[template_index] = updated_template
            self.add_log("规则配置", "管理员", f"编辑字段定义：{field_name}")
            return updated_template
        return None

    def get_rule_versions(self, template_id: str) -> list[RuleTemplateVersion]:
        return [
            version
            for version in self.rule_template_versions
            if version.templateId == template_id
        ]

    def generate_report(self) -> list[ReportSection]:
        self.report_sections = [
            ReportSection(
                id="s1",
                title="封面",
                status="已校验",
                content=(
                    "委托单位：某智能制造有限公司\n"
                    "样品名称：智能制造产线\n"
                    "型号规格：IML-2405\n"
                    "检测日期：2024-05-20\n"
                    "报告日期：2024-05-21"
                ),
            ),
            ReportSection(
                id="s2",
                title="检验结论",
                status="待完善",
                content=(
                    "经检测，样品几何精度、位置精度和电气参数符合当前模板判定要求。\n\n"
                    "检验项目：平面度\n"
                    "实测值：0.012 mm\n"
                    "标准值：0.020 mm\n"
                    "判定结果：合格\n\n"
                    "建议补充引用标准编号和检测环境信息。"
                ),
            ),
            ReportSection(
                id="s3",
                title="几何精度检测",
                status="已生成",
                content=(
                    "一、平面度检测\n"
                    "测量位置：左侧工作面\n"
                    "实测值：0.012 mm\n"
                    "标准值：0.020 mm\n"
                    "判定结果：合格\n\n"
                    "二、直线度检测\n"
                    "测量位置：导轨基准面\n"
                    "实测值：0.008 mm\n"
                    "标准值：0.015 mm\n"
                    "判定结果：合格"
                ),
            ),
            ReportSection(
                id="s4",
                title="位置精度检测",
                status="已生成",
                content=(
                    "一、平行度检测\n"
                    "测量位置：工作台面\n"
                    "实测值：0.025 mm\n"
                    "标准值：0.030 mm\n"
                    "判定结果：合格\n\n"
                    "二、垂直度检测\n"
                    "测量位置：主轴轴线\n"
                    "实测值：0.015 mm\n"
                    "标准值：0.020 mm\n"
                    "判定结果：合格"
                ),
            ),
            ReportSection(
                id="s5",
                title="附件",
                status="已生成",
                content=(
                    "原始记录文件：平面度检测记录.xlsx、主轴精度检测记录.pdf\n"
                    "解析日志与规则版本记录：v2.1.0\n"
                    "检测设备：三坐标测量机 MC-500\n"
                    "检测环境：温度 20±2°C，湿度 50±10%RH"
                ),
            ),
        ]
        self.report_section_meta = {
            section.id: ReportSectionMeta(
                sectionId=section.id,
                categoryId=self.default_category_id(section.title),
            )
            for section in self.report_sections
        }
        self.add_log("报告生成", "张工", "生成 Word/PDF 报告初稿")
        self.add_report_version("V1.2 系统 重新生成 Word/PDF", "generated", "系统")
        self.add_report_delivery(
            "preview",
            "report",
            "智能制造产线项目检测报告.pdf",
            "pdf",
        )
        return self.report_sections

    def add_report_section(self, title: str, content: str) -> ReportSection:
        section = ReportSection(
            id=f"s{next(self._section_ids)}", title=title, content=content, status="待完善"
        )
        self.report_sections.append(section)
        self.report_section_meta[section.id] = ReportSectionMeta(
            sectionId=section.id,
            categoryId=self.default_category_id(title),
        )
        self.add_log("报告生成", "张工", f"新增报告章节：{title}")
        return section

    def update_report_section(
        self, section_id: str, payload: UpdateReportSectionRequest
    ) -> ReportSection | None:
        for index, section in enumerate(self.report_sections):
            if section.id != section_id:
                continue
            changes = payload.model_dump(exclude_none=True, exclude={"categoryId"})
            updated = section.model_copy(update=changes)
            self.report_sections[index] = updated
            if payload.categoryId:
                current_meta = self.report_section_meta.get(section_id)
                self.report_section_meta[section_id] = ReportSectionMeta(
                    sectionId=section_id,
                    categoryId=payload.categoryId,
                    revisionName=current_meta.revisionName if current_meta else None,
                )
            self.add_log("报告生成", "张工", f"更新报告章节：{updated.title}")
            return updated
        return None

    def delete_report_section(self, section_id: str) -> bool:
        section = next((item for item in self.report_sections if item.id == section_id), None)
        if not section or len(self.report_sections) <= 1:
            return False
        self.report_sections = [item for item in self.report_sections if item.id != section_id]
        self.report_section_meta.pop(section_id, None)
        self.add_log("报告生成", "张工", f"删除报告章节：{section.title}", "警告")
        return True

    def reorder_report_sections(self, section_ids: list[str]) -> list[ReportSection]:
        by_id = {section.id: section for section in self.report_sections}
        ordered = [by_id[section_id] for section_id in section_ids if section_id in by_id]
        remaining = [section for section in self.report_sections if section.id not in section_ids]
        self.report_sections = ordered + remaining
        self.add_log("报告生成", "张工", "调整报告目录顺序")
        return self.report_sections

    def register_report_preview(self, scope: str, section_id: str | None) -> str:
        if scope == "section" and section_id:
            section = next(
                (item for item in self.report_sections if item.id == section_id),
                None,
            )
            file_name = f"{section.title if section else '当前章节'}预览.pdf"
        else:
            file_name = "智能制造产线项目检测报告.pdf"
            section_id = None
        self.add_report_delivery("preview", scope, file_name, "pdf", section_id)
        self.add_log("报告生成", "张工", f"预览 PDF：{file_name}")
        return file_name

    def rollback_report(self, version_id: str, label: str) -> str:
        version = f"V{len(self.report_sections) + 1}.0 张工 回退至 {label}"
        self.add_report_version(version, "rollback")
        self.add_log("报告生成", "张工", f"回退报告版本：{version_id} / {label}", "警告")
        return version

    def save_report_draft(self) -> ReportVersion:
        label = f"V{len(self.report_versions) + 1}.0 张工 保存草稿"
        version = self.add_report_version(label, "draft")
        self.add_log("报告生成", "张工", "保存报告草稿")
        return version

    def upload_report_revision(self, section_id: str, file_name: str) -> ReportVersion | None:
        section = self.update_report_section(
            section_id,
            UpdateReportSectionRequest(status="待完善"),
        )
        if not section:
            return None
        current_meta = self.report_section_meta.get(section_id)
        self.report_section_meta[section_id] = ReportSectionMeta(
            sectionId=section_id,
            categoryId=(
                current_meta.categoryId
                if current_meta
                else self.default_category_id(section.title)
            ),
            revisionName=file_name,
        )
        self.add_report_delivery("revision", section.title, file_name, "docx", section_id)
        version = self.add_report_version(
            f"V{len(self.report_versions) + 1}.0 张工 上传更正版 Word",
            "revision",
        )
        self.add_log("报告生成", "张工", f"上传章节更正版：{file_name}")
        return version

    def export_report(self, scope: str, file_format: str) -> ReportDelivery:
        suffix = "docx" if file_format == "word" else "pdf"
        file_name = f"{scope}_检测报告.{suffix}"
        delivery = self.add_report_delivery("export", scope, file_name, suffix)
        self.add_log("报告生成", "张工", f"导出{scope} {file_format.upper()}")
        return delivery

    def submit_report(self, project_id: str = "p1") -> None:
        for index, project in enumerate(self.projects):
            if project.id != project_id:
                continue
            self.projects[index] = project.model_copy(
                update={
                    "status": "待审核",
                    "progress": max(project.progress, 90),
                    "updatedAt": now_text(),
                }
            )
            break
        self.add_log("报告生成", "张工", "提交审核", "警告")


store = MockStore()
