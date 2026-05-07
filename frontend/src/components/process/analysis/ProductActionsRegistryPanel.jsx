import { useEffect, useMemo, useState } from "react";
import { apiGetSession, apiListProjectSessions } from "../../../lib/api.js";
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
}) {
  const [scope, setScope] = useState(() => normalizeScope(initialScope));
  const [projectSessions, setProjectSessions] = useState([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [loadedProjectRows, setLoadedProjectRows] = useState([]);
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

  const rows = scope === "project" ? loadedProjectRows : scope === "session" ? currentRows : [];
  const filterOptions = useMemo(() => uniqueProductActionRegistryFilterOptions(rows), [rows]);
  const filteredRows = useMemo(() => filterProductActionRegistryRows(rows, filters), [filters, rows]);
  const summary = useMemo(() => summarizeProductActionRegistryRows(rows), [rows]);
  const filteredSummary = useMemo(() => summarizeProductActionRegistryRows(filteredRows), [filteredRows]);
  const capStatus = enforceProductActionRegistrySessionCap(selectedSessionIds);
  const canLoadSelected = !!projectId && selectedSessionIds.length > 0 && capStatus.ok && !loadingSessions;
  const hasSessionContext = !!toText(sessionId);
  const hasProjectContext = !!toText(projectId);

  async function loadProjectSessions() {
    if (!projectId) {
      setProjectStatus("Выберите проект или откройте реестр из проекта.");
      return;
    }
    setProjectStatus("Загружаю список процессов проекта…");
    const result = await apiListProjectSessions(projectId, "", { view: "summary" });
    if (!result?.ok) {
      setProjectStatus(toText(result?.error) || "Не удалось загрузить список процессов проекта.");
      return;
    }
    const sessions = toArray(result.sessions);
    setProjectSessions(sessions);
    setProjectStatus(sessions.length ? "Выберите процессы и нажмите «Загрузить выбранные»." : "В проекте нет сессий.");
  }

  async function loadSelectedSessions() {
    const cap = enforceProductActionRegistrySessionCap(selectedSessionIds);
    if (!cap.ok) {
      setProjectStatus(`Выбрано больше ${cap.cap} процессов. Для большой выгрузки нужен backend-реестр.`);
      return;
    }
    setLoadingSessions(true);
    setProjectStatus("Загружаю выбранные процессы…");
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
          <p>Действия по продуктам, товарам, упаковке и ингредиентам из процессов workspace.</p>
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
        <section className="productActionsRegistryWorkspaceNotice" data-testid="product-actions-registry-workspace-placeholder">
          <div>
            <b>Workspace-реестр требует backend-агрегации.</b>
            <span>
              Сейчас доступен read-only preview текущей сессии и явно выбранных сессий проекта. Эта страница не загружает все sessions workspace на frontend.
            </span>
          </div>
          <small>{workspaceId ? `Workspace: ${workspaceId}` : "Workspace будет выбран текущим контекстом приложения."}</small>
        </section>
      ) : null}

      {scope === "project" ? (
        <section className="productActionsRegistryProjectPicker" data-testid="product-actions-registry-project-picker">
          <div className="productActionsRegistryProjectHead">
            <div>
              <b>{display(projectTitle, "Проект")}</b>
              <span>Выберите до {PRODUCT_ACTIONS_REGISTRY_SESSION_CAP} процессов. Полная загрузка сессий выполняется только после явного клика.</span>
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
          {projectStatus ? <div className="productActionsRegistryNotice">{projectStatus}</div> : null}
        </section>
      ) : null}

      <section className="productActionsRegistrySummary" aria-label="Сводка реестра">
        <SummaryPill label="Сессий" value={summary.sessions || (scope === "session" && hasSessionContext ? 1 : 0)} />
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
              ? "Workspace-строки появятся после backend aggregation contour."
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
      />
    </div>
  );
}
