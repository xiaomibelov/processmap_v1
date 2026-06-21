import { useCallback, useEffect, useMemo, useState } from "react";

import { apiAdminCreateUser, apiAdminListUsers, apiAdminPatchUser } from "../../../../lib/api";
import { useUserAccessForm } from "../../hooks/useUserAccessForm.js";
import { AvatarInitials } from "../users/AvatarInitials.jsx";
import { PermissionMatrix } from "../users/PermissionMatrix.jsx";
import { UserDrawer } from "../users/UserDrawer.jsx";
import { UserFilters } from "../users/UserFilters.jsx";
import { UsersTable } from "../users/UsersTable.jsx";
import { filterUsers, formatRoleLabel, normalizePermissions, toText } from "../users/userAccessUtils.js";
import SectionCard from "../common/SectionCard";

function getUserIdentity(user = {}) {
  const fullName = toText(user?.full_name || user?.fullName);
  const email = toText(user?.email);
  const _jobTitle = toText(user?.job_title || user?.jobTitle);
  void _jobTitle;
  return {
    primary: fullName || email || "—",
    secondary: fullName && email ? email : "",
  };
}

export default function AdminUsersPanel({
  isAdmin = false,
  activeOrgId = "",
  orgOptions = [],
}) {
  const normalizedOrgOptions = useMemo(() => {
    const rows = Array.isArray(orgOptions) ? orgOptions : [];
    return rows
      .map((row) => ({
        org_id: toText(row?.org_id || row?.id),
        name: toText(row?.name || row?.org_name || row?.org_id || row?.id),
      }))
      .filter((row) => row.org_id);
  }, [orgOptions]);

  const fallbackOrgId = toText(activeOrgId || normalizedOrgOptions[0]?.org_id);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const form = useUserAccessForm({ user: selectedUser, orgOptions, fallbackOrgId });

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError("");
    const res = await apiAdminListUsers();
    setLoading(false);
    if (!res.ok) {
      setUsers([]);
      setError(toText(res.error || "Не удалось загрузить пользователей."));
      return;
    }
    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    setUsers(items);
  }, [isAdmin]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(
    () => filterUsers(users, { query, filter }),
    [filter, query, users]
  );

  function handleNewUser() {
    setSelectedUser(null);
    form.reset(null);
    setDrawerOpen(true);
  }

  function handleEditUser(user) {
    setSelectedUser(user);
    form.reset(user);
    setDrawerOpen(true);
  }

  function handleCloseDrawer() {
    setDrawerOpen(false);
    setSelectedUser(null);
    form.reset(null);
  }

  async function handleSaveUser(user, payload) {
    setLoading(true);
    setError("");
    setNotice("");
    const isEdit = Boolean(user?.id);
    const res = isEdit
      ? await apiAdminPatchUser(user.id, payload)
      : await apiAdminCreateUser({ ...payload, password: payload.password });
    setLoading(false);
    if (!res.ok) {
      return { ok: false, error: toText(res.error || "Не удалось сохранить пользователя.") };
    }
    setNotice(isEdit ? "Пользователь обновлён." : "Пользователь создан.");
    await loadUsers();
    return { ok: true };
  }

  function handleDeleteUser(user) {
    const identity = getUserIdentity(user);
    if (typeof window !== "undefined" && window.confirm) {
      const ok = window.confirm(`Удаление пользователя «${identity.primary}» пока не реализовано.`);
      if (!ok) return;
    }
    setNotice("Удаление пользователя пока не реализовано.");
  }

  if (!isAdmin) {
    return (
      <SectionCard
        eyebrow="Доступ"
        title="Пользователи платформы"
        subtitle="Управление пользователями и их доступом к организациям."
      >
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div className="font-semibold text-slate-950">Пользователи платформы доступны только администратору платформы.</div>
          <div className="mt-1 text-slate-600">Вы управляете участниками выбранной организации в блоке доступа организации.</div>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      eyebrow="Доступ"
      title="Пользователи платформы"
      subtitle="Управление пользователями и их доступом к организациям."
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <UserFilters query={query} onQueryChange={setQuery} filter={filter} onFilterChange={setFilter} />
          <button
            type="button"
            onClick={handleNewUser}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Добавить пользователя
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}
        {loading && users.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">Загрузка пользователей…</div>
        ) : (
          <UsersTable
            users={filteredUsers}
            onEdit={handleEditUser}
            onDelete={handleDeleteUser}
          />
        )}
      </div>

      {drawerOpen ? (
        <UserDrawer
          user={selectedUser}
          orgOptions={orgOptions}
          fallbackOrgId={fallbackOrgId}
          onClose={handleCloseDrawer}
          onSave={handleSaveUser}
          submitting={loading}
        />
      ) : null}
    </SectionCard>
  );
}

export { AvatarInitials, PermissionMatrix, UserDrawer, UserFilters, UsersTable, filterUsers, formatRoleLabel, getUserIdentity, normalizePermissions };
