import { AvatarInitials } from "./AvatarInitials.jsx";
import { formatDateTime, formatRoleLabel, toText } from "./userAccessUtils.js";

function MembershipBadge({ membership }) {
  const orgName = toText(membership?.org_name || membership?.name || membership?.org_id);
  const roleLabel = formatRoleLabel(membership?.role);
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
      {orgName}: {roleLabel}
    </span>
  );
}

export function UsersTable({ users = [], onEdit, onDelete }) {
  if (users.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-gray-500">
        Пользователи не найдены. Добавьте первого пользователя.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 font-medium text-gray-500">Пользователь</th>
            <th className="px-3 py-2 font-medium text-gray-500">Должность</th>
            <th className="px-3 py-2 font-medium text-gray-500">Статус</th>
            <th className="px-3 py-2 font-medium text-gray-500">Доступ</th>
            <th className="px-3 py-2 font-medium text-gray-500">Создан</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">Действия</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {users.map((user) => {
            const fullName = toText(user?.full_name || user?.fullName);
            const email = toText(user?.email);
            const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
            const isActive = user?.is_active !== false;
            return (
              <tr key={user?.id || email} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <AvatarInitials name={fullName} email={email} size="sm" />
                    <div>
                      <div className="font-medium text-gray-900">
                        {fullName || email || "—"}
                      </div>
                      {fullName && <div className="text-gray-500">{email}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {toText(user?.job_title || user?.jobTitle) || "—"}
                </td>
                <td className="px-3 py-2">
                  {isActive ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                      Активен
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                      Неактивен
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {user?.is_admin ? (
                    <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                      Платформенный админ
                    </span>
                  ) : memberships.length === 0 ? (
                    <span className="text-gray-400">Без доступа</span>
                  ) : (
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {memberships.map((m, idx) => (
                        <MembershipBadge key={idx} membership={m} />
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500">{formatDateTime(user?.created_at)}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit?.(user)}
                      className="rounded-md px-2 py-0.5 text-indigo-600 hover:bg-indigo-50"
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete?.(user)}
                      className="rounded-md px-2 py-0.5 text-red-600 hover:bg-red-50"
                    >
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
