import {
  extractedFields,
  logs,
  messages,
  parseEvents,
  projectMetrics,
  projects,
  rawFiles,
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
  Project,
  RawFile,
  ReportSection,
  SystemMessage,
  UpdateProjectRequest
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
  async files() {
    return withFallback(() => requestJson<typeof rawFiles>("/records/files"), rawFiles);
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
  previewFile(fileId: string) {
    return requestJson<{ file: RawFile; previewType: string; message: string }>(
      `/records/files/${fileId}/preview`
    );
  },
  exportResults() {
    return postJson<{ fileName: string; formats: string[]; status: "ready" }>("/records/exports", {
      projectId: "p1",
      formats: ["excel", "json", "package"]
    });
  },
  uploadFiles(files: Array<Pick<RawFile, "name" | "type" | "size" | "detectedType">>) {
    return postJson<{
      files: RawFile[];
      parseEvents: Record<string, typeof parseEvents>;
      fields: Record<string, ExtractedField[]>;
    }>("/records/uploads", { files });
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
  generate(sectionCategories: Record<string, string>) {
    return postJson<{ sections: ReportSection[]; version: string; message: string }>("/reports/generate", {
      projectId: "p1",
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
