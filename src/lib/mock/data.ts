import type {
  AppUser,
  ExtractedField,
  OperationLog,
  ParseEvent,
  ProjectMetric,
  Project,
  RawFile,
  ReportSection,
  RuleTemplate
} from "@/lib/types/domain";

export const projectMetrics: ProjectMetric[] = [
  { label: "本月完成报告", value: "36", change: "+12% 较上月" },
  { label: "待处理任务", value: "18", change: "-5% 较上月" },
  { label: "解析成功率", value: "92.6%", change: "+3.2% 较上月" },
  { label: "平均生成耗时", value: "28.6 分钟", change: "-8.1% 较上月" }
];

export const projects: Project[] = [
  {
    id: "p1",
    name: "数字化工厂智能制造产线检验",
    code: "PJT-20240520-001",
    type: "几何精度",
    owner: "张工",
    status: "解析中",
    progress: 60,
    updatedAt: "2024-05-20 10:30"
  },
  {
    id: "p2",
    name: "自动化设备安装验收检测",
    code: "PJT-20240519-002",
    type: "位置精度",
    owner: "李工",
    status: "待生成",
    progress: 80,
    updatedAt: "2024-05-20 09:15"
  },
  {
    id: "p3",
    name: "液压开关柜出厂检验",
    code: "PJT-20240519-003",
    type: "电气参数",
    owner: "王工",
    status: "待审核",
    progress: 90,
    updatedAt: "2024-05-19 16:45"
  },
  {
    id: "p4",
    name: "机器人焊接单元精度检测",
    code: "PJT-20240518-004",
    type: "几何精度",
    owner: "赵工",
    status: "待上传",
    progress: 0,
    updatedAt: "2024-05-19 11:20"
  },
  {
    id: "p5",
    name: "产线综合性能检测测试",
    code: "PJT-20240518-005",
    type: "综合检测",
    owner: "陈工",
    status: "已完成",
    progress: 100,
    updatedAt: "2024-05-18 14:35"
  }
];

export const rawFiles: RawFile[] = [
  {
    id: "f1",
    name: "平面度检测记录.xlsx",
    type: "Excel",
    size: "1.12 MB",
    uploadedAt: "2024-05-20 10:30",
    parseStatus: "解析成功",
    detectedType: "几何精度",
    typeConfirmed: false
  },
  {
    id: "f2",
    name: "设备照片_01.jpg",
    type: "JPG",
    size: "3.21 MB",
    uploadedAt: "2024-05-20 10:31",
    parseStatus: "解析失败",
    detectedType: "未识别",
    typeConfirmed: false
  }
];

export const parseEvents: ParseEvent[] = [
  { time: "10:30:15", label: "开始解析文件", state: "done" },
  { time: "10:30:20", label: "表格检测完成，识别到 8 个表格", state: "done" },
  { time: "10:30:30", label: "大模型提取中...", state: "active" },
  { time: "10:30:45", label: "已提取 24/34 个字段", state: "pending" }
];

export const extractedFields: ExtractedField[] = [
  { id: "e1", name: "检验项目", value: "平面度", confidence: 98 },
  { id: "e2", name: "测量位置", value: "左侧工作面", confidence: 96 },
  { id: "e3", name: "实测值", value: "0.012 mm", confidence: 98 },
  { id: "e4", name: "标准值", value: "0.020 mm", confidence: 97 },
  { id: "e5", name: "单位", value: "mm", confidence: 100 },
  { id: "e6", name: "判定结果", value: "合格", confidence: 99 }
];

export const ruleTemplates: RuleTemplate[] = [
  {
    id: "rt1",
    category: "几何精度",
    name: "平面度检测模板",
    version: "v2.1.0",
    updatedAt: "2024-05-18",
    fields: [
      { id: "rf1", name: "检验项目", code: "inspection_item", type: "文本", required: true, source: "固定值", format: "{value}", validation: "必填", example: "平面度" },
      { id: "rf2", name: "测量位置", code: "measure_position", type: "文本", required: true, source: "原始记录", format: "{value}", validation: "必填", example: "左侧工作面" },
      { id: "rf3", name: "实测值", code: "actual_value", type: "数值", required: true, source: "原始记录", format: "{value} mm", validation: "必填，数值范围 -9999 ~ 9999", example: "0.012" },
      { id: "rf4", name: "标准值", code: "standard_value", type: "数值", required: true, source: "固定值", format: "{value} mm", validation: "必填，保留 3 位小数", example: "0.020" },
      { id: "rf5", name: "判定结果", code: "judgement", type: "文本", required: true, source: "规则生成", format: "{value}", validation: "合格/不合格", example: "合格" },
      { id: "rf6", name: "备注", code: "remark", type: "文本", required: false, source: "人工填写", format: "{value}", validation: "非必填", example: "无" }
    ]
  },
  {
    id: "rt2",
    category: "位置精度",
    name: "直线度检测模板",
    version: "v1.8.0",
    updatedAt: "2024-04-26",
    fields: []
  }
];

export const reportSections: ReportSection[] = [
  { id: "s1", title: "封面", status: "已校验", content: "委托单位：某智能制造有限公司\n样品名称：智能制造产线\n型号规格：IML-2405" },
  { id: "s2", title: "检验结论", status: "待完善", content: "经检测，样品几何精度、位置精度和电气参数符合当前模板判定要求。建议补充引用标准编号。" },
  { id: "s3", title: "几何精度检测", status: "已生成", content: "平面度实测值为 0.012 mm，标准值为 0.020 mm，判定结果为合格。" },
  { id: "s4", title: "附件", status: "已生成", content: "原始记录、设备照片、解析日志与规则版本记录。" }
];

export const users: AppUser[] = [
  { id: "u1", name: "张工", role: "编制员", department: "检测一部", status: "启用", lastLogin: "2024-05-20 10:05" },
  { id: "u2", name: "李工", role: "审核员", department: "质量部", status: "启用", lastLogin: "2024-05-20 09:40" },
  { id: "u3", name: "管理员", role: "管理员", department: "系统管理", status: "启用", lastLogin: "2024-05-20 08:18" },
  { id: "u4", name: "赵工", role: "编制员", department: "检测二部", status: "禁用", lastLogin: "2024-05-10 15:20" }
];

export const logs: OperationLog[] = [
  { id: "l1", module: "登录认证", actor: "张工", action: "用户登录", result: "成功", time: "2024-05-20 10:05:12" },
  { id: "l2", module: "原始记录上传", actor: "张工", action: "上传平面度检测记录", result: "成功", time: "2024-05-20 10:30:02" },
  { id: "l3", module: "大模型解析", actor: "系统", action: "解析设备照片_01.jpg", result: "失败", time: "2024-05-20 10:31:15" },
  { id: "l4", module: "规则配置", actor: "管理员", action: "保存平面度判定规则", result: "成功", time: "2024-05-18 16:22:08" },
  { id: "l5", module: "报告生成", actor: "张工", action: "提交审核", result: "警告", time: "2024-05-20 11:20:36" }
];
