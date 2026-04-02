import { useCallback, useEffect, useMemo, useState } from "react";

import { apiAdminCreateUser, apiAdminListUsers, apiAdminPatchUser } from "../../../../lib/api";
import { USER_FACING_ROLE_OPTIONS, formatRoleWithScope, toMembershipRoleValue } from "../../adminRoles";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";

function toText(value) {
  return String(value || "").trim();
}

function blankMembership(orgId = "") {
  return { org_id: toText(orgId), role: "editor" };
}

function normalizeMemberships(items = [], fallbackOrgId = "") {
  const rows = Array.isArray(items) ? items : [];
  const seen = new Set();
  const out = [];
  rows.forEach((row) => {
    const orgId = toText(row?.org_id);
    if (!orgId || seen.has(orgId)) return;
    out.push({
      org_id: orgId,
      role: toMembershipRoleValue(row?.role || "editor"),
    });
    seen.add(orgId);
  });
  if (out.length > 0) return out;
  return fallbackOrgId ? [blankMembership(fallbackOrgId)] : [blankMembership("")];
}

function formatTs(ts) {
  const value = Number(ts || 0);
  if (!Number.isFinite(value) || value <= 0) return "—";
  try {
    return new Date(value * 1000).toLocaleString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [memberships, setMemberships] = useState(normalizeMemberships([], fallbackOrgId));

  const resetForm = useCallback((nextUser = null) => {
    const user = nextUser && typeof nextUser === "object" ? nextUser : null;
    setSelectedUserId(toText(user?.id));
    setEmail(toText(user?.email));
    setPassword("");
    setIsActive(user ? Boolean(user?.is_active) : true);
    setIsPlatformAdmin(Boolean(user?.is_admin));
    setMemberships(normalizeMemberships(user?.memberships || [], fallbackOrgId));
    setError("");
    setNotice("");
  }, [fallbackOrgId]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setBusy(true);
    setError("");
    const res = await apiAdminListUsers();
    setBusy(false);
    if (!res.ok) {
      setUsers([]);
      setError(toText(res.error || "Не удалось загрузить пользователей."));
      return;
    }
    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    setUsers(items);
    if (selectedUserId) {
      const selected = items.find((row) => toText(row?.id) === selectedUserId);
      if (selected) {
        resetForm(selected);
        return;
      }
      resetForm(null);
      return;
    }
    if (!selectedUserId) {
      resetForm(null);
    }
  }, [isAdmin, resetForm, selectedUserId]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setMemberships((prev) => normalizeMemberships(prev, fallbackOrgId));
  }, [fallbackOrgId]);

  if (!isAdmin) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    const nextEmail = toText(email).toLowerCase();
    if (!nextEmail) {
      setError("Укажите email.");
      return;
    }
    const nextMemberships = isPlatformAdmin ? [] : normalizeMemberships(memberships, fallbackOrgId);
    if (!selectedUserId && password.length < 8) {
      setError("Для нового пользователя нужен пароль не короче 8 символов.");
      return;
    }
    if (!isPlatformAdmin && nextMemberships.length <= 0) {
      setError("Нужно назначить хотя бы одну организацию.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const payload = {
      email: nextEmail,
      is_admin: isPlatformAdmin,
      is_active: isActive,
      memberships: nextMemberships,
    };
    if (password) payload.password = password;
    const res = selectedUserId
      ? await apiAdminPatchUser(selectedUserId, payload)
      : await apiAdminCreateUser({ ...payload, password });
    setBusy(false);
    if (!res.ok) {
      setError(toText(res.error || "Не удалось сохранить пользователя."));
      return;
    }
    const item = res.data?.item || {};
    setNotice(selectedUserId ? "Пользователь обновлён." : "Пользователь создан.");
    await loadUsers();
    resetForm(item);
  }

  function handleSelectUser(user) {
    resetForm(user);
  }

  function handleNewUser() {
    resetForm(null);
  }

  function handleMembershipChange(index, field, value) {
    setMemberships((prev) => prev.map((row, idx) => {
      if (idx !== index) return row;
      const next = { ...row, [field]: value };
      if (field === "role") next.role = toMembershipRoleValue(value);
      return next;
    }));
  }

  function handleAddMembership() {
    setMemberships((prev) => {
      const used = new Set(prev.map((row) => toText(row?.org_id)).filter(Boolean));
      const nextOrg = normalizedOrgOptions.find((row) => !used.has(row.org_id))?.org_id || fallbackOrgId || "";
      return normalizeMemberships([...prev, blankMembership(nextOrg)], fallbackOrgId);
    });
  }

  function handleRemoveMembership(index) {
    setMemberships((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      return normalizeMemberships(next, fallbackOrgId);
    });
  }

  return (
    <SectionCard
      eyebrow="Users"
      title="Пользователи и membership"
      subtitle="Platform admin создаёт пользователя, назначает организацию и меняет org role per organization."
    >
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.9fr]">
        <div className="overflow-auto rounded-[22px] border border-slate-200 bg-white">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
              <tr>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Роль платформы</th>
                <th className="px-3 py-3">Memberships и org roles</th>
                <th className="px-3 py-3">Статус</th>
                <th className="px-3 py-3">Создан</th>
                <th className="px-3 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-5 text-slate-500" colSpan={6}>Пользователи пока не найдены.</td>
                </tr>
              ) : null}
              {users.map((row) => {
                const userId = toText(row?.id);
                const selected = userId && userId === selectedUserId;
                const rowMemberships = Array.isArray(row?.memberships) ? row.memberships : [];
                return (
                  <tr
                    key={userId}
                    className={`border-t border-slate-100 ${selected ? "bg-amber-50/80" : "hover:bg-slate-50/70"}`}
                    onClick={() => handleSelectUser(row)}
                  >
                    <td className="px-3 py-2.5 align-top">
                      <div className="font-medium text-slate-950">{toText(row?.email) || "—"}</div>
                      <div className="mt-1 text-xs text-slate-500">{userId || "—"}</div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {row?.is_admin ? (
                        <StatusPill status="Platform admin" tone="accent" />
                      ) : (
                        <StatusPill status="Org member" tone="default" />
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {row?.is_admin ? (
                        <div className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
                          Доступ ко всем организациям
                        </div>
                      ) : rowMemberships.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {rowMemberships.map((membership, index) => {
                            const orgName = toText(membership?.org_name || membership?.org_id || "Организация");
                            const roleLabel = formatRoleWithScope(membership?.role);
                            return (
                              <span
                                key={`${userId}_membership_${index}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                              >
                                <span className="font-medium">{orgName}</span>
                                <span className="text-slate-500">· {roleLabel}</span>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill status={row?.is_active ? "active" : "disabled"} tone={row?.is_active ? "ok" : "warn"} />
                        {!row?.is_admin ? (
                          <span className="text-xs text-slate-500">{`orgs: ${rowMemberships.length}`}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-slate-600">{formatTs(row?.created_at)}</td>
                    <td className="px-3 py-2.5 align-top text-right">
                      <button
                        type="button"
                        className="secondaryBtn h-7 min-h-0 px-2.5 py-0 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSelectUser(row);
                        }}
                      >
                        Редактировать
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <form className="space-y-3 rounded-[22px] border border-slate-200 bg-slate-50 p-3.5" onSubmit={handleSubmit} autoComplete="off">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Editor</div>
              <div className="text-lg font-semibold text-slate-950">{selectedUserId ? "Редактировать пользователя" : "Новый пользователь"}</div>
            </div>
            <button type="button" className="secondaryBtn h-9 min-h-0 px-3 py-0 text-sm" onClick={handleNewUser}>
              Новый
            </button>
          </div>

          <label className="block text-sm text-slate-700">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Email</div>
            <input
              className="input w-full"
              type="email"
              name="admin_user_email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="block text-sm text-slate-700">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {selectedUserId ? "Новый пароль (опционально)" : "Пароль"}
            </div>
            <input
              className="input w-full"
              type="password"
              name="admin_user_password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            <span>Пользователь активен</span>
          </label>

          <label className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isPlatformAdmin}
              onChange={(event) => setIsPlatformAdmin(event.target.checked)}
            />
            <span>
              <span className="block font-medium text-slate-950">Администратор платформы</span>
              <span className="block text-xs text-slate-500">Доступ ко всем организациям и переключение org-context в верхней панели.</span>
            </span>
          </label>

          {!isPlatformAdmin ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Доступ по организациям</div>
                <button type="button" className="secondaryBtn h-8 min-h-0 px-2 py-0 text-xs" onClick={handleAddMembership}>
                  Добавить организацию
                </button>
              </div>
              {memberships.map((row, index) => (
                <div key={`${row.org_id || "membership"}_${index}`} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[1.2fr_1fr_auto]">
                  <label className="space-y-1 text-sm text-slate-700">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Организация</div>
                    <select
                      className="select"
                      value={row.org_id}
                      onChange={(event) => handleMembershipChange(index, "org_id", event.target.value)}
                    >
                      {normalizedOrgOptions.map((org) => (
                        <option key={org.org_id} value={org.org_id}>{org.name || org.org_id}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm text-slate-700">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Роль в организации</div>
                    <select
                      className="select"
                      value={row.role}
                      onChange={(event) => handleMembershipChange(index, "role", event.target.value)}
                    >
                      {USER_FACING_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="secondaryBtn h-10 min-h-0 self-end px-3 py-0 text-sm"
                    onClick={() => handleRemoveMembership(index)}
                    disabled={memberships.length <= 1}
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
              Пользователь получает доступ ко всем организациям. Персональные organization memberships для этого режима не требуются.
            </div>
          )}

          {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}
          {busy ? <div className="text-sm text-slate-500">Сохраняем…</div> : null}

          <button type="submit" className="primaryBtn h-10 min-h-0 px-4 py-0 text-sm" disabled={busy}>
            {selectedUserId ? "Сохранить пользователя" : "Создать пользователя"}
          </button>
        </form>
      </div>
    </SectionCard>
  );
}
