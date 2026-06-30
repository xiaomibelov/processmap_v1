import { useMemo, useState } from "react";
import SectionCard from "../common/SectionCard";
import { useAdminQuery } from "../../hooks/useAdminQuery";
import { useAdminMutation } from "../../hooks/useAdminMutation";
import { useAuth } from "../../../auth/AuthProvider";
import {
  apiAddGroupMember,
  apiCreateOrgGroup,
  apiDeleteOrgGroup,
  apiListGroupMembers,
  apiListOrgGroups,
  apiListOrgAssignableUsers,
  apiRemoveGroupMember,
  apiUpdateOrgGroup,
} from "../../../../lib/api";
import { toText } from "../../utils/adminFormat";

function canManageGroups(activeOrgRole, isAdmin) {
  return isAdmin || ["org_owner", "org_admin"].includes(String(activeOrgRole || "").toLowerCase());
}

function CreateGroupForm({ orgId, canManage, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const createMutation = useAdminMutation({
    mutationFn: () => apiCreateOrgGroup(orgId, { name, description }),
    invalidateKeys: [["orgGroups", orgId]],
    onSuccess: () => {
      setName("");
      setDescription("");
      setError("");
      onCreated?.();
    },
    onError: (err) => setError(String(err?.message || "Не удалось создать группу")),
  });

  if (!canManage) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!toText(name)) {
      setError("Введите название группы");
      return;
    }
    await createMutation.mutateAsync();
  }

  return (
    <SectionCard eyebrow="Группы" title="Создать группу" subtitle="Новая группа появится в списке и будет доступна для участников организации.">
      <form className="grid grid-cols-1 gap-2 md:grid-cols-12" onSubmit={handleSubmit}>
        <label className="md:col-span-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Название</div>
          <input
            className="input h-8 min-h-0 w-full py-1 text-xs"
            type="text"
            placeholder="Название группы"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            disabled={createMutation.isPending}
            required
          />
        </label>
        <label className="md:col-span-6">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Описание</div>
          <input
            className="input h-8 min-h-0 w-full py-1 text-xs"
            type="text"
            placeholder="Краткое описание"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={createMutation.isPending}
          />
        </label>
        <div className="flex items-end md:col-span-2">
          <button
            type="submit"
            className="primaryBtn h-8 min-h-0 rounded-lg px-3 py-0 text-xs"
            disabled={createMutation.isPending || !toText(name)}
          >
            {createMutation.isPending ? "Создание…" : "Создать"}
          </button>
        </div>
      </form>
      {error ? <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
    </SectionCard>
  );
}

function GroupMembers({ orgId, groupId, canManage, currentUserId }) {
  const { data: membersData, isLoading, error: queryError } = useAdminQuery({
    queryKey: ["groupMembers", orgId, groupId],
    fetcher: () => apiListGroupMembers(orgId, groupId),
    enabled: Boolean(orgId) && Boolean(groupId),
  });

  const { data: assignableUsersData } = useAdminQuery({
    queryKey: ["orgAssignableUsers", orgId],
    fetcher: () => apiListOrgAssignableUsers(orgId),
    enabled: Boolean(orgId),
  });

  const [selectedUserId, setSelectedUserId] = useState("");
  const [error, setError] = useState("");

  const members = membersData?.items || [];
  const memberIds = useMemo(() => new Set(members.map((m) => toText(m.user_id))), [members]);

  const { refreshMe } = useAuth();
  const addMutation = useAdminMutation({
    mutationFn: (userId) => apiAddGroupMember(orgId, groupId, userId),
    invalidateKeys: [["groupMembers", orgId, groupId], ["orgGroups", orgId]],
    onSuccess: (_, userId) => {
      setSelectedUserId("");
      setError("");
      if (toText(userId) === toText(currentUserId)) refreshMe();
    },
    onError: (err) => setError(String(err?.message || "Не удалось добавить участника")),
  });

  const removeMutation = useAdminMutation({
    mutationFn: (userId) => apiRemoveGroupMember(orgId, groupId, userId),
    invalidateKeys: [["groupMembers", orgId, groupId], ["orgGroups", orgId]],
    onSuccess: (_, userId) => {
      if (toText(userId) === toText(currentUserId)) refreshMe();
    },
    onError: (err) => setError(String(err?.message || "Не удалось удалить участника")),
  });

  const candidates = useMemo(() => {
    const all = assignableUsersData?.items || [];
    return all.filter((u) => !memberIds.has(toText(u.user_id)));
  }, [assignableUsersData, memberIds]);

  async function handleAdd(event) {
    event.preventDefault();
    if (!selectedUserId) return;
    setError("");
    await addMutation.mutateAsync(selectedUserId);
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Участники группы</div>
      {queryError ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{queryError.message}</div> : null}
      {isLoading ? <div className="text-xs text-slate-500">Загрузка…</div> : null}

      {canManage ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={handleAdd}>
          <div className="min-w-[200px] flex-1">
            <select
              className="input h-8 min-h-0 w-full py-1 text-xs"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              disabled={addMutation.isPending}
            >
              <option value="">Выберите участника организации</option>
              {candidates.map((u) => (
                <option key={toText(u.user_id)} value={toText(u.user_id)}>
                  {toText(u.full_name) || toText(u.email) || toText(u.user_id)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="primaryBtn h-8 min-h-0 rounded-lg px-3 py-0 text-xs"
            disabled={addMutation.isPending || !selectedUserId}
          >
            {addMutation.isPending ? "Добавление…" : "Добавить"}
          </button>
        </form>
      ) : null}

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}

      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-2 py-1.5 font-medium">Пользователь</th>
              <th className="px-2 py-1.5 font-medium">Email</th>
              <th className="px-2 py-1.5 font-medium">Должность</th>
              {canManage ? <th className="px-2 py-1.5 font-medium"></th> : null}
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr className="border-t border-slate-100">
                <td className="px-2 py-4 text-slate-500" colSpan={canManage ? 4 : 3}>В группе пока нет участников.</td>
              </tr>
            ) : null}
            {members.map((m) => (
              <tr key={toText(m.user_id)} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-2 font-medium text-slate-950">{toText(m.full_name) || toText(m.email) || toText(m.user_id)}</td>
                <td className="px-2 py-2 text-slate-600">{toText(m.email) || "—"}</td>
                <td className="px-2 py-2 text-slate-600">{toText(m.job_title) || "—"}</td>
                {canManage ? (
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      className="secondaryBtn h-6 min-h-0 rounded-lg px-2 py-0 text-[10px]"
                      onClick={() => removeMutation.mutate(toText(m.user_id))}
                      disabled={removeMutation.isPending}
                    >
                      Удалить
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupsTable({
  items,
  canManage,
  currentUserId,
  expandedGroupId,
  onExpand,
  onSave,
  onDelete,
  saving,
  deleting,
}) {
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  function startEdit(group) {
    setDraftName(toText(group.name));
    setDraftDescription(toText(group.description));
  }

  return (
    <div className="overflow-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
          <tr>
            <th className="px-2 py-1.5 font-medium"></th>
            <th className="px-2 py-1.5 font-medium">Название</th>
            <th className="px-2 py-1.5 font-medium">Описание</th>
            <th className="px-2 py-1.5 font-medium">Участники</th>
            {canManage ? <th className="px-2 py-1.5 font-medium"></th> : null}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr className="border-t border-slate-100">
              <td className="px-2 py-5 text-slate-500" colSpan={canManage ? 5 : 4}>Группы не созданы.</td>
            </tr>
          ) : null}
          {items.map((group) => {
            const groupId = toText(group.id);
            const isExpanded = groupId && groupId === expandedGroupId;
            return (
              <>
                <tr
                  key={groupId}
                  className={`cursor-pointer border-t border-slate-100 transition ${isExpanded ? "bg-emerald-50/60" : "hover:bg-slate-50"}`}
                  onClick={() => { onExpand?.(groupId); if (!isExpanded) startEdit(group); }}
                >
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      className="secondaryBtn h-6 min-h-0 rounded-lg px-1.5 py-0 text-[10px]"
                      onClick={(e) => { e.stopPropagation(); onExpand?.(groupId); if (!isExpanded) startEdit(group); }}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? "−" : "+"}
                    </button>
                  </td>
                  <td className="px-2 py-2 font-medium text-slate-950">{toText(group.name)}</td>
                  <td className="px-2 py-2 text-slate-600">{toText(group.description) || "—"}</td>
                  <td className="px-2 py-2 text-slate-700">{Number(group.members_count || 0)}</td>
                  {canManage ? (
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        className="secondaryBtn h-6 min-h-0 rounded-lg px-2 py-0 text-[10px]"
                        onClick={(e) => { e.stopPropagation(); onDelete?.(groupId); }}
                        disabled={deleting}
                      >
                        Удалить
                      </button>
                    </td>
                  ) : null}
                </tr>
                {isExpanded ? (
                  <tr key={`${groupId}_detail`} className="border-t border-slate-100 bg-slate-50/70">
                    <td colSpan={canManage ? 5 : 4} className="px-2 py-2">
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
                          <label className="md:col-span-4">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Название</div>
                            <input
                              className="input h-8 min-h-0 w-full py-1 text-xs"
                              type="text"
                              value={draftName}
                              onChange={(e) => setDraftName(e.target.value)}
                              disabled={saving}
                            />
                          </label>
                          <label className="md:col-span-6">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Описание</div>
                            <input
                              className="input h-8 min-h-0 w-full py-1 text-xs"
                              type="text"
                              value={draftDescription}
                              onChange={(e) => setDraftDescription(e.target.value)}
                              disabled={saving}
                            />
                          </label>
                          <div className="flex items-end md:col-span-2">
                            <button
                              type="button"
                              className="secondaryBtn h-7 min-h-0 rounded-lg px-3 py-0 text-xs"
                              disabled={saving || !toText(draftName)}
                              onClick={() => onSave?.(groupId, { name: draftName, description: draftDescription })}
                            >
                              {saving ? "Сохранение…" : "Сохранить"}
                            </button>
                          </div>
                        </div>
                        <GroupMembers orgId={group.org_id} groupId={groupId} canManage={canManage} currentUserId={currentUserId} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminGroupsPanel({ activeOrgId, activeOrgRole, isAdmin }) {
  const oid = toText(activeOrgId);
  const { user } = useAuth();
  const currentUserId = toText(user?.id);
  const canManage = canManageGroups(activeOrgRole, isAdmin);
  const [expandedGroupId, setExpandedGroupId] = useState("");

  const { data: groupsData, isLoading, error: queryError } = useAdminQuery({
    queryKey: ["orgGroups", oid],
    fetcher: () => apiListOrgGroups(oid),
    enabled: Boolean(oid),
  });

  const updateMutation = useAdminMutation({
    mutationFn: ({ groupId, payload }) => apiUpdateOrgGroup(oid, groupId, payload),
    invalidateKeys: [["orgGroups", oid]],
  });

  const deleteMutation = useAdminMutation({
    mutationFn: (groupId) => apiDeleteOrgGroup(oid, groupId),
    invalidateKeys: [["orgGroups", oid]],
    onSuccess: () => setExpandedGroupId(""),
  });

  const groups = groupsData?.items || [];

  return (
    <div id="admin-access-groups" className="space-y-3">
      <CreateGroupForm orgId={oid} canManage={canManage} />
      <SectionCard eyebrow="Список" title="Группы" subtitle="Группы участников активной организации.">
        {queryError ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{queryError.message}</div> : null}
        {isLoading ? <div className="text-xs text-slate-500">Загрузка…</div> : null}
        {!oid ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
            Сначала выберите организацию.
          </div>
        ) : (
          <GroupsTable
            items={groups}
            canManage={canManage}
            currentUserId={currentUserId}
            expandedGroupId={expandedGroupId}
            onExpand={(groupId) => setExpandedGroupId((current) => (toText(current) === toText(groupId) ? "" : toText(groupId)))}
            onSave={(groupId, payload) => updateMutation.mutateAsync({ groupId, payload })}
            onDelete={(groupId) => {
              if (typeof window !== "undefined" && !window.confirm("Удалить группу? Участники будут исключены из группы.")) return;
              deleteMutation.mutate(groupId);
            }}
            saving={updateMutation.isPending}
            deleting={deleteMutation.isPending}
          />
        )}
      </SectionCard>
    </div>
  );
}
