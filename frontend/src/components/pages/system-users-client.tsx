"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Ban, CheckCircle, Eye, EyeOff, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/forms";
import { Pagination } from "@/components/ui/pagination";
import { DataTable, Td } from "@/components/ui/table";
import { systemApi } from "@/lib/services/api";
import type { AppUser } from "@/lib/types/domain";

type UserFormState = Pick<AppUser, "name" | "role" | "department" | "status"> & { password?: string };

const EMPTY_USER_FORM: UserFormState = {
  name: "",
  role: "编制员",
  department: "",
  status: "启用",
  password: "",
};

export function SystemUsersClient({ users: initialUsers }: { users: AppUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [keyword, setKeyword] = useState("");
  const [role, setRole] = useState<AppUser["role"] | "全部角色">("全部角色");
  const [status, setStatus] = useState<AppUser["status"] | "全部状态">("全部状态");
  const [notice, setNotice] = useState("用户列表已从 Core API 加载。");
  const [userDialogMode, setUserDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(EMPTY_USER_FORM);
  const [formError, setFormError] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  const [statusLoadingUserId, setStatusLoadingUserId] = useState<string | null>(null);
  const [deleteLoadingUserId, setDeleteLoadingUserId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredUsers = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return users.filter((user) => {
      const matchKeyword = !q || `${user.name} ${user.department}`.toLowerCase().includes(q);
      const matchRole = role === "全部角色" || user.role === role;
      const matchStatus = status === "全部状态" || user.status === status;
      return matchKeyword && matchRole && matchStatus;
    });
  }, [keyword, role, status, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedUsers = useMemo(
    () => filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredUsers, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [keyword, role, status]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function openCreateDialog() {
    setUserForm(EMPTY_USER_FORM);
    setEditingUserId(null);
    setFormError("");
    setShowPassword(false);
    setUserDialogMode("create");
  }

  function openEditDialog(user: AppUser) {
    setUserForm({
      name: user.name,
      role: user.role,
      department: user.department,
      status: user.status,
    });
    setEditingUserId(user.id);
    setFormError("");
    setUserDialogMode("edit");
  }

  function closeUserDialog() {
    if (savingUser) return;
    setUserDialogMode(null);
    setEditingUserId(null);
    setFormError("");
  }

  async function handleSubmitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: UserFormState & { password?: string } = {
      ...userForm,
      name: userForm.name.trim(),
      department: userForm.department.trim(),
    };

    if (!payload.name || !payload.department) {
      setFormError("请填写用户名和所属部门后再保存。");
      return;
    }

    if (userDialogMode === "create" && users.some((u) => u.name === payload.name)) {
      setFormError(`用户名「${payload.name}」已存在，请使用不同的用户名。`);
      return;
    }

    setSavingUser(true);
    try {
      if (userDialogMode === "create") {
        const created = await systemApi.createUser(payload);
        setUsers((current) => [created, ...current]);
        setPage(1);
        setNotice(`已新增用户「${created.name}」。`);
      } else if (userDialogMode === "edit" && editingUserId) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _pw, ...editPayload } = payload;
        const updated = await systemApi.updateUser(editingUserId, editPayload);
        setUsers((current) => current.map((item) => (item.id === editingUserId ? updated : item)));
        setNotice(`已保存「${updated.name}」的用户信息。`);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("409")) {
        setFormError(`用户名「${payload.name}」已存在，请使用不同的用户名。`);
        setSavingUser(false);
        return;
      }
      if (userDialogMode === "create") {
        const created: AppUser = {
          id: `usr-local-${Date.now()}`,
          ...payload,
          lastLogin: "刚刚",
        };
        setUsers((current) => [created, ...current]);
        setPage(1);
        setNotice(`Core API 暂不可用，已在前端 mock 中新增用户「${created.name}」。`);
      } else if (userDialogMode === "edit" && editingUserId) {
        setUsers((current) =>
          current.map((item) => (item.id === editingUserId ? { ...item, ...payload } : item))
        );
        setNotice(`Core API 暂不可用，已在前端 mock 中保存「${payload.name}」的用户信息。`);
      }
    } finally {
      setSavingUser(false);
      setUserDialogMode(null);
      setEditingUserId(null);
    }
  }

  async function handleToggleStatus(user: AppUser) {
    if (statusLoadingUserId) return;
    const nextStatus = user.status === "启用" ? "禁用" : "启用";
    setStatusLoadingUserId(user.id);
    try {
      const updated = await systemApi.updateUserStatus(user.id, nextStatus);
      setUsers((current) => current.map((item) => (item.id === user.id ? updated : item)));
      setNotice(`已${nextStatus}用户「${updated.name}」。`);
    } catch {
      setNotice("账号状态接口暂不可用，请确认 Core API 服务状态。");
    } finally {
      setStatusLoadingUserId(null);
    }
  }

  function openDeleteDialog(user: AppUser) {
    setDeleteTarget(user);
    setDeleteConfirmText("");
  }

  function closeDeleteDialog() {
    setDeleteTarget(null);
    setDeleteConfirmText("");
  }

  async function handleDeleteUser() {
    if (!deleteTarget || deleteConfirmText.trim() !== deleteTarget.name) return;
    setDeleteLoadingUserId(deleteTarget.id);
    try {
      await systemApi.deleteUser(deleteTarget.id);
      setUsers((current) => current.filter((u) => u.id !== deleteTarget.id));
      setNotice(`已删除用户「${deleteTarget.name}」。`);
    } catch {
      setNotice("删除用户接口暂不可用，请确认 Core API 服务状态。");
    } finally {
      setDeleteLoadingUserId(null);
      closeDeleteDialog();
    }
  }

  const isActionDisabled = Boolean(statusLoadingUserId) || Boolean(deleteLoadingUserId);

  return (
    <>
      <SectionHeader
        eyebrow="System Management"
        title="用户管理"
        action={
          <Button variant="primary" onClick={openCreateDialog} disabled={savingUser || Boolean(statusLoadingUserId)}><Plus className="size-4" />新增用户</Button>
        }
      />
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <Input
            className="w-full sm:w-80"
            placeholder="搜索用户名、部门"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Select value={role} onChange={(event) => setRole(event.target.value as AppUser["role"] | "全部角色")}>
            <option>全部角色</option>
            <option>管理员</option>
            <option>编制员</option>
            <option>审核员</option>
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value as AppUser["status"] | "全部状态")}>
            <option>全部状态</option>
            <option>启用</option>
            <option>禁用</option>
          </Select>
        </div>
        <DataTable
          headers={["用户名", "角色", "所属部门", "账号状态", "最近登录", "操作"]}
          columns={["20%", "12%", "18%", "12%", "20%", "18%"]}
        >
          {pagedUsers.map((user) => {
            const ToggleIcon = user.status === "启用" ? Ban : CheckCircle;
            const toggleLabel = user.status === "启用" ? "禁用" : "启用";
            const isLoading = statusLoadingUserId === user.id || deleteLoadingUserId === user.id;
            return (
            <tr key={user.id}>
              <Td>{user.name}</Td>
              <Td>{user.role}</Td>
              <Td>{user.department}</Td>
              <Td><Badge tone={user.status === "启用" ? "success" : "danger"}>{user.status}</Badge></Td>
              <Td>{user.lastLogin}</Td>
              <Td>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    title="编辑"
                    aria-label={`编辑用户 ${user.name}`}
                    disabled={isActionDisabled}
                    onClick={() => openEditDialog(user)}
                    className="focus-ring inline-flex size-8 items-center justify-center rounded-md border border-ink-black/20 text-ink-black transition hover:border-ink-black hover:bg-ink-black hover:text-parchment-cream disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    title={toggleLabel}
                    aria-label={`${toggleLabel}用户 ${user.name}`}
                    disabled={isActionDisabled}
                    onClick={() => handleToggleStatus(user)}
                    className="focus-ring inline-flex size-8 items-center justify-center rounded-md border border-ink-black/20 text-ink-black transition hover:border-ink-black hover:bg-ink-black hover:text-parchment-cream disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {isLoading && user.id === statusLoadingUserId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ToggleIcon className="size-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    title="删除"
                    aria-label={`删除用户 ${user.name}`}
                    disabled={isActionDisabled}
                    onClick={() => openDeleteDialog(user)}
                    className="focus-ring inline-flex size-8 items-center justify-center rounded-md border border-red-900/25 text-red-900 transition hover:border-red-950 hover:bg-red-950 hover:text-parchment-cream disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </Td>
            </tr>
          );
          })}
        </DataTable>
        <Pagination
          className="mt-4"
          page={currentPage}
          pageSize={pageSize}
          total={filteredUsers.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
        <p className="mt-4 text-sm text-warm-stone">{notice}</p>
      </Card>

      {userDialogMode ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm"
          onClick={closeUserDialog}
        >
          <form
            className="w-full max-w-[560px] rounded-[14px] border border-ink-black bg-parchment-cream p-5 shadow-editorial"
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleSubmitUser}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mono-label text-warm-stone">USER ACCOUNT</p>
                <h2 className="serif mt-1 text-3xl">{userDialogMode === "create" ? "新增用户" : "编辑用户"}</h2>
                <p className="mt-2 text-sm text-graphite">
                  选择用户角色、账号状态和所属部门后保存，系统将同步更新用户管理列表。
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭用户表单"
                className="rounded-md p-1 text-ink-black transition hover:bg-ink-black/10"
                onClick={closeUserDialog}
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-graphite">用户名</span>
                <Input
                  autoFocus
                  value={userForm.name}
                  placeholder="请输入用户名"
                  disabled={savingUser}
                  onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-graphite">所属部门</span>
                <Input
                  value={userForm.department}
                  placeholder="例如：质量检测部"
                  disabled={savingUser}
                  onChange={(event) => setUserForm((current) => ({ ...current, department: event.target.value }))}
                  className="w-full"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-graphite">角色</span>
                <Select
                  value={userForm.role}
                  disabled={savingUser}
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, role: event.target.value as AppUser["role"] }))
                  }
                  className="w-full"
                >
                  {userDialogMode === "edit" ? <option>管理员</option> : null}
                  <option>编制员</option>
                  <option>审核员</option>
                </Select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-graphite">账号状态</span>
                <Select
                  value={userForm.status}
                  disabled={savingUser}
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, status: event.target.value as AppUser["status"] }))
                  }
                  className="w-full"
                >
                  <option>启用</option>
                  <option>禁用</option>
                </Select>
              </label>
            </div>

            {userDialogMode === "create" ? (
              <div className="mt-4">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-graphite">登录密码</span>
                  <div className="relative">
                    <Input
                      className="w-full pr-10"
                      type={showPassword ? "text" : "password"}
                      value={userForm.password ?? ""}
                      placeholder="留空则使用系统默认密码"
                      disabled={savingUser}
                      onChange={(event) =>
                        setUserForm((current) => ({ ...current, password: event.target.value }))
                      }
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                      className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-graphite transition hover:bg-ink-black/10"
                      disabled={savingUser}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                </label>
              </div>
            ) : null}

            {formError ? (
              <p className="mt-4 rounded-md border border-red-900/25 bg-red-50 px-3 py-2 text-sm text-red-900">
                {formError}
              </p>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-ink-black/15 pt-4">
              <Button type="button" variant="ghost" onClick={closeUserDialog} disabled={savingUser}>
                取消
              </Button>
              <Button type="submit" variant="primary" loading={savingUser} loadingText="保存中">
                <Save className="size-4" />
                保存用户
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink-black/35 p-4 backdrop-blur-sm"
          onClick={closeDeleteDialog}
        >
          <div
            className="w-full max-w-[560px] rounded-[14px] border border-ink-black bg-parchment-cream p-5 shadow-editorial"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mono-label text-warm-stone">DELETE USER</p>
                <h2 className="serif mt-1 text-3xl">确认删除用户</h2>
                <p className="mt-2 text-sm text-graphite">
                  删除后该用户将无法登录系统。请输入用户名称确认删除。
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭删除确认"
                className="rounded-md p-1 transition hover:bg-ink-black/10"
                onClick={closeDeleteDialog}
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-5 rounded-lg border border-ink-black/15 p-3">
              <p className="font-medium">{deleteTarget.name}</p>
              <p className="mt-1 text-sm text-warm-stone">{deleteTarget.role} · {deleteTarget.department}</p>
            </div>
            <label className="mt-4 block space-y-2">
              <span className="text-sm font-medium text-graphite">输入用户名：{deleteTarget.name}</span>
              <Input
                autoFocus
                className="w-full"
                value={deleteConfirmText}
                placeholder="输入完整用户名后才能删除"
                onChange={(event) => setDeleteConfirmText(event.target.value)}
              />
            </label>
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-ink-black/15 pt-4">
              <Button type="button" variant="ghost" onClick={closeDeleteDialog}>取消</Button>
              <Button
                type="button"
                variant="danger"
                disabled={deleteConfirmText.trim() !== deleteTarget.name}
                onClick={handleDeleteUser}
              >
                <Trash2 className="size-4" />
                确认删除
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
