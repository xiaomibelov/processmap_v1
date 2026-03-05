import { useEffect, useMemo, useRef, useState } from "react";

import { apiGetEnterpriseWorkspace } from "../../lib/api";
import { buildWorkspaceTree, filterSessionsForSelection } from "../../features/workspace/workspaceDashboardVm";
import { computeDodPercent, formatDodBreakdownTooltip } from "../../features/workspace/computeDodPercent";

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

function formatRole(roleRaw) {
  const role = toText(roleRaw).toLowerCase();
  if (role === "org_owner") return "Владелец организации";
  if (role === "org_admin") return "Администратор организации";
  if (role === "project_manager") return "Менеджер проекта";
  if (role === "editor") return "Редактор";
  if (role === "viewer") return "Наблюдатель";
  if (role === "auditor") return "Аудитор";
  return role ? role.replace(/_/g, " ") : "Участник";
}

function statusBadgeClass(statusRaw) {
  const status = toText(statusRaw).toLowerCase();
  if (status === "ready") return "border-success/30 bg-success/10 text-success";
  if (status === "in_progress") return "border-warning/30 bg-warning/10 text-warning";
  return "border-borderStrong/60 bg-panel text-muted";
}

function formatSessionStatus(statusRaw) {
  const status = toText(statusRaw).toLowerCase();
  if (status === "ready") return "Готово";
  if (status === "in_progress") return "В работе";
  if (status === "draft") return "Черновик";
  return status || "—";
}

function dodBadgeClass(percentRaw) {
  const pct = Number(percentRaw);
  if (!Number.isFinite(pct)) return "border-borderStrong/60 bg-panel text-muted";
  if (pct >= 80) return "border-success/30 bg-success/10 text-success";
  if (pct >= 50) return "border-warning/30 bg-warning/10 text-warning";
  return "border-danger/30 bg-danger/10 text-danger";
}

function attentionBadgeClass(countRaw) {
  return Number(countRaw || 0) > 0
    ? "border-danger/30 bg-danger/10 text-danger"
    : "border-borderStrong/60 bg-panel text-muted";
}

function MetricCard({ label, value, hint = "", tone = "default" }) {
  const toneClass = tone === "accent"
    ? "border-accent/25 bg-accentSoft/10"
    : tone === "danger"
      ? "border-danger/25 bg-danger/5"
      : "border-border bg-panel2/35";
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-fg">{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

function SectionHeader({ title, subtitle = "", actions = null }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-fg">{title}</div>
        {subtitle ? <div className="mt-0.5 text-xs text-muted">{subtitle}</div> : null}
      </div>
      {actions}
    </div>
  );
}

export default function WorkspaceDashboard({
  activeOrgId = "",
  onOpenSession,
  onOpenDoc,
  onCreateProject,
  onCreateSession,
  onInviteUsers,
  canInviteUsers = false,
}) {
  const explorerRef = useRef(null);
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
  const [limit] = useState(10);
  const [loading, setLoading] = useState(() => !!toText(activeOrgId));
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState("");
  const [workspace, setWorkspace] = useState({
    org: {},
    users: [],
    projects: [],
    sessions: [],
    page: { limit: 10, offset: 0, total: 0 },
  });

  useEffect(() => {
    setSelectedOwnerId("");
    setSelectedProjectId("");
    setOwnerFilterIds([]);
    setOffset(0);
    setError("");
    setLoading(!!toText(activeOrgId));
    setLoadedOnce(false);
  }, [activeOrgId]);

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
            const status = Number(res?.status || 0);
            const errorText = toText(res?.error || "");
            if (status === 404 && toText(selectedProjectId)) {
              setSelectedProjectId("");
              setOffset(0);
              return;
            }
            if (status === 404 && !toText(selectedProjectId)) {
              setError("Нет доступа к данным текущей организации. Проверьте выбор организации в верхней панели.");
              return;
            }
            setError(errorText || "Не удалось загрузить workspace");
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
          setLoadedOnce(true);
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
  const ownerOptions = useMemo(() => tree.users.map((item) => ({
    id: toText(item.id),
    label: toText(item.name || item.email || item.id),
  })), [tree.users]);

  const total = Number(workspace?.page?.total || 0);
  const hasRows = listRows.length > 0;
  const canPrev = offset > 0;
  const canNext = offset + limit < total;
  const selectedProject = useMemo(
    () => tree.projects.find((item) => item.id === selectedProjectId) || null,
    [selectedProjectId, tree.projects],
  );
  const selectedOwner = useMemo(
    () => tree.users.find((item) => item.id === selectedOwnerId) || null,
    [selectedOwnerId, tree.users],
  );
  const dodBySessionId = useMemo(() => {
    const map = new Map();
    listRows.forEach((row) => {
      const id = toText(row?.id);
      if (!id) return;
      map.set(id, computeDodPercent(row));
    });
    return map;
  }, [listRows]);
  const sessionStatusSummary = useMemo(() => {
    return listRows.reduce((acc, row) => {
      const key = toText(row.status).toLowerCase() || "draft";
      acc[key] = Number(acc[key] || 0) + 1;
      acc.attention += Number(row.needs_attention || 0);
      return acc;
    }, { draft: 0, in_progress: 0, ready: 0, attention: 0 });
  }, [listRows]);
  const pageLabel = total > 0 ? `${offset + 1}-${Math.min(offset + limit, total)} / ${total}` : "0";
  const scopeSummary = [
    selectedProject ? `Project: ${selectedProject.name}` : "",
    selectedOwner ? `Owner: ${selectedOwner.name}` : "",
  ].filter(Boolean).join(" · ") || "Все проекты и сессии в рамках выбранной организации.";
  const orgName = toText(workspace?.org?.name || activeOrgId || "Рабочее пространство");
  const orgRole = formatRole(workspace?.org?.role);

  function openProjectsList() {
    setGroupBy("projects");
    setSelectedOwnerId("");
    setOffset(0);
    if (explorerRef.current && typeof explorerRef.current.scrollIntoView === "function") {
      explorerRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  function openDocFromWorkspace() {
    const latest = listRows[0] || null;
    if (latest && typeof onOpenDoc === "function") {
      onOpenDoc(latest);
      return;
    }
    if (typeof window !== "undefined") {
      window.location.assign("/app");
    }
  }

  function resetSelection() {
    setSelectedOwnerId("");
    setSelectedProjectId("");
    setOwnerFilterIds([]);
    setOffset(0);
  }

  return (
    <div className="workspaceDashboard h-full min-h-0 overflow-auto rounded-xl border border-border bg-panel p-4" data-testid="workspace-dashboard">
      <div className="rounded-2xl border border-border bg-panel2/35 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent/30 bg-accentSoft/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-fg">
                Рабочее пространство
              </span>
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-xs"
                onClick={openProjectsList}
                data-testid="workspace-open-projects"
                title="Перейти к списку проектов"
              >
                К проектам
              </button>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-fg md:text-2xl">
              Рабочее пространство / Проекты / Сессии
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted">
              Выберите сессию, чтобы редактировать диаграмму, проходить интервью и формировать отчёты.
            </p>
            <p className="mt-1 max-w-3xl text-xs text-muted" title={orgName}>
              Организация: {orgName}{orgRole ? ` · ${orgRole}` : ""}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="secondaryBtn h-9 px-3 text-sm"
              onClick={openDocFromWorkspace}
              data-testid="workspace-open-doc"
              title="Открыть DOC"
            >
              DOC
            </button>
            <button type="button" className="primaryBtn h-9 px-3 text-sm" onClick={() => onCreateProject?.()}>
              Создать проект
            </button>
            <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={() => onCreateSession?.()}>
              Создать сессию
            </button>
            {canInviteUsers ? (
              <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={() => onInviteUsers?.()}>
                Пригласить пользователей
              </button>
            ) : (
              <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={resetSelection}>
                Сбросить фильтры
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Сессии"
          value={total}
          hint={`${sessionStatusSummary.in_progress} в работе · ${sessionStatusSummary.ready} готовы`}
          tone="accent"
        />
        <MetricCard
          label="Проекты"
          value={tree.projects.length}
          hint={selectedProject ? "Фильтр по проекту включён." : "Проекты в текущем выбранном контуре."}
        />
        <MetricCard
          label="Владельцы"
          value={tree.users.length}
          hint={selectedOwner ? "Фильтр по владельцу включён." : "Владельцы с доступными проектами или сессиями."}
        />
        <MetricCard
          label="Требует внимания"
          value={sessionStatusSummary.attention}
          hint={needsAttentionOnly ? "Фильтр внимания включён." : "Суммарные маркеры внимания по видимым сессиям."}
          tone={sessionStatusSummary.attention > 0 ? "danger" : "default"}
        />
      </div>

      <div className="mt-4 grid min-h-[560px] grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-h-0 space-y-4">
          <div className="rounded-xl border border-border bg-panel2/35 p-3">
            <SectionHeader
              title="Область и фильтры"
              subtitle={scopeSummary}
              actions={(
                <button type="button" className="secondaryBtn h-7 px-2 text-xs" onClick={resetSelection}>
                  Сбросить
                </button>
              )}
            />

            <div className="space-y-3">
              <input
                className="input h-9 min-h-0 w-full"
                placeholder="Поиск: сессия / проект / владелец"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setOffset(0);
                }}
                data-testid="workspace-search"
              />

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <select
                  className="select h-9 min-h-0 w-full"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setOffset(0);
                  }}
                  data-testid="workspace-filter-status"
                >
                  <option value="">Статус: все</option>
                  <option value="draft">Черновик</option>
                  <option value="in_progress">В работе</option>
                  <option value="ready">Готово</option>
                </select>
                <select
                  className="select h-9 min-h-0 w-full"
                  value={updatedPreset}
                  onChange={(event) => {
                    setUpdatedPreset(event.target.value);
                    setOffset(0);
                  }}
                  data-testid="workspace-filter-updated"
                >
                  <option value="all">Обновление: всё</option>
                  <option value="7d">Последние 7 дней</option>
                  <option value="30d">Последние 30 дней</option>
                </select>
                <select
                  className="select h-9 min-h-0 w-full"
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value)}
                  data-testid="workspace-sort"
                >
                  <option value="updated_desc">Сортировка: обновлённые ↓</option>
                  <option value="updated_asc">Сортировка: обновлённые ↑</option>
                </select>
                <label className="inline-flex h-9 min-h-0 items-center gap-2 rounded-lg border border-border px-3 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={needsAttentionOnly}
                    onChange={(event) => {
                      setNeedsAttentionOnly(!!event.target.checked);
                      setOffset(0);
                    }}
                    data-testid="workspace-filter-attention"
                  />
                  <span>Только требующие внимания</span>
                </label>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Фильтр по владельцу
                </label>
                <select
                  className="select min-h-[96px] w-full text-sm"
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
            </div>
          </div>

          <div
            ref={explorerRef}
            className="workspaceExplorer min-h-[260px] overflow-auto rounded-xl border border-border bg-panel2 p-3"
            data-testid="workspace-explorer"
          >
            <SectionHeader
              title="Проекты и владельцы"
              subtitle={groupBy === "users" ? "Просмотр сессий по каждому владельцу." : "Просмотр проектов по последним обновлениям."}
              actions={(
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`secondaryBtn h-7 px-2 text-[11px] ${groupBy === "users" ? "ring-1 ring-accent/60" : ""}`}
                    onClick={() => {
                      setGroupBy("users");
                      resetSelection();
                    }}
                    data-testid="workspace-group-users"
                  >
                    Пользователи
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
                    Проекты
                  </button>
                </div>
              )}
            />

            {groupBy === "users" ? (
              <div className="space-y-2">
                {tree.users.map((user) => {
                  const activeUser = selectedOwnerId === user.id;
                  const ownedProjects = tree.projects.filter((proj) => toText(proj.owner_id) === user.id);
                  return (
                    <div key={user.id} className={`rounded-xl border px-3 py-2 ${activeUser ? "border-accent/40 bg-accentSoft/10" : "border-border/70 bg-panel"}`}>
                      <button
                        type="button"
                        className="flex w-full items-start justify-between gap-3 text-left"
                        onClick={() => {
                          setSelectedOwnerId((prev) => (prev === user.id ? "" : user.id));
                          setSelectedProjectId("");
                          setOffset(0);
                        }}
                        data-testid="workspace-user-node"
                        title={user.name}
                      >
                        <div className="min-w-0">
                          <div className={`truncate text-sm ${activeUser ? "font-semibold text-fg" : "text-fg"}`}>{user.name}</div>
                          <div className="mt-0.5 text-[11px] text-muted">{formatRole(user.role)}</div>
                        </div>
                        <div className="shrink-0 rounded-full border border-border px-2 py-1 text-[11px] text-muted">
                          {Number(user.project_count || 0)} / {Number(user.session_count || 0)}
                        </div>
                      </button>
                      {activeUser ? (
                        <div className="mt-2 space-y-1.5 pl-2">
                          {ownedProjects.length === 0 ? (
                            <div className="text-xs text-muted">У этого владельца нет проектов в текущем контуре.</div>
                          ) : ownedProjects.map((project) => (
                            <button
                              key={`${user.id}_${project.id}`}
                              type="button"
                              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
                                selectedProjectId === project.id ? "bg-accent/15 text-fg" : "text-muted hover:bg-panel2/50 hover:text-fg"
                              }`}
                              onClick={() => {
                                setSelectedProjectId((prev) => (prev === project.id ? "" : project.id));
                                setOffset(0);
                              }}
                              title={project.name}
                              data-testid="workspace-user-project-node"
                            >
                              <span className="min-w-0 truncate">{project.name}</span>
                              <span className="shrink-0 text-[10px] text-muted">{project.session_count}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {tree.projects.map((project) => {
                  const activeProject = selectedProjectId === project.id;
                  return (
                    <div key={project.id} className={`rounded-xl border px-3 py-2 ${activeProject ? "border-accent/40 bg-accentSoft/10" : "border-border/70 bg-panel"}`}>
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          setSelectedProjectId((prev) => (prev === project.id ? "" : project.id));
                          setSelectedOwnerId("");
                          setOffset(0);
                        }}
                        title={project.name}
                        data-testid="workspace-project-node"
                      >
                        <div className={`truncate text-sm ${activeProject ? "font-semibold text-fg" : "text-fg"}`}>{project.name}</div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted">
                          <span className="truncate" title={project.owner || "—"}>Владелец: {project.owner || "—"}</span>
                          <span className="shrink-0">{project.session_count} сессий</span>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="workspaceSessions min-h-0 rounded-xl border border-border bg-panel2 p-3" data-testid="workspace-sessions-list">
          <SectionHeader
            title="Последние сессии"
            subtitle="Последние обновления в текущем контуре. Откройте сессию, чтобы сразу перейти к диаграмме."
            actions={(
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="rounded-full border border-border px-2 py-1">{pageLabel}</span>
                {hasRows ? (
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-xs"
                    onClick={() => onOpenSession?.(listRows[0])}
                  >
                    Открыть последнюю
                  </button>
                ) : null}
              </div>
            )}
          />

          {loading ? (
            <div className="rounded-xl border border-border px-4 py-3 text-sm text-muted">
              Загрузка рабочего пространства...
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          {!loading && !error && loadedOnce && !hasRows ? (
            <div className="rounded-xl border border-dashed border-borderStrong bg-panel px-4 py-4" data-testid="workspace-empty-state">
              <div className="text-base font-semibold text-fg">
                {tree.projects.length > 0 ? "Сессий пока нет" : "Проектов и сессий пока нет"}
              </div>
              <div className="mt-1 text-sm text-muted">
                {tree.projects.length > 0
                  ? "Создайте сессию, чтобы начать редактирование диаграммы, интервью и отчёты."
                  : "Сначала создайте проект, затем создайте сессию и начните работу в пространстве организации."}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="primaryBtn h-9 px-3 text-sm" onClick={() => onCreateProject?.()}>
                  Создать проект
                </button>
                <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={() => onCreateSession?.()}>
                  Создать сессию
                </button>
                {canInviteUsers ? (
                  <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={() => onInviteUsers?.()}>
                    Пригласить пользователей
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!loading && !error && hasRows ? (
            <>
              <div className="space-y-2 md:hidden">
                {listRows.map((row) => {
                  const projectTitle = tree.projects.find((proj) => proj.id === row.project_id)?.name || row.project_id || "—";
                  const dod = dodBySessionId.get(toText(row.id)) || computeDodPercent(row);
                  const dodPercent = dod?.percent;
                  const dodLabel = dodPercent == null ? "—" : `${dodPercent}%`;
                  const dodTooltip = formatDodBreakdownTooltip(dod);
                  return (
                    <div key={row.id} className="rounded-xl border border-border bg-panel px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-fg" title={row.name}>{row.name}</div>
                          <div className="mt-1 truncate text-xs text-muted" title={projectTitle}>{projectTitle}</div>
                        </div>
                        <button
                          type="button"
                          className="primaryBtn h-8 shrink-0 px-3 text-xs"
                          onClick={() => onOpenSession?.(row)}
                          data-testid="workspace-open-session"
                        >
                          Открыть
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                        <span className={`rounded-full border px-2 py-1 ${statusBadgeClass(row.status)}`}>{formatSessionStatus(row.status)}</span>
                        <span className="rounded-full border border-border px-2 py-1 text-muted" title={row.owner || "—"}>{row.owner || "—"}</span>
                        <span className={`rounded-full border px-2 py-1 ${attentionBadgeClass(row.needs_attention)}`}>
                          Внимание: {Number(row.needs_attention || 0)}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-1 ${dodBadgeClass(dodPercent)}`}
                          title={dodTooltip}
                        >
                          DoD: {dodLabel}
                        </span>
                        <span className="rounded-full border border-border px-2 py-1 text-muted">
                          Обновлено: {formatDateTime(row.updated_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-auto md:block">
                <table className="w-full min-w-[860px] border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                      <th className="px-3 py-1">Сессия</th>
                      <th className="px-3 py-1">Проект</th>
                      <th className="px-3 py-1">Владелец</th>
                      <th className="px-3 py-1">Обновлено</th>
                      <th className="px-3 py-1">DoD %</th>
                      <th className="px-3 py-1">Статус</th>
                      <th className="px-3 py-1">Отчёты</th>
                      <th className="px-3 py-1">Внимание</th>
                      <th className="px-3 py-1">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.map((row) => {
                      const projectTitle = tree.projects.find((proj) => proj.id === row.project_id)?.name || row.project_id || "—";
                      const dod = dodBySessionId.get(toText(row.id)) || computeDodPercent(row);
                      const dodPercent = dod?.percent;
                      const dodLabel = dodPercent == null ? "—" : `${dodPercent}%`;
                      const dodTooltip = formatDodBreakdownTooltip(dod);
                      return (
                        <tr key={row.id} className="bg-panel">
                          <td className="rounded-l-xl px-3 py-2.5 align-top">
                            <div className="max-w-[220px] truncate font-medium text-fg" title={row.name}>
                              {row.name}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-top text-muted">
                            <div className="max-w-[180px] truncate" title={projectTitle}>
                              {projectTitle}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-top text-muted">
                            <div className="max-w-[180px] truncate" title={row.owner || "—"}>
                              {row.owner || "—"}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-top text-muted">{formatDateTime(row.updated_at)}</td>
                          <td className="px-3 py-2.5 align-top">
                            <span
                              className={`rounded-full border px-2 py-1 text-[11px] ${dodBadgeClass(dodPercent)}`}
                              title={dodTooltip}
                              data-testid="workspace-dod-badge"
                            >
                              {dodLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            <span className={`rounded-full border px-2 py-1 text-[11px] ${statusBadgeClass(row.status)}`}>
                              {formatSessionStatus(row.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 align-top text-muted">{Number(row.reports_versions || 0)}</td>
                          <td className="px-3 py-2.5 align-top">
                            <span className={`rounded-full border px-2 py-1 text-[11px] ${attentionBadgeClass(row.needs_attention)}`}>
                              {Number(row.needs_attention || 0)}
                            </span>
                          </td>
                          <td className="rounded-r-xl px-3 py-2.5 align-top">
                            <button
                              type="button"
                              className="primaryBtn h-8 px-3 text-xs"
                              onClick={() => onOpenSession?.(row)}
                              data-testid="workspace-open-session"
                            >
                              Открыть
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/70 pt-3">
            <button
              type="button"
              className="secondaryBtn h-8 px-3 text-xs"
              disabled={!canPrev}
              onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
              data-testid="workspace-page-prev"
            >
              ← Назад
            </button>
            <span className="text-xs text-muted">{pageLabel}</span>
            <button
              type="button"
              className="secondaryBtn h-8 px-3 text-xs"
              disabled={!canNext}
              onClick={() => setOffset((prev) => prev + limit)}
              data-testid="workspace-page-next"
            >
              Далее →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
