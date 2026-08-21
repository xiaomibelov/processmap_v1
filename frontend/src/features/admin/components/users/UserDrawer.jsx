import { PermissionMatrix } from "./PermissionMatrix.jsx";
import { ROLE_OPTIONS } from "./userAccessConstants.js";
import { toText } from "./userAccessUtils.js";
import { useUserAccessForm } from "../../hooks/useUserAccessForm.js";
import { useEffect, useState } from "react";

export function UserDrawer({ user, orgOptions, fallbackOrgId, onClose, onSave, submitting }) {
  const form = useUserAccessForm({ user, orgOptions, fallbackOrgId });
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
  }, [user]);

  const availableOrgs = (membershipIndex) => {
    const used = new Set(
      form.memberships
        .filter((_, idx) => idx !== membershipIndex)
        .map((m) => toText(m?.org_id))
        .filter(Boolean)
    );
    return form.normalizedOrgOptions.filter((o) => !used.has(o.org_id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = form.validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    const result = await onSave?.(user, form.buildPayload());
    if (result && !result.ok) {
      setError(toText(result.error || "Не удалось сохранить пользователя."));
      return;
    }
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {user ? "Редактировать пользователя" : "Добавить пользователя"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => form.setEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="user@example.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Имя</label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => form.setFullName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Иван Иванов"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Должность</label>
                <input
                  type="text"
                  value={form.jobTitle}
                  onChange={(e) => form.setJobTitle(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Аналитик"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {user ? "Новый пароль (оставьте пустым, чтобы не менять)" : "Пароль"}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => form.setPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => form.setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Активен</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isPlatformAdmin}
                  onChange={(e) => form.setIsPlatformAdmin(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Платформенный администратор</span>
              </label>
            </div>

            {user?.groups && Array.isArray(user.groups) && user.groups.length > 0 && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Группы</label>
                <div className="flex flex-wrap gap-1">
                  {user.groups.map((g, idx) => (
                    <span
                      key={`${g?.id || idx}_${idx}`}
                      className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                    >
                      {toText(g?.name || g?.group_name || g?.id)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!form.isPlatformAdmin && (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Доступ к организациям</h3>
                  <button
                    type="button"
                    onClick={form.handleAddMembership}
                    disabled={form.normalizedOrgOptions.length === 0}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    Добавить организацию
                  </button>
                </div>

                {form.memberships.map((membership, idx) => {
                  const orgChoices = availableOrgs(idx);
                  return (
                    <div key={idx} className="space-y-3 rounded-md bg-gray-50 p-3">
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-gray-600">Организация</label>
                          <select
                            value={toText(membership.org_id)}
                            onChange={(e) => form.handleMembershipChange(idx, "org_id", e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="">Выберите организацию</option>
                            {orgChoices.map((o) => (
                              <option key={o.org_id} value={o.org_id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-40">
                          <label className="mb-1 block text-xs font-medium text-gray-600">Роль</label>
                          <select
                            value={toText(membership.role) || "org_viewer"}
                            onChange={(e) => form.handleMembershipChange(idx, "role", e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            {ROLE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => form.handleRemoveMembership(idx)}
                          className="rounded-md p-2 text-red-600 hover:bg-red-50"
                          aria-label="Удалить организацию"
                        >
                          ✕
                        </button>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-medium text-gray-600">Разрешения</label>
                        <PermissionMatrix
                          permissions={membership.permissions || {}}
                          onChange={(key, value) => form.handlePermissionChange(idx, key, value)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </form>

        <div className="border-t px-6 py-4">
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              {submitting ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
