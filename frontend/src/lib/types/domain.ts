export type ProjectStatus = "解析中" | "待生成" | "待审核" | "待上传" | "已完成";
export type ProjectVisibility = "public" | "private";

export type Project = {
  id: string;
  name: string;
  code: string;
  type: string;
  owner: string;
  ownerId?: string | null;
  status: ProjectStatus;
  progress: number;
  visibility: ProjectVisibility;
  allowedUserIds: string[];
  updatedAt: string;
};

export type CreateProjectRequest = {
  name: string;
  owner: string;
  type?: string;
  visibility?: ProjectVisibility;
  allowedUserIds?: string[];
};

export type UpdateProjectRequest = {
  name?: string | null;
  owner?: string | null;
  type?: string | null;
  visibility?: ProjectVisibility | null;
  allowedUserIds?: string[] | null;
  status?: ProjectStatus | null;
  progress?: number | null;
};

export type DetectedType = "几何精度" | "位置精度" | "电气参数" | "力学性能" | "综合检测" | "未识别";

export type RawFile = {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
  parseStatus: "解析成功" | "解析失败" | "解析中";
  detectedType: DetectedType;
  typeConfirmed: boolean;
  serverPath?: string | null;
};

export type ParseEvent = {
  time: string;
  label: string;
  state: "done" | "active" | "pending";
};

export type ExtractedField = {
  id: string;
  name: string;
  value: string;
  confidence: number;
  section?: string;
};

export type RuleField = {
  id: string;
  name: string;
  code: string;
  type: "文本" | "数值";
  required: boolean;
  source: "固定值" | "原始记录" | "计算字段" | "规则生成" | "人工填写";
  format: string;
  validation: string;
  example: string;
};

export type RuleTemplate = {
  id: string;
  category: string;
  name: string;
  version: string;
  updatedAt: string;
  fields: RuleField[];
};

export type ReportSection = {
  id: string;
  title: string;
  content: string;
  status: "已生成" | "待完善" | "已校验";
};

export type AppUser = {
  id: string;
  name: string;
  role: "管理员" | "编制员" | "审核员";
  department: string;
  status: "启用" | "禁用";
  lastLogin: string;
};

export type OperationLog = {
  id: string;
  module: string;
  actor: string;
  action: string;
  result: "成功" | "失败" | "警告";
  time: string;
};

export type ProjectMetric = {
  label: string;
  value: string;
  change: string;
};

export type AuthSession = {
  token: string;
  user: AppUser;
  expiresAt: string;
  authenticatedAt: string;
};

export type SystemMessage = {
  id: string;
  title: string;
  content: string;
  module: "项目管理" | "原始记录上传" | "规则配置" | "报告生成" | "系统";
  type: "成功" | "提醒" | "警告" | "失败";
  read: boolean;
  time: string;
  projectId?: string;
};

export type WorkflowJob = {
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  message: string;
  runPaths: Record<string, string>;
  result: Record<string, unknown> | null;
  error: string | null;
  progressEvents: Array<{ at: string; message: string }>;
};

export type RunStatus = {
  runId: string;
  status: string;
  businessStatus: string;
  stage: string;
  message: string;
  artifacts: Array<Record<string, unknown>>;
  staleArtifacts: Array<unknown>;
  issues: Array<unknown>;
  outputs: Record<string, unknown>;
};

export type WorkflowProgressStage =
  | "validate"
  | "prepare"
  | "extract"
  | "generate";

export type WorkflowProgress = {
  stage: WorkflowProgressStage;
  status: "pending" | "active" | "done" | "failed";
  label: string;
  meta: string;
};
