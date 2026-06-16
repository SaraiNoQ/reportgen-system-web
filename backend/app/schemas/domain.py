from typing import Literal

from pydantic import BaseModel, Field

ProjectStatus = Literal["解析中", "待生成", "待审核", "待上传", "已完成"]
DetectedType = Literal["几何精度", "位置精度", "电气参数", "力学性能", "综合检测", "未识别"]
ParseStatus = Literal["解析成功", "解析失败", "解析中"]
ParseEventState = Literal["done", "active", "pending"]
ReportSectionStatus = Literal["已生成", "待完善", "已校验"]
UserRole = Literal["管理员", "编制员", "审核员"]
UserStatus = Literal["启用", "禁用"]
LogResult = Literal["成功", "失败", "警告"]
MessageModule = Literal["项目管理", "原始记录上传", "规则配置", "报告生成", "系统"]
MessageType = Literal["成功", "提醒", "警告", "失败"]


class ProjectMetric(BaseModel):
    label: str
    value: str
    change: str


class Project(BaseModel):
    id: str
    name: str
    code: str
    type: str
    owner: str
    status: ProjectStatus
    progress: int
    updatedAt: str


class CreateProjectRequest(BaseModel):
    name: str
    owner: str
    type: str = ""


class DeletedProjectRecord(BaseModel):
    project: Project
    deletedAt: str
    actor: str
    logId: str


class RestoreProjectResponse(BaseModel):
    project: Project
    restored: bool


class RawFile(BaseModel):
    id: str
    name: str
    type: str
    size: str
    uploadedAt: str
    parseStatus: ParseStatus
    detectedType: DetectedType
    typeConfirmed: bool


class ParseEvent(BaseModel):
    time: str
    label: str
    state: ParseEventState


class ExtractedField(BaseModel):
    id: str
    name: str
    value: str
    confidence: int = Field(ge=0, le=100)


class RuleField(BaseModel):
    id: str
    name: str
    code: str
    type: Literal["文本", "数值"]
    required: bool
    source: Literal["固定值", "原始记录", "计算字段", "规则生成", "人工填写"]
    format: str
    validation: str
    example: str


class RuleTemplate(BaseModel):
    id: str
    category: str
    name: str
    version: str
    updatedAt: str
    fields: list[RuleField]


class RuleTemplateVersion(BaseModel):
    id: str
    templateId: str
    version: str
    label: str
    status: Literal["生效中", "已发布", "已归档"]
    createdAt: str
    actor: str


class CreateRuleTemplateRequest(BaseModel):
    name: str
    category: str
    baseTemplateId: str | None = None


class UpdateRuleTemplateRequest(BaseModel):
    name: str | None = None
    category: str | None = None


class UpdateRuleFieldRequest(BaseModel):
    name: str | None = None
    code: str | None = None
    type: Literal["文本", "数值"] | None = None
    required: bool | None = None
    source: Literal["固定值", "原始记录", "计算字段", "规则生成", "人工填写"] | None = None
    format: str | None = None
    validation: str | None = None
    example: str | None = None


class RuleVersionsResponse(BaseModel):
    versions: list[RuleTemplateVersion]


class ReportSection(BaseModel):
    id: str
    title: str
    content: str
    status: ReportSectionStatus


class ReportSectionMeta(BaseModel):
    sectionId: str
    categoryId: str
    revisionName: str | None = None


class ReportVersion(BaseModel):
    id: str
    label: str
    createdAt: str
    actor: str
    kind: Literal["initial", "generated", "draft", "revision", "rollback"]


class ReportDelivery(BaseModel):
    id: str
    kind: Literal["preview", "export", "revision"]
    scope: str
    fileName: str
    format: Literal["pdf", "word", "docx"]
    status: Literal["ready"]
    sectionId: str | None = None
    createdAt: str


class ReportWorkspaceResponse(BaseModel):
    sections: list[ReportSection]
    versions: list[ReportVersion]
    deliveries: list[ReportDelivery]
    sectionMeta: dict[str, ReportSectionMeta]


class AppUser(BaseModel):
    id: str
    name: str
    role: UserRole
    department: str
    status: UserStatus
    lastLogin: str


class UserPreference(BaseModel):
    userId: str
    currentProjectId: str | None = None


class SystemMessage(BaseModel):
    id: str
    title: str
    content: str
    module: MessageModule
    type: MessageType
    read: bool
    time: str
    projectId: str | None = None


class OperationLog(BaseModel):
    id: str
    module: str
    actor: str
    action: str
    result: LogResult
    time: str


class CreateUserRequest(BaseModel):
    name: str
    role: UserRole
    department: str
    status: UserStatus = "启用"


class UpdateUserRequest(BaseModel):
    name: str | None = None
    role: UserRole | None = None
    department: str | None = None
    status: UserStatus | None = None


class ImportUsersResponse(BaseModel):
    users: list[AppUser]
    imported: int


class ExportUsersResponse(BaseModel):
    fileName: str
    rows: int
    status: Literal["ready"]


class ExportLogsResponse(BaseModel):
    fileName: str
    rows: int
    status: Literal["ready"]


class LogDetailResponse(BaseModel):
    log: OperationLog
    detail: str


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    ok: bool
    accessToken: str
    expiresAt: str
    authenticatedAt: str
    user: AppUser


class LogoutResponse(BaseModel):
    ok: bool


class ForgotPasswordRequest(BaseModel):
    account: str
    contact: str | None = None


class ForgotPasswordResponse(BaseModel):
    ticketId: str
    message: str
    expiresInMinutes: int


class UpdateUserPreferenceRequest(BaseModel):
    currentProjectId: str | None = None


class UploadItem(BaseModel):
    name: str
    type: str
    size: str
    detectedType: DetectedType = "未识别"


class UploadRequest(BaseModel):
    files: list[UploadItem]


class UploadResponse(BaseModel):
    files: list[RawFile]
    parseEvents: dict[str, list[ParseEvent]]
    fields: dict[str, list[ExtractedField]]


class FilePreviewResponse(BaseModel):
    file: RawFile
    previewType: str
    message: str


class RecordsExportRequest(BaseModel):
    projectId: str = "p1"
    formats: list[Literal["excel", "json", "package"]] = Field(
        default_factory=lambda: ["excel", "json", "package"]
    )


class RecordsExportResponse(BaseModel):
    fileName: str
    formats: list[str]
    status: Literal["ready"]


class UpdateFileTypeRequest(BaseModel):
    detectedType: DetectedType


class UpdateParseStatusRequest(BaseModel):
    parseStatus: ParseStatus


class UpsertFieldRequest(BaseModel):
    name: str | None = None
    value: str


class AddManualFieldRequest(BaseModel):
    name: str
    value: str


class SaveRuleRequest(BaseModel):
    templateId: str | None = None
    fieldId: str | None = None
    ruleText: str = "当实测值 ≤ 标准值时，判定为合格；否则判定为不合格。"


class SaveRuleResponse(BaseModel):
    ok: bool
    message: str
    version: str
    template: RuleTemplate | None = None


class ReportGenerateRequest(BaseModel):
    projectId: str = "p1"
    sectionCategories: dict[str, str] = Field(default_factory=dict)


class ReportGenerateResponse(BaseModel):
    sections: list[ReportSection]
    version: str
    versionEntry: ReportVersion
    message: str


class AddReportSectionRequest(BaseModel):
    title: str
    content: str = ""


class UpdateReportSectionRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    status: ReportSectionStatus | None = None
    categoryId: str | None = None


class ReorderReportSectionsRequest(BaseModel):
    sectionIds: list[str]


class RevisionUploadRequest(BaseModel):
    fileName: str


class DraftResponse(BaseModel):
    version: str
    versionEntry: ReportVersion | None = None


class ExportRequest(BaseModel):
    scope: str
    format: Literal["word", "pdf"]


class ExportResponse(BaseModel):
    fileName: str
    status: Literal["ready"]
    delivery: ReportDelivery | None = None


class ReportPreviewRequest(BaseModel):
    scope: Literal["report", "section"]
    sectionId: str | None = None


class ReportPreviewResponse(BaseModel):
    fileName: str
    status: Literal["ready"]
    delivery: ReportDelivery | None = None


class RollbackRequest(BaseModel):
    versionId: str
    label: str


class RollbackResponse(BaseModel):
    version: str
    sections: list[ReportSection]
    versionEntry: ReportVersion


class SubmitReportResponse(BaseModel):
    ok: bool
    status: Literal["待审核"]
