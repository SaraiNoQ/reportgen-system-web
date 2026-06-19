import {
  extractedFields,
  logs,
  messages,
  parseEvents,
  projectMetrics,
  projects,
  reportSections,
  ruleTemplates,
  users
} from "@/lib/mock/data";
import type {
  AppUser,
  AuthSession,
  CreateProjectRequest,
  DetectedType,
  ExtractedField,
  OperationLog,
  ParseEvent,
  Project,
  RawFile,
  ReportSection,
  RunStatus,
  SystemMessage,
  UpdateProjectRequest,
  WorkflowJob
} from "@/lib/types/domain";

const wait = async () => new Promise((resolve) => setTimeout(resolve, 120));

const API_BASE =
  process.env.NEXT_PUBLIC_CORE_API_URL ??
  process.env.CORE_API_URL ??
  "http://127.0.0.1:8000/api/v1";

class CoreApiError extends Error {
  constructor(
    public status: number,
    path: string
  ) {
    super(`Core API ${status}: ${path}`);
  }
}

function authHeader() {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem("report-generator.session");
  if (!raw) return {};

  try {
    const session = JSON.parse(raw) as AuthSession;
    return session.token ? { Authorization: `Bearer ${session.token}` } : {};
  } catch {
    return {};
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const auth = authHeader();
  if (auth.Authorization) headers.set("Authorization", auth.Authorization);

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers
  });

  if (!response.ok) {
    throw new CoreApiError(response.status, path);
  }

  return response.json() as Promise<T>;
}

function downloadFileName(response: Response, fallback: string) {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] ? decodeURIComponent(asciiMatch[1]) : fallback;
}

async function downloadFromPost(path: string, body: unknown, fallbackFileName: string) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  const auth = authHeader();
  if (auth.Authorization) headers.set("Authorization", auth.Authorization);

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new CoreApiError(response.status, path);
  }

  const blob = await response.blob();
  const fileName = downloadFileName(response, fallbackFileName);
  if (typeof window !== "undefined") {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }
  return { fileName, status: "ready" as const };
}

async function blobFromPost(path: string, body: unknown, fallbackFileName: string) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  const auth = authHeader();
  if (auth.Authorization) headers.set("Authorization", auth.Authorization);

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new CoreApiError(response.status, path);
  }

  return {
    blob: await response.blob(),
    fileName: downloadFileName(response, fallbackFileName),
    status: "ready" as const
  };
}

async function withFallback<T>(request: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await request();
  } catch {
    await wait();
    return fallback;
  }
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function patchJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}

function deleteJson<T>(path: string): Promise<T> {
  return requestJson<T>(path, { method: "DELETE" });
}

type AuthResponse = {
  ok: boolean;
  accessToken: string;
  expiresAt?: string;
  authenticatedAt?: string;
  user: AppUser;
};

function tokenExpiry(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as { exp?: number };
    if (payload.exp) return new Date(payload.exp * 1000).toISOString();
  } catch {
    // The mock adapter uses an opaque token.
  }
  return new Date(Date.now() + 1000 * 60 * 60).toISOString();
}

function normalizeSession(response: AuthResponse): AuthSession {
  return {
    token: response.accessToken,
    user: response.user,
    expiresAt: response.expiresAt ?? tokenExpiry(response.accessToken),
    authenticatedAt:
      response.authenticatedAt ??
      (response.user.lastLogin && response.user.lastLogin !== "尚未登录"
        ? response.user.lastLogin
        : new Date().toISOString())
  };
}

export const authApi = {
  async login(username: string, password: string) {
    const fallbackUser =
      users.find((user) => user.name === username || user.name === "张工") ?? users[0];
    const fallback: AuthSession = {
      token: `mock-token-${Date.now()}`,
      user: { ...fallbackUser, lastLogin: new Date().toISOString() },
      expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      authenticatedAt: new Date().toISOString()
    };

    try {
      const response = await postJson<AuthResponse>("/auth/login", { username, password });
      return normalizeSession(response);
    } catch (error) {
      if (error instanceof CoreApiError) throw error;
      await wait();
      return fallback;
    }
  },
  async me() {
    const response = await requestJson<AuthResponse>("/auth/me");
    return normalizeSession(response);
  },
  async logout() {
    return withFallback(() => postJson<{ ok: boolean }>("/auth/logout", {}), { ok: true });
  },
  forgotPassword(account: string, contact?: string) {
    return postJson<{ ticketId: string; message: string; expiresInMinutes: number }>(
      "/auth/forgot-password",
      { account, contact }
    );
  }
};

export const projectApi = {
  async list() {
    return withFallback(() => requestJson<Project[]>("/projects"), projects as Project[]);
  },
  async get(projectId: string) {
    return requestJson<Project>(`/projects/${projectId}`);
  },
  async create(payload: CreateProjectRequest) {
    return postJson<Project>("/projects", payload);
  },
  async update(projectId: string, payload: UpdateProjectRequest) {
    return patchJson<Project>(`/projects/${projectId}`, payload);
  },
  async delete(projectId: string) {
    return deleteJson<{ project: Project }>(`/projects/${projectId}`);
  },
  async metrics() {
    return withFallback(() => requestJson<typeof projectMetrics>("/projects/metrics"), projectMetrics);
  }
};

export const messageApi = {
  async list() {
    return withFallback(() => requestJson<SystemMessage[]>("/messages"), messages);
  },
  markRead(messageId: string) {
    return patchJson<SystemMessage>(`/messages/${messageId}/read`, { read: true });
  },
  markAllRead() {
    return patchJson<{ ok: boolean }>("/messages/read-all", {});
  }
};

export const recordApi = {
  async files(projectId?: string) {
    const suffix = projectId ? `?${new URLSearchParams({ projectId }).toString()}` : "";
    return requestJson<RawFile[]>(`/records/files${suffix}`);
  },
  async parseTimeline() {
    return withFallback(() => requestJson<typeof parseEvents>("/records/parse-timeline"), parseEvents);
  },
  fileParseEvents(fileId: string) {
    return requestJson<typeof parseEvents>(`/records/files/${fileId}/parse-events`);
  },
  async fields() {
    return withFallback(() => requestJson<typeof extractedFields>("/records/fields"), extractedFields);
  },
  async fieldsByFile(projectId?: string) {
    const suffix = projectId ? `?${new URLSearchParams({ projectId }).toString()}` : "";
    return requestJson<Record<string, ExtractedField[]>>(`/records/fields-by-file${suffix}`);
  },
  previewFile(fileId: string) {
    return requestJson<{ file: RawFile; previewType: string; message: string }>(
      `/records/files/${fileId}/preview`
    );
  },
  exportResults(projectId: string) {
    return postJson<{ fileName: string; formats: string[]; status: "ready" }>("/records/exports", {
      projectId,
      formats: ["excel", "json", "package"]
    });
  },
  uploadFiles(projectId: string, files: Array<Pick<RawFile, "name" | "type" | "size" | "detectedType">>) {
    return postJson<{
      files: RawFile[];
      parseEvents: Record<string, typeof parseEvents>;
      fields: Record<string, ExtractedField[]>;
    }>("/records/uploads", { projectId, files });
  },
  async uploadFilesWithContent(projectId: string, files: File[]) {
    const form = new FormData();
    form.append("projectId", projectId);
    for (const file of files) {
      form.append("files", file);
    }
    const headers = new Headers();
    const auth = authHeader();
    if (auth.Authorization) headers.set("Authorization", auth.Authorization);
    const response = await fetch(`${API_BASE}/records/upload-files`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!response.ok) {
      throw new CoreApiError(response.status, "/records/upload-files");
    }
    return response.json() as Promise<{
      files: RawFile[];
      parseEvents: Record<string, ParseEvent[]>;
      fields: Record<string, ExtractedField[]>;
    }>;
  },
  updateFileType(fileId: string, detectedType: DetectedType) {
    return patchJson<RawFile>(`/records/files/${fileId}/type`, { detectedType });
  },
  updateFileStatus(fileId: string, parseStatus: RawFile["parseStatus"]) {
    return patchJson<RawFile>(`/records/files/${fileId}/status`, { parseStatus });
  },
  deleteFile(fileId: string) {
    return deleteJson<{ ok: boolean }>(`/records/files/${fileId}`);
  },
  updateField(fileId: string, fieldId: string, value: string) {
    return patchJson<ExtractedField>(`/records/files/${fileId}/fields/${fieldId}`, { value });
  },
  addManualField(fileId: string, name: string, value: string) {
    return postJson<ExtractedField>(`/records/files/${fileId}/fields`, { name, value });
  }
};

export const ruleApi = {
  async templates() {
    await wait();
    return ruleTemplates;
  },
  async saveRule() {
    await wait();
    return { ok: true, message: "规则已保存，并记录版本变更" };
  }
};

export const reportApi = {
  async sections() {
    return withFallback(() => requestJson<typeof reportSections>("/reports/sections"), reportSections);
  },
  generate(projectId: string, sectionCategories: Record<string, string>) {
    return postJson<{ sections: ReportSection[]; version: string; message: string }>("/reports/generate", {
      projectId,
      sectionCategories
    });
  },
  addSection(title: string, content = "") {
    return postJson<ReportSection>("/reports/sections", { title, content });
  },
  updateSection(sectionId: string, payload: Partial<ReportSection> & { categoryId?: string }) {
    return patchJson<ReportSection>(`/reports/sections/${sectionId}`, payload);
  },
  reorderSections(sectionIds: string[]) {
    return patchJson<ReportSection[]>("/reports/sections/order", { sectionIds });
  },
  deleteSection(sectionId: string) {
    return deleteJson<{ ok: boolean }>(`/reports/sections/${sectionId}`);
  },
  uploadRevision(sectionId: string, fileName: string) {
    return postJson<{ version: string }>(`/reports/sections/${sectionId}/revision`, { fileName });
  },
  saveDraft() {
    return postJson<{ version: string }>("/reports/drafts", {});
  },
  export(scope: string, format: "word" | "pdf") {
    return postJson<{ fileName: string; status: "ready" }>("/reports/exports", { scope, format });
  },
  generatedExportStatus(scope: string, format: "word" | "pdf", filePath: string) {
    return postJson<{
      format: "word" | "pdf";
      exists: boolean;
      fileName: string;
      filePath?: string | null;
      deliveryRecorded: boolean;
    }>("/reports/export-status", { scope, format, filePath });
  },
  downloadGeneratedReport(scope: string, format: "word" | "pdf", filePath: string) {
    const suffix = format === "word" ? "docx" : "pdf";
    return downloadFromPost("/reports/exports", { scope, format, filePath }, `${scope}_检测报告.${suffix}`);
  },
  fetchGeneratedReportBlob(scope: string, format: "word" | "pdf", filePath: string) {
    const suffix = format === "word" ? "docx" : "pdf";
    return blobFromPost("/reports/exports", { scope, format, filePath }, `${scope}_检测报告.${suffix}`);
  },
  preview(scope: "report" | "section", sectionId?: string) {
    return postJson<{ fileName: string; status: "ready" }>("/reports/previews", {
      scope,
      sectionId
    });
  },
  rollback(versionId: string, label: string) {
    return postJson<{ version: string; sections: ReportSection[] }>("/reports/versions/rollback", {
      versionId,
      label
    });
  },
  async submit() {
    await wait();
    return { ok: true, status: "待审核" as const };
  }
};

export const systemApi = {
  async users() {
    return withFallback(() => requestJson<typeof users>("/system/users"), users);
  },
  createUser(payload: Pick<AppUser, "name" | "role" | "department" | "status"> & { password?: string }) {
    return postJson<AppUser>("/system/users", payload);
  },
  importUsers() {
    return postJson<{ users: AppUser[]; imported: number }>("/system/users/import", {});
  },
  updateUser(userId: string, payload: Partial<Pick<AppUser, "name" | "role" | "department" | "status">>) {
    return patchJson<AppUser>(`/system/users/${userId}`, payload);
  },
  updateUserStatus(userId: string, status: AppUser["status"]) {
    return patchJson<AppUser>(`/system/users/${userId}/status?status=${encodeURIComponent(status)}`, {});
  },
  deleteUser(userId: string) {
    return deleteJson<AppUser>(`/system/users/${userId}`);
  },
  async logs(params?: { q?: string; module?: string; result?: OperationLog["result"] | "全部结果"; actor?: string }) {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.module && params.module !== "全部模块") query.set("module", params.module);
    if (params?.result && params.result !== "全部结果") query.set("result", params.result);
    if (params?.actor) query.set("actor", params.actor);
    const suffix = query.size ? `?${query.toString()}` : "";
    return withFallback(() => requestJson<typeof logs>(`/system/logs${suffix}`), logs);
  },
  exportLogs(params?: { q?: string; module?: string; result?: OperationLog["result"] | "全部结果"; actor?: string }) {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.module && params.module !== "全部模块") query.set("module", params.module);
    if (params?.result && params.result !== "全部结果") query.set("result", params.result);
    if (params?.actor) query.set("actor", params.actor);
    const suffix = query.size ? `?${query.toString()}` : "";
    return requestJson<{ fileName: string; rows: number; status: "ready" }>(`/system/logs/export${suffix}`);
  },
  logDetail(logId: string) {
    return requestJson<{ log: OperationLog; detail: string }>(`/system/logs/${logId}`);
  }
};

export const genReportApi = {
  /** Trigger a full report-generation workflow for the given project. */
  runProjectWorkflow(projectId: string) {
    return postJson<WorkflowJob>("/gen-report/projects/runs", { projectId });
  },
  /** Build a project workspace and run only field extraction. */
  extractProjectFields(projectId: string) {
    return postJson<WorkflowJob>("/gen-report/projects/extract", { projectId });
  },
  /** Poll the state of a workflow job. */
  getJob(jobId: string) {
    return requestJson<WorkflowJob>(`/gen-report/jobs/${jobId}`);
  },
  /** Read the latest status of a report run. */
  getRunStatus(runId: string) {
    return requestJson<RunStatus>(`/gen-report/runs/${runId}/status`);
  },
  /** Get extracted fields from a run's fill_payloads. */
  getRunFields(runId: string) {
    return requestJson<{ fields: ExtractedField[]; sections: string[] }>(`/gen-report/runs/${runId}/fields`);
  },
  /** Set a field value in a run's fill payload. */
  setRunField(runId: string, section: string, field: string, value: string) {
    return postJson<{ status: string }>(`/gen-report/runs/${runId}/set-field`, { section, field, value });
  },
  /** Approve a run's review package. */
  approveRun(runId: string) {
    return postJson<{ status: string; approval: boolean; message: string }>(
      `/gen-report/runs/${runId}/approve`, {}
    );
  },
  /** Generate report documents for a run. */
  generateRun(runId: string, section?: string | null) {
    return postJson<{ status: string; sections: Record<string, string>; message: string; final_report?: string; finalReport?: string }>(
      `/gen-report/runs/${runId}/generate`,
      section ? { section } : {}
    );
  },
  /** Open the generated report or workspace in the desktop/backend environment. */
  openOutput(runId: string, target: "final_report" | "workspace") {
    return postJson<{ status: string; path?: string; message?: string }>(`/gen-report/runs/${runId}/open-output`, {
      target
    });
  },
};
