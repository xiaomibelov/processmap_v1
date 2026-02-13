import { useMemo, useState } from "react";
import NotesPanel from "./NotesPanel";
import ProcessStage from "./ProcessStage";
import NoSession from "./stages/NoSession";
import ActorsSetup from "./stages/ActorsSetup";

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function uniqueRoles(list) {
  const out = [];
  const seen = new Set();
  for (const raw of ensureArray(list)) {
    const v = String(raw || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export default function AppShell({
  backendStatus,
  backendHint,
  projects,
  projectId,
  onProjectChange,
  modeFilter,
  onModeFilterChange,
  sessionId,
  sessions,
  onOpen,
  onRefresh,
  onNewProject,
  onNewLocal,
  onNewBackend,
  draft,
  onDraftChange,
  onPatchDraft,
  onGenerate,
  onAddNote,
  generating,
  errorText,
}) {
  const [showActors, setShowActors] = useState(false);

  const roles = useMemo(() => ensureArray(draft?.roles), [draft]);
  const needsActors = useMemo(() => roles.length === 0, [roles]);

  function persistDraft(nextDraft) {
    onDraftChange?.(nextDraft);
    if (sessionId && !isLocalSessionId(sessionId)) {
      onPatchDraft?.(sessionId, nextDraft);
    }
  }

  function handleSaveActors(nextRoles) {
    const cleaned = uniqueRoles(nextRoles);

    const nextStart =
      String(draft?.start_role || "").trim() && cleaned.includes(draft.start_role)
        ? draft.start_role
        : (cleaned[0] || "");

    const nextDraft = {
      ...(draft || {}),
      roles: cleaned,
      start_role: nextStart,
    };

    persistDraft(nextDraft);
    setShowActors(false);
  }

  const showNoSession = isLocalSessionId(sessionId);

  return (
    <div className="appShell">
      <div className="topbar">
        <div className="topLeft">
          <div className="brand">Food Process Copilot</div>
          {backendStatus === "ok" ? <span className="badge ok">API OK</span> : null}
          {backendStatus === "fail" ? <span className="badge err">API FAIL</span> : null}
          {backendStatus !== "ok" && backendStatus !== "fail" ? <span className="badge">API …</span> : null}
          {backendHint ? <div className="hint">{backendHint}</div> : null}
        </div>

        <div className="topRight">
          <select
            className="select"
            value={projectId || ""}
            onChange={(e) => onProjectChange?.(e.target.value || "")}
            title="Проект"
          >
            <option value="">— проект —</option>
            {(projects || []).map((p, idx) => (
              <option key={`${p?.id || "p"}_${idx}`} value={p?.id || ""}>
                {p?.title || p?.id || "—"}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={modeFilter || ""}
            onChange={(e) => onModeFilterChange?.(e.target.value || "")}
            title="Фильтр по режиму"
            disabled={!((projects || []).length > 0)}
          >
            <option value="">Все режимы</option>
            <option value="quick_skeleton">Quick</option>
            <option value="deep_audit">Deep audit</option>
          </select>

          <select
            className="select"
            value={sessionId || ""}
            onChange={(e) => onOpen?.(e.target.value)}
            title="Сессия"
          >
            <option value="">— выбрать сессию —</option>
            {(sessions || []).map((s, idx) => {
              const id = s?.session_id || s?.id || "";
              const title = s?.title || id || "—";
              return (
                <option key={`${id || "s"}_${idx}`} value={id}>
                  {title}
                </option>
              );
            })}
          </select>

          <button className="secondaryBtn" onClick={onRefresh} title="Обновить список проектов/сессий">
            Обновить
          </button>
          <button className="secondaryBtn" onClick={onNewProject} title="Создать проект">
            Новый проект
          </button>
          <button className="secondaryBtn" onClick={onNewLocal} title="Создать локальный черновик">
            Новая (Local)
          </button>
          <button
            className="primaryBtn smallBtn"
            onClick={() => onNewBackend?.(modeFilter || "quick_skeleton")}
            disabled={!Boolean(projectId)}
            title={Boolean(projectId) ? "Создать сессию в проекте" : "Сначала выбери или создай проект"}
          >
            Новая (API)
          </button>
        </div>
      </div>

      <div className="workspace">
        <div className="leftCol">
          <NotesPanel
            draft={draft}
            sessionId={sessionId}
            onNewLocal={onNewLocal}
            onGenerate={onGenerate}
            onAddNote={onAddNote}
            generating={generating}
            errorText={errorText}
            onEditActors={() => setShowActors(true)}
          />
        </div>

        <div className="mainCol">
          {showNoSession ? (
            <NoSession onNewLocal={onNewLocal} />
          ) : showActors || needsActors ? (
            <ActorsSetup draft={draft || {}} onSaveActors={handleSaveActors} />
          ) : (
            <ProcessStage>{/* текущий UI процесса как был */}</ProcessStage>
          )}
        </div>
      </div>
    </div>
  );
}
