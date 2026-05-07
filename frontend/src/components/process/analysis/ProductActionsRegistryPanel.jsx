import { useEffect, useMemo, useState } from "react";
import { apiGetSession, apiListProjectSessions, apiQueryProductActionRegistry } from "../../../lib/api.js";
import {
  PRODUCT_ACTIONS_REGISTRY_SESSION_CAP,
  buildProductActionRegistryRows,
  enforceProductActionRegistrySessionCap,
  filterProductActionRegistryRows,
  summarizeProductActionRegistryRows,
  uniqueProductActionRegistryFilterOptions,
} from "../../../features/process/analysis/productActionsRegistryModel.js";

function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function sessionIdOf(sessionRaw) {
  return toText(sessionRaw?.id || sessionRaw?.session_id || sessionRaw?.sessionId);
}

function sessionTitleOf(sessionRaw) {
  return toText(sessionRaw?.title || sessionRaw?.name || sessionRaw?.session_title || sessionRaw?.sessionTitle) || "Без названия";
}

function readSessionProductActions(sessionRaw) {
  const session = sessionRaw && typeof sessionRaw === "object" ? sessionRaw : {};
  return toArray(session?.interview?.analysis?.product_actions);
}

function normalizeBackendRows(rowsRaw) {
  return toArray(rowsRaw).map((rowRaw) => {
    const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
    const registryId = toText(row.registry_id || row.id) || `${toText(row.session_id) || "session"}::${toText(row.action_id) || "action"}`;
    return {
      ...row,
      registry_id: registryId,
      id: toText(row.id) || registryId,
      completeness: row.completeness === "complete" ? "complete" : "incomplete",
      missing_fields: toArray(row.missing_fields),
    };
  });
}

function normalizeBackendSessions(sessionsRaw) {
  return toArray(sessionsRaw).map((sessionRaw) => {
    const session = sessionRaw && typeof sessionRaw === "object" ? sessionRaw : {};
    const sessionId = toText(session.session_id || session.id);
    const projectTitle = toText(session.project_title || session.projectTitle);
    const folderTitle = toText(session.folder_title || session.folderTitle);
    const path = toText(session.path) || [folderTitle, projectTitle].filter(Boolean).join(" / ");
    return {
      ...session,
      id: sessionId,
      session_id: sessionId,
      session_title: sessionTitleOf(session),
      project_id: toText(session.project_id || session.projectId),
      project_title: projectTitle,
      folder_id: toText(session.folder_id || session.folderId),
      folder_title: folderTitle,
      path,
      status: toText(session.status),
      updated_at: session.updated_at || session.updatedAt || "",
      actions_total: Number(session.actions_total || session.actionsTotal || 0),
      complete: Number(session.complete || 0),
      incomplete: Number(session.incomplete || 0),
    };
  });
}

function summarizeRowsAsSessions(rowsRaw) {
  const bySessionId = new Map();
  normalizeBackendRows(rowsRaw).forEach((row) => {
    const sessionId = toText(row.session_id);
    if (!sessionId) return;
    const current = bySessionId.get(sessionId) || {
      id: sessionId,
      session_id: sessionId,
      session_title: sessionTitleOf(row),
      project_id: toText(row.project_id),
      project_title: toText(row.project_title),
      folder_id: "",
      folder_title: "",
      path: toText(row.project_title),
      status: "",
      updated_at: "",
      actions_total: 0,
      complete: 0,
      incomplete: 0,
      summary_source: "rows_fallback",
    };
    current.actions_total += 1;
    if (row.completeness === "complete") current.complete += 1;
    else current.incomplete += 1;
    bySessionId.set(sessionId, current);
  });
  return Array.from(bySessionId.values());
}

function normalizeScope(value) {
  const scope = toText(value).toLowerCase();
  if (scope === "workspace") return "workspace";
  if (scope === "project") return "project";
  if (scope === "session" || scope === "current") return "session";
  return "session";
}

const FILTERS = [
  ["product_group", "Группа"],
  ["product_name", "Товар"],
  ["action_type", "Тип"],
  ["action_stage", "Этап"],
  ["action_object_category", "Категория"],
  ["role", "Роль"],
];

function display(value, fallback = "—") {
  return toText(value) || fallback;
}

function formatUpdatedAt(value) {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw) || raw <= 0) return "—";
  try {
    return new Date(raw * 1000).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value || "—");
  }
}

function SummaryPill({ label, value }) {
  return (
    <span className="productActionsRegistrySummaryPill">
      <b>{label}</b>
      {value}
    </span>
  );
}

export function ProductActionsRegistryContent({
  initialScope = "session",
  page = false,
  showWorkspaceScope = false,
  onScopeChange = null,
  onClose = null,
  sessionId = "",
  sessionTitle = "",
  projectId = "",
  projectTitle = "",
  workspaceId = "",
  interviewData = null,
  onOpenProject = null,
  onOpenSession = null,
}) {
  const [scope, setScope] = useState(() => normalizeScope(initialScope));
  const [projectSessions, setProjectSessions] = useState([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [loadedProjectRows, setLoadedProjectRows] = useState([]);
  const [backendRows, setBackendRows] = useState([]);
  const [backendSessions, setBackendSessions] = useState([]);
  const [backendSessionSummary, setBackendSessionSummary] = useState(null);
  const [backendScope, setBackendScope] = useState("");
  const [backendStatus, setBackendStatus] = useState("");
  const [sessionSummaryWarning, setSessionSummaryWarning] = useState("");
  const [backendLoading, setBackendLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [projectStatus, setProjectStatus] = useState("");
  const [filters, setFilters] = useState({ completeness: "all" });

  useEffect(() => {
    setScope(normalizeScope(initialScope));
  }, [initialScope]);

  const currentRows = useMemo(() => buildProductActionRegistryRows({
    productActions: interviewData?.analysis?.product_actions,
    session: { id: sessionId, title: sessionTitle, project_id: projectId, project_title: projectTitle },
    project: { id: projectId, title: projectTitle },
  }), [interviewData?.analysis?.product_actions, projectId, projectTitle, sessionId, sessionTitle]);

  useEffect(() => {
    let alive = true;
    async function loadBackendRegistry() {
      const normalizedScope = normalizeScope(scope);
      const payload = {
        scope: normalizedScope,
        workspace_id: normalizedScope === "workspace" ? workspaceId : "",
        project_id: normalizedScope === "project" ? projectId : "",
        session_id: normalizedScope === "session" ? sessionId : "",
        filters: { completeness: "all" },
        limit: 1000,
        offset: 0,
      };
      if (normalizedScope === "workspace" && !toText(workspaceId)) {
        setBackendLoading(false);
        setBackendRows([]);
        setBackendSessions([]);
        setBackendSessionSummary(null);
        setSessionSummaryWarning("");
        setBackendScope(normalizedScope);
        setBackendStatus("Workspace будет выбран текущим контекстом приложения.");
        return;
      }
      if (normalizedScope === "project" && !toText(projectId)) {
        setBackendLoading(false);
        setBackendRows([]);
        setBackendSessions([]);
        setBackendSessionSummary(null);
        setSessionSummaryWarning("");
        setBackendScope(normalizedScope);
        setBackendStatus("Выберите проект или откройте реестр из проекта.");
        return;
      }
      if (normalizedScope === "session" && !toText(sessionId)) {
        setBackendLoading(false);
        setBackendRows([]);
        setBackendSessions([]);
        setBackendSessionSummary(null);
        setSessionSummaryWarning("");
        setBackendScope(normalizedScope);
        setBackendStatus("Откройте сессию или выберите проект для preview.");
        return;
      }
      setBackendLoading(true);
      setBackendStatus("Загружаю read-only реестр…");
      const result = await apiQueryProductActionRegistry(payload);
      if (!alive) return;
      setBackendLoading(false);
      setBackendScope(normalizedScope);
      if (!result?.ok) {
        setBackendRows([]);
        setBackendSessions([]);
        setBackendSessionSummary(null);
        setSessionSummaryWarning("");
        setBackendScope(normalizedScope === "workspace" ? normalizedScope : "");
        setBackendStatus(toText(result?.error) || "Backend-агрегация пока недоступна.");
        return;
      }
      const nextRows = normalizeBackendRows(result.rows);
      let nextSessions = normalizeBackendSessions(result.sessions);
      const missingSessionSummary = nextRows.length > 0 && nextSessions.length === 0;
      if (missingSessionSummary) {
        nextSessions = summarizeRowsAsSessions(nextRows);
      }
      setBackendRows(nextRows);
      setBackendSessions(nextSessions);
      setBackendSessionSummary(result.session_summary && typeof result.session_summary === "object" ? result.session_summary : null);
      setSessionSummaryWarning(missingSessionSummary
        ? "Найдены действия, но не получен список сессий. Требуется обновить агрегацию."
        : "");
      setBackendStatus(nextRows.length || nextSessions.length
        ? `Загружено: сессий ${nextSessions.length}, строк ${nextRows.length}.`
        : "В выбранном scope пока нет сессий с действиями с продуктом.");
    }
    loadBackendRegistry();
    return () => {
      alive = false;
    };
  }, [projectId, scope, sessionId, workspaceId]);

  const rows = backendScope === scope
    ? backendRows
    : scope === "project"
      ? loadedProjectRows
      : scope === "session"
        ? currentRows
        : [];
  const sessionRows = backendScope === scope ? backendSessions : [];
  const filterOptions = useMemo(() => uniqueProductActionRegistryFilterOptions(rows), [rows]);
  const filteredRows = useMemo(() => filterProductActionRegistryRows(rows, filters), [filters, rows]);
  const summary = useMemo(() => summarizeProductActionRegistryRows(rows), [rows]);
  const filteredSummary = useMemo(() => summarizeProductActionRegistryRows(filteredRows), [filteredRows]);
  const capStatus = enforceProductActionRegistrySessionCap(selectedSessionIds);
  const canLoadSelected = !!projectId && selectedSessionIds.length > 0 && capStatus.ok && !loadingSessions;
  const hasSessionContext = !!toText(sessionId);
  const hasProjectContext = !!toText(projectId);
  const visibleSessionTotal = backendScope === scope
    ? Number(backendSessionSummary?.sessions_total || sessionRows.length || 0)
    : summary.sessions || (scope === "session" && hasSessionContext ? 1 : 0);
  const showSessionSummaryEmpty = backendScope === scope
    && !backendLoading
    && sessionRows.length === 0
    && rows.length === 0;

  async function loadProjectSessions() {
    if (!projectId) {
      setProjectStatus("Выберите проект или откройте реестр из проекта.");
      return;
    }
    setProjectStatus("Загружаю список сессий проекта…");
    const result = await apiListProjectSessions(projectId, "", { view: "summary" });
    if (!result?.ok) {
      setProjectStatus(toText(result?.error) || "Не удалось загрузить список сессий проекта.");
      return;
    }
    const sessions = toArray(result.sessions);
    setProjectSessions(sessions);
    setProjectStatus(sessions.length ? "Выберите сессии и нажмите «Загрузить выбранные»." : "В проекте нет сессий.");
  }

  async function loadSelectedSessions() {
    const cap = enforceProductActionRegistrySessionCap(selectedSessionIds);
    if (!cap.ok) {
      setProjectStatus(`Выбрано больше ${cap.cap} сессий. Для большой выгрузки нужен реестр workspace.`);
      return;
    }
    setLoadingSessions(true);
    setProjectStatus("Загружаю выбранные сессии…");
    const nextRows = [];
    for (let i = 0; i < selectedSessionIds.length; i += 1) {
      const sid = selectedSessionIds[i];
      const summarySession = projectSessions.find((item) => sessionIdOf(item) === sid) || { id: sid };
      // Full session loads are intentionally explicit and capped.
      // They are required in the frontend-only MVP because summary rows omit interview.analysis.
      // eslint-disable-next-line no-await-in-loop
      const result = await apiGetSession(sid);
      if (!result?.ok) continue;
      const fullSession = result.session || {};
      nextRows.push(...buildProductActionRegistryRows({
        productActions: readSessionProductActions(fullSession),
        session: {
          ...summarySession,
          ...fullSession,
          id: sessionIdOf(fullSession) || sid,
          title: sessionTitleOf(fullSession) || sessionTitleOf(summarySession),
          project_id: projectId,
          project_title: projectTitle,
        },
        project: { id: projectId, title: projectTitle },
      }));
    }
    setLoadedProjectRows(nextRows);
    setLoadingSessions(false);
    setProjectStatus(nextRows.length ? `Загружено строк: ${nextRows.length}.` : "В выбранных процессах пока нет действий с продуктом.");
  }

  function setRegistryScope(nextScopeRaw) {
    const nextScope = normalizeScope(nextScopeRaw);
    setScope(nextScope);
    onScopeChange?.(nextScope);
    if (nextScope === "project" && !projectSessions.length) loadProjectSessions();
  }

  function openProjectFromSummary(sessionRaw) {
    const project_id = toText(sessionRaw?.project_id);
    if (!project_id) return;
    onOpenProject?.({
      projectId: project_id,
      workspaceId: toText(sessionRaw?.workspace_id) || workspaceId,
      projectTitle: toText(sessionRaw?.project_title),
    });
  }

  function openSessionFromSummary(sessionRaw) {
    const session_id = toText(sessionRaw?.session_id);
    if (!session_id) return;
    onOpenSession?.({
      id: session_id,
      session_id,
      title: toText(sessionRaw?.session_title),
      project_id: toText(sessionRaw?.project_id),
      project_title: toText(sessionRaw?.project_title),
      workspace_id: toText(sessionRaw?.workspace_id) || workspaceId,
    }, { openTab: "interview", source: "product_actions_registry" });
  }

  function toggleSession(sessionRaw) {
    const sid = sessionIdOf(sessionRaw);
    if (!sid) return;
    setSelectedSessionIds((prev) => (prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]));
  }

  function patchFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className={page ? "productActionsRegistryPanel productActionsRegistryPanel--page" : "productActionsRegistryPanel"} data-testid="product-actions-registry-panel">
      <header className="productActionsRegistryHeader">
        <div>
          <div className="productActionsRegistryEyebrow">Read-only preview</div>
          <h2>Реестр действий с продуктом</h2>
          <p>Действия по продуктам, товарам, упаковке и ингредиентам из сессий workspace.</p>
        </div>
        {onClose ? (
          <button type="button" className="secondaryBtn smallBtn" onClick={onClose}>
            {page ? "Вернуться" : "Закрыть"}
          </button>
        ) : null}
      </header>

      <div className="productActionsRegistryScope" role="tablist" aria-label="Источник строк реестра">
        {showWorkspaceScope ? (
          <button
            type="button"
            className={scope === "workspace" ? "isActive" : ""}
            onClick={() => setRegistryScope("workspace")}
            role="tab"
            aria-selected={scope === "workspace"}
            data-testid="product-actions-registry-scope-workspace"
          >
            Workspace
          </button>
        ) : null}
        <button
          type="button"
          className={scope === "project" ? "isActive" : ""}
          onClick={() => setRegistryScope("project")}
          role="tab"
          aria-selected={scope === "project"}
          disabled={!hasProjectContext}
          data-testid="product-actions-registry-scope-project"
        >
          Проект
        </button>
        <button
          type="button"
          className={scope === "session" ? "isActive" : ""}
          onClick={() => setRegistryScope("session")}
          role="tab"
          aria-selected={scope === "session"}
          disabled={!hasSessionContext}
          data-testid="product-actions-registry-scope-session"
        >
          Сессия
        </button>
      </div>

      {scope === "workspace" ? (
        <section className="productActionsRegistryWorkspaceNotice" data-testid="product-actions-registry-workspace-backend">
          <div>
            <b>Workspace scope</b>
            <span>
              Сводка строится без загрузки полных данных всех сессий на frontend.
            </span>
          </div>
          <small>{backendLoading ? "Загрузка…" : backendStatus || (workspaceId ? `Workspace: ${workspaceId}` : "Workspace будет выбран текущим контекстом приложения.")}</small>
        </section>
      ) : null}

      {scope === "project" ? (
        <section className="productActionsRegistryProjectPicker" data-testid="product-actions-registry-project-picker">
          <div className="productActionsRegistryProjectHead">
            <div>
              <b>{display(projectTitle, "Проект")}</b>
              <span>Строки проекта загружаются сразу. Ручной выбор сессий оставлен как временный small-scope fallback.</span>
            </div>
            <button type="button" className="secondaryBtn smallBtn" onClick={loadProjectSessions}>
              Обновить список
            </button>
          </div>
          {projectSessions.length ? (
            <div className="productActionsRegistrySessionList">
              {projectSessions.map((item) => {
                const sid = sessionIdOf(item);
                const checked = selectedSessionIds.includes(sid);
                return (
                  <label className="productActionsRegistrySessionRow" key={sid || sessionTitleOf(item)}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSession(item)}
                    />
                    <span>
                      <b>{sessionTitleOf(item)}</b>
                      <small>{sid}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}
          <div className="productActionsRegistryLoadRow">
            <button
              type="button"
              className="primaryBtn smallBtn"
              disabled={!canLoadSelected}
              onClick={loadSelectedSessions}
              data-testid="product-actions-registry-load-selected"
            >
              {loadingSessions ? "Загружаю…" : "Загрузить выбранные"}
            </button>
            <span className={capStatus.ok ? "" : "warn"}>
              Выбрано: {selectedSessionIds.length} / {PRODUCT_ACTIONS_REGISTRY_SESSION_CAP}
            </span>
          </div>
          {projectStatus || backendStatus ? <div className="productActionsRegistryNotice">{projectStatus || backendStatus}</div> : null}
        </section>
      ) : null}

      {backendScope === scope && (scope === "workspace" || scope === "project") ? (
        <section className="productActionsRegistrySessions" data-testid="product-actions-registry-sessions">
          <div className="productActionsRegistryProjectHead">
            <div>
              <b>Сессии workspace</b>
              <span>Все сессии в выбранном scope, включая сессии без действий с продуктом.</span>
            </div>
            <small>
              {sessionRows.length
                ? `Всего: ${sessionRows.length}, без действий: ${Number(backendSessionSummary?.sessions_without_actions || 0)}`
                : backendLoading
                  ? "Загрузка…"
                  : showSessionSummaryEmpty
                    ? "Сессии не найдены."
                    : "Сессии временно недоступны."}
            </small>
          </div>
          {sessionSummaryWarning ? (
            <div className="productActionsRegistryWarning" data-testid="product-actions-registry-session-summary-warning">
              {sessionSummaryWarning}
            </div>
          ) : null}
          {sessionRows.length ? (
            <div className="productActionsRegistrySessionSummaryTable" role="table">
              <div className="productActionsRegistrySessionSummaryHead" role="row">
                <span>Процесс</span>
                <span>Project / path</span>
                <span>Действия</span>
                <span>Статус</span>
                <span>Открыть</span>
              </div>
              {sessionRows.map((item) => (
                <article className="productActionsRegistrySessionSummaryRow" role="row" key={item.session_id}>
                  <div>
                    <b>{display(item.session_title, "Без названия")}</b>
                    <small>{display(item.session_id)}</small>
                  </div>
                  <div>
                    <b>{display(item.project_title, "Проект не указан")}</b>
                    <small>{display(item.path || item.folder_title, "Workspace root")}</small>
                  </div>
                  <div>
                    <b>{item.actions_total}</b>
                    <small>{item.complete} полных · {item.incomplete} неполных</small>
                  </div>
                  <div>
                    <b>{display(item.status, "draft")}</b>
                    <small>{formatUpdatedAt(item.updated_at)}</small>
                  </div>
                  <div className="productActionsRegistrySessionActions">
                    <button
                      type="button"
                      className="secondaryBtn smallBtn"
                      onClick={() => openProjectFromSummary(item)}
                      disabled={!toText(item.project_id)}
                    >
                      Открыть проект
                    </button>
                    <button
                      type="button"
                      className="primaryBtn smallBtn"
                      onClick={() => openSessionFromSummary(item)}
                      disabled={!toText(item.session_id)}
                    >
                      Открыть сессию
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="productActionsRegistryEmpty" data-testid="product-actions-registry-sessions-empty">
              {backendLoading
                ? "Загружаю сессии workspace…"
                : showSessionSummaryEmpty
                  ? "В выбранном scope пока нет доступных сессий."
                  : sessionSummaryWarning || "Список сессий временно недоступен."}
            </div>
          )}
        </section>
      ) : null}

      <section className="productActionsRegistrySummary" aria-label="Сводка реестра">
        <SummaryPill label="Сессий" value={visibleSessionTotal} />
        <SummaryPill label="Строк" value={summary.rows} />
        <SummaryPill label="Полных" value={summary.complete} />
        <SummaryPill label="Неполных" value={summary.incomplete} />
        <SummaryPill label="После фильтров" value={filteredSummary.rows} />
      </section>

      <section className="productActionsRegistryFilters" data-testid="product-actions-registry-filters">
        <div className="productActionsRegistryFiltersHint">Фильтры применяются к загруженным строкам.</div>
        {FILTERS.map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <select value={toText(filters[key])} onChange={(event) => patchFilter(key, event.target.value)}>
              <option value="">Все</option>
              {toArray(filterOptions[key]).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        ))}
        <label>
          <span>Полнота</span>
          <select value={filters.completeness || "all"} onChange={(event) => patchFilter("completeness", event.target.value)}>
            <option value="all">Все</option>
            <option value="complete">Полные</option>
            <option value="incomplete">Неполные</option>
          </select>
        </label>
      </section>

      {summary.incomplete ? (
        <div className="productActionsRegistryWarning">
          Есть неполные строки — их нужно открыть в исходной сессии и заполнить перед выгрузкой.
        </div>
      ) : null}

      <section className="productActionsRegistryPreview" data-testid="product-actions-registry-preview">
        {filteredRows.length ? (
          <div className="productActionsRegistryTable" role="table">
            <div className="productActionsRegistryTableHead" role="row">
              <span>Продукт</span>
              <span>Действие</span>
              <span>Контекст</span>
              <span>Статус</span>
            </div>
            {filteredRows.map((row) => (
              <article className="productActionsRegistryRow" role="row" key={row.registry_id}>
                <div>
                  <b>{display(row.product_name, "Товар не указан")}</b>
                  <small>{display(row.product_group, "Группа не указана")}</small>
                </div>
                <div>
                  <b>{display(row.action_type, "Тип не указан")} · {display(row.action_stage, "этап не указан")}</b>
                  <small>{display(row.action_object, "объект не указан")} · {display(row.action_object_category, "категория не указана")} · {display(row.action_method, "способ не указан")}</small>
                </div>
                <div>
                  <b>{display(row.session_title)}</b>
                  <small>{display(row.step_label, "Шаг не указан")} · BPMN: {display(row.bpmn_element_id, "нет")}</small>
                </div>
                <div>
                  <span className={`productActionsRegistryCompleteness ${row.completeness}`}>
                    {row.completeness === "complete" ? "Полная" : "Неполная"}
                  </span>
                  <small>{display(row.role, "роль не указана")}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="productActionsRegistryEmpty" data-testid="product-actions-registry-empty">
            {scope === "workspace"
              ? "В workspace пока нет действий с продуктом."
              : scope === "session" && !hasSessionContext
                ? "Откройте сессию или выберите проект для preview."
                : "В выбранных процессах пока нет действий с продуктом."}
          </div>
        )}
      </section>

      <footer className="productActionsRegistryFooter">
        <span>CSV/XLSX будет добавлен отдельным контуром после backend/read-model решения.</span>
        <button type="button" className="secondaryBtn smallBtn" disabled>CSV — позже</button>
        <button type="button" className="secondaryBtn smallBtn" disabled>XLSX — позже</button>
      </footer>
    </div>
  );
}

export default function ProductActionsRegistryPanel({
  open = false,
  onClose = null,
  sessionId = "",
  sessionTitle = "",
  projectId = "",
  projectTitle = "",
  interviewData = null,
  onOpenProject = null,
  onOpenSession = null,
}) {
  if (!open) return null;

  return (
    <div className="productActionsRegistryOverlay" role="dialog" aria-modal="true" aria-label="Реестр действий с продуктом">
      <ProductActionsRegistryContent
        initialScope="session"
        onClose={onClose}
        sessionId={sessionId}
        sessionTitle={sessionTitle}
        projectId={projectId}
        projectTitle={projectTitle}
        interviewData={interviewData}
        onOpenProject={onOpenProject}
        onOpenSession={onOpenSession}
      />
    </div>
  );
}
