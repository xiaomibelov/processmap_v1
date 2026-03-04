import { useEffect, useMemo, useState } from "react";

import { apiGetEnterpriseWorkspace } from "../../lib/api";
import { buildWorkspaceTree, filterSessionsForSelection } from "../../features/workspace/workspaceDashboardVm";

function toText(value) {
  return String(value || "").trim();
}

function formatDateTime(tsRaw) {
  const ts = Number(tsRaw || 0);
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  const date = new Date(ts * 1000);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function updatedFromPresetSeconds(preset) {
  const now = Math.round(Date.now() / 1000);
  if (preset === "7d") return now - 7 * 24 * 60 * 60;
  if (preset === "30d") return now - 30 * 24 * 60 * 60;
  return 0;
}

export default function WorkspaceDashboard({
  activeOrgId = "",
  onOpenSession,
  onCreateProject,
  onCreateSession,
  onInviteUsers,
  canInviteUsers = false,
}) {
  const [groupBy, setGroupBy] = useState("users");
  const [query, setQuery] = useState("");
  const [ownerFilterIds, setOwnerFilterIds] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [updatedPreset, setUpdatedPreset] = useState("all");
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const [sortKey, setSortKey] = useState("updated_desc");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [workspace, setWorkspace] = useState({
    org: {},
    users: [],
    projects: [],
    sessions: [],
    page: { limit: 50, offset: 0, total: 0 },
  });

  useEffect(() => {
    const oid = toText(activeOrgId);
    if (!oid) return undefined;
    const timer = window.setTimeout(() => {
      const ownerIds = [...ownerFilterIds];
      if (selectedOwnerId && !ownerIds.includes(selectedOwnerId)) ownerIds.push(selectedOwnerId);
      const request = {
        orgId: oid,
        groupBy,
        q: query,
        ownerIds,
        projectId: selectedProjectId || "",
        status: statusFilter || "",
        updatedFrom: updatedFromPresetSeconds(updatedPreset),
        needsAttention: needsAttentionOnly ? 1 : undefined,
        limit,
        offset,
      };
      setLoading(true);
      setError("");
      void apiGetEnterpriseWorkspace(request)
        .then((res) => {
          if (!res?.ok) {
            setError(String(res?.error || "Не удалось загрузить workspace"));
            return;
          }
          setWorkspace({
            org: res.org || {},
            users: Array.isArray(res.users) ? res.users : [],
            projects: Array.isArray(res.projects) ? res.projects : [],
            sessions: Array.isArray(res.sessions) ? res.sessions : [],
            page: res.page && typeof res.page === "object" ? res.page : { limit, offset, total: 0 },
          });
        })
        .catch((err) => {
          setError(String(err?.message || err || "workspace_load_failed"));
        })
        .finally(() => {
          setLoading(false);
        });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [
    activeOrgId,
    groupBy,
    limit,
    offset,
    ownerFilterIds,
    query,
    selectedOwnerId,
    selectedProjectId,
    statusFilter,
    updatedPreset,
    needsAttentionOnly,
  ]);

  const tree = useMemo(() => buildWorkspaceTree(workspace), [workspace]);
  const listRows = useMemo(() => {
    const rows = filterSessionsForSelection(tree.sessions, {
      ownerId: selectedOwnerId,
      projectId: selectedProjectId,
    });
    if (sortKey === "updated_asc") return [...rows].reverse();
    return rows;
  }, [selectedOwnerId, selectedProjectId, sortKey, tree.sessions]);

  const ownerOptions = useMemo(() => {
    return tree.users.map((item) => ({
      id: toText(item.id),
      label: toText(item.name || item.email || item.id),
    }));
  }, [tree.users]);

  const hasRows = listRows.length > 0;
  const total = Number(workspace?.page?.total || 0);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  function resetSelection() {
    setSelectedOwnerId("");
    setSelectedProjectId("");
    setOffset(0);
  }

  return (
    <div className="workspaceDashboard h-full min-h-0 overflow-hidden rounded-xl border border-border bg-panel p-3" data-testid="workspace-dashboard">
      <div className="workspaceDashboardToolbar mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input h-9 min-h-0 flex-1 min-w-[220px]"
          placeholder="Поиск: session / project / owner"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOffset(0);
          }}
          data-testid="workspace-search"
        />
        <select
          className="select h-9 min-h-0 min-w-[136px]"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value);
            setOffset(0);
          }}
          data-testid="workspace-filter-status"
        >
          <option value="">Status: все</option>
          <option value="draft">Draft</option>
          <option value="in_progress">In progress</option>
          <option value="ready">Ready</option>
        </select>
        <select
          className="select h-9 min-h-0 min-w-[128px]"
          value={updatedPreset}
          onChange={(event) => {
            setUpdatedPreset(event.target.value);
            setOffset(0);
          }}
          data-testid="workspace-filter-updated"
        >
          <option value="all">Updated: все</option>
          <option value="7d">Последние 7 дней</option>
          <option value="30d">Последние 30 дней</option>
        </select>
        <select
          className="select h-9 min-h-0 min-w-[128px]"
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value)}
          data-testid="workspace-sort"
        >
          <option value="updated_desc">Sort: updated ↓</option>
          <option value="updated_asc">Sort: updated ↑</option>
        </select>
        <label className="inline-flex h-9 min-h-0 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={needsAttentionOnly}
            onChange={(event) => {
              setNeedsAttentionOnly(!!event.target.checked);
              setOffset(0);
            }}
            data-testid="workspace-filter-attention"
          />
          needs attention
        </label>
      </div>

      <div className="workspaceDashboardOwners mb-3">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Owner filter</label>
        <select
          className="select min-h-[72px] w-full text-sm"
          multiple
          value={ownerFilterIds}
          onChange={(event) => {
            const next = [];
            Array.from(event.target.selectedOptions).forEach((opt) => {
              const value = toText(opt.value);
              if (value) next.push(value);
            });
            setOwnerFilterIds(next);
            setOffset(0);
          }}
          data-testid="workspace-filter-owner"
        >
          {ownerOptions.length === 0 ? <option value="">—</option> : null}
          {ownerOptions.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid h-[calc(100%-132px)] min-h-[420px] grid-cols-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="workspaceExplorer min-h-0 overflow-auto rounded-lg border border-border bg-panel2 p-2" data-testid="workspace-explorer">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Group by</span>
            <button
              type="button"
              className={`secondaryBtn h-7 px-2 text-[11px] ${groupBy === "users" ? "ring-1 ring-accent/60" : ""}`}
              onClick={() => {
                setGroupBy("users");
                resetSelection();
              }}
              data-testid="workspace-group-users"
            >
              Users
            </button>
            <button
              type="button"
              className={`secondaryBtn h-7 px-2 text-[11px] ${groupBy === "projects" ? "ring-1 ring-accent/60" : ""}`}
              onClick={() => {
                setGroupBy("projects");
                resetSelection();
              }}
              data-testid="workspace-group-projects"
            >
              Projects
            </button>
          </div>

          {groupBy === "users" ? (
            <div className="space-y-1.5">
              {tree.users.map((user) => {
                const activeUser = selectedOwnerId === user.id;
                const ownedProjects = tree.projects.filter((proj) => toText(proj.owner_id) === user.id);
                return (
                  <div key={user.id} className="rounded-lg border border-border/70 bg-panel px-2 py-1.5">
                    <button
                      type="button"
                      className={`w-full text-left text-sm ${activeUser ? "font-semibold text-fg" : "text-fg"}`}
                      onClick={() => {
                        setSelectedOwnerId((prev) => (prev === user.id ? "" : user.id));
                        setSelectedProjectId("");
                        setOffset(0);
                      }}
                      data-testid="workspace-user-node"
                    >
                      {user.name}
                      <span className="ml-1 text-xs text-muted">({Number(user.project_count || 0)}/{Number(user.session_count || 0)})</span>
                    </button>
                    {activeUser ? (
                      <div className="mt-1 space-y-1 pl-3">
                        {ownedProjects.map((project) => (
                          <button
                            key={`${user.id}_${project.id}`}
                            type="button"
                            className={`block w-full truncate rounded px-1.5 py-1 text-left text-xs ${selectedProjectId === project.id ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}
                            onClick={() => {
                              setSelectedProjectId((prev) => (prev === project.id ? "" : project.id));
                              setOffset(0);
                            }}
                            title={project.name}
                            data-testid="workspace-user-project-node"
                          >
                            {project.name} <span className="text-[10px]">({project.session_count})</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1.5">
              {tree.projects.map((project) => {
                const activeProject = selectedProjectId === project.id;
                return (
                  <div key={project.id} className="rounded-lg border border-border/70 bg-panel px-2 py-1.5">
                    <button
                      type="button"
                      className={`w-full truncate text-left text-sm ${activeProject ? "font-semibold text-fg" : "text-fg"}`}
                      onClick={() => {
                        setSelectedProjectId((prev) => (prev === project.id ? "" : project.id));
                        setSelectedOwnerId("");
                        setOffset(0);
                      }}
                      title={project.name}
                      data-testid="workspace-project-node"
                    >
                      {project.name}
                      <span className="ml-1 text-xs text-muted">({project.session_count})</span>
                    </button>
                    <div className="mt-0.5 text-[11px] text-muted">owner: {project.owner || "—"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="workspaceSessions min-h-0 overflow-auto rounded-lg border border-border bg-panel2 p-2" data-testid="workspace-sessions-list">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-fg">Sessions</div>
            <div className="text-xs text-muted">total: {total}</div>
          </div>

          {loading ? <div className="rounded border border-border px-3 py-2 text-sm text-muted">Загрузка workspace…</div> : null}
          {error ? <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div> : null}

          {!loading && !error && !hasRows ? (
            <div className="rounded-lg border border-dashed border-borderStrong bg-panel px-4 py-3" data-testid="workspace-empty-state">
              <div className="text-sm font-semibold text-fg">Нет сессий по текущим фильтрам</div>
              <div className="mt-1 text-xs text-muted">
                Измените фильтры или создайте новый проект/сессию для старта работы.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="primaryBtn h-8 px-3 text-xs" onClick={() => onCreateProject?.()}>
                  Создать проект
                </button>
                <button type="button" className="secondaryBtn h-8 px-3 text-xs" onClick={() => onCreateSession?.()}>
                  Создать сессию
                </button>
                {canInviteUsers ? (
                  <button type="button" className="secondaryBtn h-8 px-3 text-xs" onClick={() => onInviteUsers?.()}>
                    Пригласить пользователя
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!loading && !error && hasRows ? (
            <div className="overflow-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-y-1 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-2 py-1">Session</th>
                    <th className="px-2 py-1">Project</th>
                    <th className="px-2 py-1">Owner</th>
                    <th className="px-2 py-1">Updated</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Reports</th>
                    <th className="px-2 py-1">Attention</th>
                    <th className="px-2 py-1">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listRows.map((row) => {
                    const projectTitle = tree.projects.find((proj) => proj.id === row.project_id)?.name || row.project_id || "—";
                    return (
                      <tr key={row.id} className="rounded-lg bg-panel">
                        <td className="px-2 py-1.5 font-medium">{row.name}</td>
                        <td className="px-2 py-1.5 text-muted">{projectTitle}</td>
                        <td className="px-2 py-1.5 text-muted">{row.owner || "—"}</td>
                        <td className="px-2 py-1.5 text-muted">{formatDateTime(row.updated_at)}</td>
                        <td className="px-2 py-1.5">
                          <span className="badge">{row.status}</span>
                        </td>
                        <td className="px-2 py-1.5">{Number(row.reports_versions || 0)}</td>
                        <td className="px-2 py-1.5">{Number(row.needs_attention || 0)}</td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            className="primaryBtn h-7 px-2 text-xs"
                            onClick={() => onOpenSession?.(row)}
                            data-testid="workspace-open-session"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-xs"
              disabled={!canPrev}
              onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
              data-testid="workspace-page-prev"
            >
              ← Prev
            </button>
            <span className="text-xs text-muted">
              {total > 0 ? `${offset + 1}-${Math.min(offset + limit, total)} / ${total}` : "0"}
            </span>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-xs"
              disabled={!canNext}
              onClick={() => setOffset((prev) => prev + limit)}
              data-testid="workspace-page-next"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

