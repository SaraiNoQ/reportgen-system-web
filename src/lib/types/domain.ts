export type ProjectStatus = "解析中" | "待生成" | "待审核" | "待上传" | "已完成";

export type Project = {
  id: string;
  name: string;
  code: string;
  type: string;
  owner: string;
  status: ProjectStatus;
  progress: number;
  updatedAt: string;
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
