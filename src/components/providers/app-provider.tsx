"use client";

import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { messageApi, projectApi, authApi } from "@/lib/services/api";
import type { AppUser, AuthSession, Project, SystemMessage } from "@/lib/types/domain";

const SESSION_KEY = "report-generator.session";
const CURRENT_PROJECT_KEY = "report-generator.current-project-id";

type AppContextValue = {
  user: AppUser | null;
  session: AuthSession | null;
  authReady: boolean;
  projects: Project[];
  currentProject: Project | null;
  messages: SystemMessage[];
  unreadCount: number;
  login: (session: AuthSession) => void;
  logout: () => Promise<void>;
  switchProject: (projectId: string) => void;
  markMessageRead: (messageId: string) => Promise<void>;
  markAllMessagesRead: () => Promise<void>;
  refreshMessages: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

function readSession() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as Partial<AuthSession>;
    const expiresAt = session.expiresAt ? new Date(session.expiresAt).getTime() : Number.NaN;
    if (
      !session.token ||
      !session.user ||
      !session.authenticatedAt ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session as AuthSession;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function writeSession(session: AuthSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState("");
  const [messages, setMessages] = useState<SystemMessage[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);

  const publicRoute = pathname === "/login" || pathname === "/forgot-password";

  useEffect(() => {
    const stored = readSession();
    setSession(stored);
    setAuthReady(true);
    if (!stored) return;

    let mounted = true;
    authApi
      .me()
      .then((refreshed) => {
        if (!mounted) return;
        writeSession(refreshed);
        setSession(refreshed);
      })
      .catch(() => {
        // Keep a still-valid local session when the API is temporarily unavailable.
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!authReady || publicRoute) return;
    if (!session) router.replace("/login");
  }, [authReady, publicRoute, router, session]);

  useEffect(() => {
    if (!session) return;

    let mounted = true;
    setWorkspaceLoading(true);
    Promise.all([projectApi.list(), messageApi.list()])
      .then(([nextProjects, nextMessages]) => {
        if (!mounted) return;
        setProjects(nextProjects);
        setMessages(nextMessages);

        const storedProjectId = window.localStorage.getItem(CURRENT_PROJECT_KEY) ?? "";
        const fallbackProjectId = nextProjects[0]?.id ?? "";
        const validProjectId = nextProjects.some((project) => project.id === storedProjectId)
          ? storedProjectId
          : fallbackProjectId;
        setCurrentProjectId(validProjectId);
        if (validProjectId) window.localStorage.setItem(CURRENT_PROJECT_KEY, validProjectId);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setWorkspaceLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session]);

  const currentProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId) ?? projects[0] ?? null,
    [currentProjectId, projects]
  );

  const unreadCount = useMemo(() => messages.filter((message) => !message.read).length, [messages]);

  const login = useCallback((nextSession: AuthSession) => {
    writeSession(nextSession);
    setSession(nextSession);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    writeSession(null);
    window.localStorage.removeItem(CURRENT_PROJECT_KEY);
    setSession(null);
    setProjects([]);
    setMessages([]);
    setCurrentProjectId("");
    router.replace("/login");
  }, [router]);

  const switchProject = useCallback((projectId: string) => {
    setCurrentProjectId(projectId);
    window.localStorage.setItem(CURRENT_PROJECT_KEY, projectId);
  }, []);

  const markMessageRead = useCallback(async (messageId: string) => {
    let changed = false;
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId || message.read) return message;
        changed = true;
        return { ...message, read: true };
      })
    );
    if (!changed) return;
    try {
      await messageApi.markRead(messageId);
    } catch {
      setMessages((current) =>
        current.map((message) => (message.id === messageId ? { ...message, read: false } : message))
      );
    }
  }, []);

  const markAllMessagesRead = useCallback(async () => {
    const unreadIds = new Set(messages.filter((message) => !message.read).map((message) => message.id));
    if (!unreadIds.size) return;
    setMessages((current) => current.map((message) => ({ ...message, read: true })));
    try {
      await messageApi.markAllRead();
    } catch {
      setMessages((current) =>
        current.map((message) =>
          unreadIds.has(message.id) ? { ...message, read: false } : message
        )
      );
    }
  }, [messages]);

  const refreshMessages = useCallback(async () => {
    const nextMessages = await messageApi.list();
    setMessages(nextMessages);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      authReady,
      projects,
      currentProject,
      messages,
      unreadCount,
      login,
      logout,
      switchProject,
      markMessageRead,
      markAllMessagesRead,
      refreshMessages
    }),
    [
      authReady,
      currentProject,
      login,
      logout,
      markAllMessagesRead,
      markMessageRead,
      messages,
      projects,
      refreshMessages,
      session,
      switchProject,
      unreadCount
    ]
  );

  if (!publicRoute && authReady && !session) {
    return <div className="min-h-screen bg-parchment-cream" />;
  }

  if (!publicRoute && session && workspaceLoading && projects.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center bg-parchment-cream p-6">
        <div className="rounded-lg border border-ink-black bg-parchment-cream px-5 py-4 text-sm shadow-editorial">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            正在同步项目和消息
          </span>
        </div>
      </div>
    );
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useAppContext must be used within AppProvider");
  return value;
}
