#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="feat/frontend-r18-wire-actions-to-backend-v1"
TAG_START="cp/foodproc_frontend_r18_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r18_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r18_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R18 start (${TS})" >/dev/null 2>&1 || true
echo "$TAG_START"

echo
echo "== git (before) =="
git status -sb || true
git show -s --format='%ci %h %d %s' || true

echo
echo "== branch =="
git switch -c "$BR" >/dev/null 2>&1 || git switch "$BR" >/dev/null
git status -sb || true

echo
echo "== unstage helper scripts/artifacts/backend if any =="
git restore --staged Run_StepR*.sh 2>/dev/null || true
git restore --staged StepR*.sh 2>/dev/null || true
git restore --staged artifacts 2>/dev/null || true
git restore --staged backend 2>/dev/null || true

echo
echo "== ensure dirs =="
mkdir -p frontend/src/lib frontend/src/components frontend/src/components/process frontend/src/components/stages frontend/src/styles .tools

echo
echo "== write lib/api.js (stable wrappers) =="
cat > frontend/src/lib/api.js <<'EOF'
const API_BASE = "/api";

async function safeJson(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

function okResult(data, status) { return { ok: true, status, ...data }; }
function failResult(status, message, details) { return { ok: false, status, message, details }; }

async function requestJson(method, path, body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await safeJson(res);
    if (!res.ok) return failResult(res.status, (data && (data.message || data.error?.message)) || `HTTP ${res.status}`, data);
    return okResult({ data }, res.status);
  } catch (e) {
    return failResult(0, "Сеть/прокси недоступны (проверь backend и Vite proxy).", String(e));
  }
}

async function requestText(method, path) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: { "Accept": "text/plain, application/xml, text/xml, */*" },
    });
    const text = await res.text();
    if (!res.ok) return failResult(res.status, `HTTP ${res.status}`, text);
    return okResult({ text }, res.status);
  } catch (e) {
    return failResult(0, "Сеть/прокси недоступны (проверь backend и Vite proxy).", String(e));
  }
}

export async function apiMeta() {
  const r = await requestJson("GET", "/meta");
  return r.ok ? okResult({ meta: r.data }, r.status) : r;
}

export async function apiListSessions() {
  const r = await requestJson("GET", "/sessions");
  if (!r.ok) return r;
  const sessions = Array.isArray(r.data) ? r.data : (r.data?.sessions || []);
  return okResult({ sessions }, r.status);
}

export async function apiCreateSession(payload) {
  const r = await requestJson("POST", "/sessions", payload || {});
  if (!r.ok) return r;
  const s = r.data;
  const session_id = s?.session_id || s?.id || s?.session?.session_id || s?.session?.id || null;
  return okResult({ session: s, session_id }, r.status);
}

export async function apiGetSession(id) {
  const r = await requestJson("GET", `/sessions/${encodeURIComponent(id)}`);
  return r.ok ? okResult({ session: r.data }, r.status) : r;
}

export async function apiSaveSession(id, sessionShape) {
  const r = await requestJson("PATCH", `/sessions/${encodeURIComponent(id)}`, sessionShape || {});
  return r.ok ? okResult({ session: r.data }, r.status) : r;
}

export async function apiPostNote(id, note) {
  const payload =
    typeof note === "string" ? { text: note } :
    (note && typeof note === "object" ? note : { text: String(note || "") });

  const r = await requestJson("POST", `/sessions/${encodeURIComponent(id)}/notes`, payload);
  return r.ok ? okResult({ note_result: r.data }, r.status) : r;
}

export async function apiGetBpmn(id) {
  return requestText("GET", `/sessions/${encodeURIComponent(id)}/bpmn`);
}
EOF

echo
echo "== ensure theme forces Process title white (no BPMN recolor) =="
THEME="frontend/src/styles/theme_graphite.css"
if [ -f "$THEME" ] && ! grep -q "R18_PROCESS_TITLE" "$THEME"; then
cat >> "$THEME" <<'EOF'

/* R18_PROCESS_TITLE */
.processTitle,
.stageTitle,
.panelHead,
.panelTitle {
  color: var(--text) !important;
}
EOF
fi

echo
echo "== NotesPanel: generate + notes composer (left) =="
cat > frontend/src/components/NotesPanel.jsx <<'EOF'
import { useMemo, useState } from "react";

export default function NotesPanel({ draft, onAddNote, onGenerate, generateDisabled, generateHint, backendStatus }) {
  const roles = Array.isArray(draft?.roles) ? draft.roles : [];
  const notes = Array.isArray(draft?.notes) ? draft.notes : [];
  const startRole = typeof draft?.start_role === "string" ? draft.start_role : "";
  const [text, setText] = useState("");

  const badge = useMemo(() => {
    if (backendStatus === "ok") return <span className="badge ok">API OK</span>;
    if (backendStatus === "fail") return <span className="badge err">API FAIL</span>;
    return <span className="badge">API …</span>;
  }, [backendStatus]);

  return (
    <div className="panel">
      <div className="panelHead">Сессия {badge}</div>

      <div className="panelBody">
        <div className="card">
          <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>Акторы</div>
          {roles.length === 0 ? (
            <div className="small muted">Роли ещё не заданы.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {roles.map((r) => (
                <div key={r.role_id || r} className="small">
                  <span style={{ fontWeight: 900 }}>{r.label || r}</span>{" "}
                  {r.role_id ? <span className="muted">({r.role_id})</span> : null}
                </div>
              ))}
            </div>
          )}
          <div className="hr" />
          <div className="small">
            <span className="muted">start_role:</span>{" "}
            <span style={{ fontWeight: 900 }}>{startRole || "—"}</span>
          </div>
        </div>

        <div style={{ height: 10 }} />

        <button className="primaryBtn" onClick={onGenerate} disabled={!!generateDisabled}>
          Сгенерировать процесс
        </button>
        {generateHint ? <div className="small muted" style={{ marginTop: 8 }}>{generateHint}</div> : null}

        <div style={{ height: 12 }} />

        <div className="card">
          <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>Сообщения / заметки</div>

          {notes.length === 0 ? (
            <div className="small muted">Пока заметок нет.</div>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto" }}>
              {notes.slice().reverse().slice(0, 50).map((n) => (
                <div key={n.note_id || `${n.ts}_${n.text}`} className="small">
                  <div className="muted" style={{ fontSize: 11 }}>{n.ts ? new Date(n.ts).toLocaleString() : ""}</div>
                  <div>{n.text}</div>
                </div>
              ))}
            </div>
          )}

          <div className="hr" />

          <div className="inputRow">
            <input
              className="input"
              placeholder="Добавить заметку…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  const t = text.trim();
                  if (!t) return;
                  onAddNote(t);
                  setText("");
                }
              }}
            />
            <button className="secondaryBtn" onClick={() => {
              const t = text.trim();
              if (!t) return;
              onAddNote(t);
              setText("");
            }}>
              Отправить
            </button>
          </div>

          <div className="small muted" style={{ marginTop: 8 }}>Enter+Ctrl/⌘ — отправить.</div>
        </div>
      </div>
    </div>
  );
}
EOF

echo
echo "== ProcessStage: buttons active + copilot toggle + node click opens copilot =="
cat > frontend/src/components/ProcessStage.jsx <<'EOF'
import { useRef, useState } from "react";
import BpmnStage from "./process/BpmnStage";
import CopilotOverlay from "./process/CopilotOverlay";

export default function ProcessStage({ sessionId, mode, locked, bpmnXml, onRequestBpmnReload }) {
  const bpmnRef = useRef(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [selectedEl, setSelectedEl] = useState(null);

  return (
    <div className="stage">
      <div className="stageHead">
        <div className="processTitle">Процесс</div>

        <div className="stageActions">
          <button className="iconBtn" onClick={() => bpmnRef.current?.zoomOut?.()} title="Отдалить">−</button>
          <button className="iconBtn" onClick={() => bpmnRef.current?.zoomIn?.()} title="Приблизить">+</button>
          <button className="iconBtn" onClick={() => bpmnRef.current?.fit?.()} title="Вписать">⤢</button>
          <button className="iconBtn" onClick={() => onRequestBpmnReload?.()} disabled={!sessionId} title="Обновить BPMN">↻</button>
          <button className={copilotOpen ? "iconBtn active" : "iconBtn"} onClick={() => setCopilotOpen(v => !v)} title="AI Copilot">AI</button>
        </div>
      </div>

      <div className="stageBody">
        <BpmnStage
          ref={bpmnRef}
          sessionId={sessionId}
          locked={locked}
          mode={mode}
          xml={bpmnXml}
          onElementClick={(el) => {
            setSelectedEl(el || null);
            setCopilotOpen(true);
          }}
        />

        <CopilotOverlay open={copilotOpen} onClose={() => setCopilotOpen(false)} selectedEl={selectedEl} />
      </div>
    </div>
  );
}
EOF

echo
echo "== process/BpmnStage.jsx: forwardRef (fix ref warning) + load XML/API =="
cat > frontend/src/components/process/BpmnStage.jsx <<'EOF'
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import BpmnJS from "bpmn-js/dist/bpmn-viewer.production.min.js";
import { apiGetBpmn } from "../../lib/api";

const BpmnStage = forwardRef(function BpmnStage({ sessionId, xml, onElementClick }, ref) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    zoomIn() {
      const v = viewerRef.current; if (!v) return;
      const c = v.get("canvas"); c.zoom(c.zoom() + 0.2);
    },
    zoomOut() {
      const v = viewerRef.current; if (!v) return;
      const c = v.get("canvas"); c.zoom(Math.max(0.2, c.zoom() - 0.2));
    },
    fit() {
      const v = viewerRef.current; if (!v) return;
      v.get("canvas").zoom("fit-viewport");
    },
  }));

  useEffect(() => {
    if (!hostRef.current) return;
    const viewer = new BpmnJS({ container: hostRef.current });
    viewerRef.current = viewer;

    const eventBus = viewer.get("eventBus");
    eventBus.on("element.click", (e) => {
      const el = e?.element;
      if (!el) return;
      if (el.type === "label" || el.id === "__implicitroot") return;
      onElementClick?.(el);
    });

    return () => {
      try { viewer.destroy(); } catch {}
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    async function load() {
      if (!sessionId || String(sessionId).startsWith("local_")) return;
      const r = await apiGetBpmn(sessionId);
      if (r.ok && r.text) {
        await v.importXML(r.text);
        v.get("canvas").zoom("fit-viewport");
      }
    }
    load();
  }, [sessionId]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !xml) return;
    async function loadXml() {
      await v.importXML(xml);
      v.get("canvas").zoom("fit-viewport");
    }
    loadXml();
  }, [xml]);

  return (
    <div className="bpmnWrap">
      <div ref={hostRef} className="bpmnHost" style={{ height: "100%" }} />
    </div>
  );
});

export default BpmnStage;
EOF

echo
echo "== process/CopilotOverlay.jsx: minimal panel (no auto-open on canvas) =="
cat > frontend/src/components/process/CopilotOverlay.jsx <<'EOF'
export default function CopilotOverlay({ open, onClose, selectedEl }) {
  if (!open) return null;

  return (
    <div className="copilotPanel">
      <div className="copilotHead">
        <div style={{ fontWeight: 900 }}>AI Copilot</div>
        <button className="iconBtn" onClick={onClose} title="Закрыть">✕</button>
      </div>

      <div className="copilotBody">
        {!selectedEl ? (
          <div className="small muted">Выбери узел на схеме, чтобы получить вопросы по нему.</div>
        ) : (
          <div className="card node" data-status="info" data-selected="true">
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Узел: {selectedEl.id}</div>
            <div className="small muted" style={{ marginBottom: 10 }}>Тип: {selectedEl.type}</div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span className="pill">Критерии “готово”</span>
              <span className="pill">Параметры/допуски</span>
              <span className="pill" data-priority="high">Что при отклонении?</span>
              <span className="pill">Что фиксируем?</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
EOF

echo
echo "== App.jsx: wire TopBar/Generate/Notes to backend (PATCH full + GET /bpmn) =="
cat > frontend/src/App.jsx <<'EOF'
import { useEffect, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import NotesPanel from "./components/NotesPanel";
import NoSession from "./components/stages/NoSession";
import ActorsSetup from "./components/stages/ActorsSetup";
import { uid } from "./lib/ids";
import { ensureDraftShape, hasActors, readDraft, writeDraft } from "./lib/draft";
import { apiCreateSession, apiGetBpmn, apiGetSession, apiListSessions, apiMeta, apiPostNote, apiSaveSession } from "./lib/api";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

export default function App() {
  const initial = useMemo(() => ensureDraftShape(readDraft()), []);
  const [draft, setDraft] = useState(initial || { session_id: "", title: "", roles: [], start_role: "", notes: [], nodes: [], edges: [], questions: [] });

  const [sessions, setSessions] = useState([]);
  const [backendStatus, setBackendStatus] = useState("idle"); // idle | ok | fail
  const [backendHint, setBackendHint] = useState("");
  const [bpmnXml, setBpmnXml] = useState("");

  const phase = !draft.session_id ? "no_session" : hasActors(draft) ? "interview" : "actors_setup";
  const locked = phase !== "interview";

  function updateDraft(next) {
    const shaped = ensureDraftShape(next);
    setDraft(shaped);
    writeDraft(shaped);
  }

  async function refreshMetaAndSessions() {
    const m = await apiMeta();
    const s = await apiListSessions();
    if (m.ok && s.ok) {
      setBackendStatus("ok");
      setBackendHint("");
      setSessions(s.sessions || []);
      return;
    }
    setBackendStatus("fail");
    setBackendHint(m.message || s.message || "API недоступно.");
    setSessions([]);
  }

  useEffect(() => { refreshMetaAndSessions(); }, []);

  function createLocalSession() {
    const session_id = `local_${Date.now()}`;
    updateDraft({ session_id, title: "Local session", roles: [], start_role: "", notes: [], nodes: [], edges: [], questions: [] });
    setBpmnXml("");
  }

  async function createBackendSession() {
    const r = await apiCreateSession({ title: "Interview session" });
    if (!r.ok || !r.session_id) {
      setBackendStatus("fail");
      setBackendHint(r.status === 401 ? "API вернул 401 (нужна авторизация?)" : (r.message || "Не удалось создать сессию через API."));
      return;
    }
    setBackendStatus("ok");
    setBackendHint("");
    updateDraft({ session_id: r.session_id, ...(r.session || {}), roles: [], start_role: "", notes: [], nodes: [], edges: [], questions: [] });
    await refreshMetaAndSessions();
  }

  async function openSession(sessionId) {
    if (!sessionId) return;
    const r = await apiGetSession(sessionId);
    if (!r.ok || !r.session) {
      setBackendStatus("fail");
      setBackendHint(r.message || "Не удалось открыть сессию через API.");
      return;
    }
    setBackendStatus("ok");
    setBackendHint("");
    updateDraft(r.session);
    setBpmnXml("");
  }

  function saveActors({ roles, start_role }) {
    updateDraft({ ...draft, roles, start_role });
  }

  async function addNote(text) {
    const note = { note_id: uid("note"), ts: new Date().toISOString(), author: "user", text };
    const next = { ...draft, notes: [...(draft.notes || []), note] };
    updateDraft(next);

    if (draft.session_id && !isLocalSessionId(draft.session_id)) {
      await apiPostNote(draft.session_id, { text, ts: note.ts, author: note.author });
    }
  }

  async function generateProcess() {
    if (!draft.session_id) return;

    if (isLocalSessionId(draft.session_id)) {
      setBackendStatus("fail");
      setBackendHint("Для генерации BPMN нужен Backend session: нажми “Новая (API)”.");
      return;
    }

    const saved = await apiSaveSession(draft.session_id, draft); // PATCH full shape
    if (!saved.ok) {
      setBackendStatus("fail");
      setBackendHint(saved.message || "Не удалось сохранить сессию (PATCH).");
      return;
    }
    if (saved.session) updateDraft(saved.session);

    const bpmn = await apiGetBpmn(draft.session_id); // GET /bpmn
    if (!bpmn.ok || !bpmn.text) {
      setBackendStatus("fail");
      setBackendHint(bpmn.message || "Не удалось получить BPMN (GET /bpmn).");
      return;
    }

    setBackendStatus("ok");
    setBackendHint("");
    setBpmnXml(bpmn.text);
  }

  const generateDisabled = locked || !(draft.roles?.length) || !draft.start_role;
  const generateHint = locked
    ? "Сначала заполни роли и выбери start_role."
    : isLocalSessionId(draft.session_id)
      ? "Local draft: для BPMN нажми “Новая (API)” и продолжай в backend session."
      : "PATCH session → GET /bpmn → рендер в viewer.";

  const left =
    phase === "no_session" ? (
      <NoSession onCreateBackend={createBackendSession} onCreateLocal={createLocalSession} backendHint={backendHint} />
    ) : phase === "actors_setup" ? (
      <ActorsSetup draft={draft} onSaveActors={saveActors} />
    ) : (
      <NotesPanel
        draft={draft}
        onAddNote={addNote}
        onGenerate={generateProcess}
        generateDisabled={generateDisabled}
        generateHint={generateHint}
        backendStatus={backendStatus}
      />
    );

  return (
    <AppShell
      sessionId={draft.session_id}
      mode={phase}
      left={left}
      locked={locked}
      sessions={sessions}
      backendStatus={backendStatus}
      backendHint={backendHint}
      onRefreshSessions={refreshMetaAndSessions}
      onNewLocalSession={createLocalSession}
      onNewBackendSession={createBackendSession}
      onOpenSession={openSession}
      bpmnXml={bpmnXml}
      onRequestBpmnReload={() => setBpmnXml("")}
    />
  );
}
EOF

echo
echo "== ensure TopBar exists (RU + wired) =="
cat > frontend/src/components/TopBar.jsx <<'EOF'
import { useMemo } from "react";

export default function TopBar({ sessionId, sessions, backendStatus, backendHint, onRefresh, onNewLocal, onNewBackend, onOpen }) {
  const badge = useMemo(() => {
    if (backendStatus === "ok") return <span className="badge ok">API OK</span>;
    if (backendStatus === "fail") return <span className="badge err">API FAIL</span>;
    return <span className="badge">API …</span>;
  }, [backendStatus]);

  return (
    <div className="topbar">
      <div className="topLeft">
        <div className="brand">Food Process Copilot</div>
        {badge}
        {backendHint ? <div className="hint">{backendHint}</div> : null}
      </div>

      <div className="topRight">
        <select className="select" value={sessionId || ""} onChange={(e) => onOpen?.(e.target.value)}>
          <option value="">— выбрать сессию —</option>
          {(sessions || []).map((s) => {
            const id = s.session_id || s.id;
            const title = s.title || id;
            return <option key={id} value={id}>{title}</option>;
          })}
        </select>

        <button className="secondaryBtn" onClick={onRefresh} title="Обновить список сессий">Обновить</button>
        <button className="secondaryBtn" onClick={onNewLocal} title="Создать локальный черновик">Новая (Local)</button>
        <button className="primaryBtn smallBtn" onClick={onNewBackend} title="Создать backend-сессию">Новая (API)</button>
      </div>
    </div>
  );
}
EOF

echo
echo "== ensure AppShell exists (fallback) =="
if [ ! -f frontend/src/components/AppShell.jsx ]; then
cat > frontend/src/components/AppShell.jsx <<'EOF'
import TopBar from "./TopBar";
import ProcessStage from "./ProcessStage";

export default function AppShell({
  sessionId,
  mode,
  left,
  locked,
  sessions,
  backendStatus,
  backendHint,
  onRefreshSessions,
  onNewLocalSession,
  onNewBackendSession,
  onOpenSession,
  bpmnXml,
  onRequestBpmnReload,
}) {
  return (
    <div className="app">
      <TopBar
        sessionId={sessionId}
        sessions={sessions}
        backendStatus={backendStatus}
        backendHint={backendHint}
        onRefresh={onRefreshSessions}
        onNewLocal={onNewLocalSession}
        onNewBackend={onNewBackendSession}
        onOpen={onOpenSession}
      />

      <div className="appBody">
        <div className="leftCol">{left}</div>
        <div className="mainCol">
          <ProcessStage
            sessionId={sessionId}
            mode={mode}
            locked={locked}
            bpmnXml={bpmnXml}
            onRequestBpmnReload={onRequestBpmnReload}
          />
        </div>
      </div>
    </div>
  );
}
EOF
fi

echo
echo "== append CSS helpers (non-breaking) =="
APP_CSS="frontend/src/styles/app.css"
if [ -f "$APP_CSS" ] && ! grep -q "R18_STAGE_LAYOUT" "$APP_CSS"; then
cat >> "$APP_CSS" <<'EOF'

/* R18_STAGE_LAYOUT */
.app { min-height: 100vh; }
.topbar { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 14px; }
.topLeft { display:flex; align-items:center; gap:10px; }
.brand { font-weight:900; letter-spacing:.2px; }
.hint { font-size:12px; color:var(--muted); max-width:520px; }
.topRight { display:flex; align-items:center; gap:10px; }
.select { padding:9px 10px; border-radius:12px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.12); color:var(--text); }
.select option { color:#111; }
.appBody { display:grid; grid-template-columns:380px 1fr; gap:14px; padding:14px; }
.stage { height: calc(100vh - 80px); display:flex; flex-direction:column; }
.stageHead { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; }
.processTitle { font-weight:900; font-size:14px; }
.stageActions { display:flex; align-items:center; gap:8px; }
.iconBtn { width:36px; height:34px; border-radius:12px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.12); color:var(--text); }
.iconBtn.active { outline:2px solid var(--ring); outline-offset:2px; }
.stageBody { position:relative; flex:1; min-height:0; }
.bpmnWrap { height:100%; border-radius:var(--r-lg); overflow:hidden; }
.bpmnHost { height:100%; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.10); border-radius:var(--r-lg); }

.copilotPanel {
  position:absolute; top:12px; right:12px; width:360px;
  max-height:calc(100% - 24px); overflow:auto; z-index:20;
  background:var(--panel); border:1px solid var(--border);
  border-radius:var(--r-lg); box-shadow:var(--shadow); backdrop-filter: blur(14px);
}
.copilotHead { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); }
.copilotBody { padding:12px; }

.badge { font-size:11px; padding:5px 8px; border-radius:999px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.05); }
.badge.ok { border-color: rgba(47,229,140,.35); background: rgba(47,229,140,.10); }
.badge.err { border-color: rgba(255,77,77,.35); background: rgba(255,77,77,.10); }

.smallBtn { padding:9px 10px; font-size:13px; }
.inputRow { display:flex; gap:10px; align-items:center; }
EOF
fi

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== diff stat =="
git diff --stat || true

echo
echo "== commit (frontend only) =="
git add -A frontend .tools
git status -sb || true
git commit -m "feat(frontend): wire TopBar/Generate/Notes to backend (PATCH full session + GET /bpmn) + fix Process title" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R18 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend .tools -x "frontend/node_modules/*" -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout "$TAG_START""
