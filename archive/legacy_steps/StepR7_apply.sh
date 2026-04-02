#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="feat/frontend-r7-backend-bridge-v1"
TAG_START="cp/foodproc_frontend_r7_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r7_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r7_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R7 start (${TS})" >/dev/null 2>&1 || true
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
echo "== ensure vite proxy /api -> http://127.0.0.1:8011 =="
if [ -f frontend/vite.config.js ]; then
  true
elif [ -f frontend/vite.config.mjs ]; then
  true
else
  cat > frontend/vite.config.js <<'EOF'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8011",
    },
  },
});
EOF
fi

echo
echo "== write api client (frontend/src/lib/api.js) =="
mkdir -p frontend/src/lib
cat > frontend/src/lib/api.js <<'EOF'
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    ...opts,
  });
  return res;
}

export async function apiListSessions() {
  try {
    const res = await apiFetch("/api/sessions", { method: "GET" });
    if (!res.ok) return { ok: false, sessions: [], status: res.status };
    const data = await res.json();
    return { ok: true, sessions: Array.isArray(data) ? data : [], status: res.status };
  } catch {
    return { ok: false, sessions: [], status: 0 };
  }
}

export async function apiCreateSession({ title } = {}) {
  try {
    const res = await apiFetch("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ title: title || "" }),
    });
    if (!res.ok) return { ok: false, session_id: "", status: res.status };
    const data = await res.json().catch(() => ({}));
    const session_id = typeof data.session_id === "string" ? data.session_id : "";
    return { ok: Boolean(session_id), session_id, status: res.status };
  } catch {
    return { ok: false, session_id: "", status: 0 };
  }
}

export async function apiGetSession(sessionId) {
  if (!sessionId) return { ok: false, session: null, status: 0 };
  try {
    const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" });
    if (!res.ok) return { ok: false, session: null, status: res.status };
    const data = await res.json().catch(() => null);
    return { ok: true, session: data, status: res.status };
  } catch {
    return { ok: false, session: null, status: 0 };
  }
}

export async function apiPostNote(sessionId, { text, ts, author } = {}) {
  if (!sessionId) return { ok: false, status: 0 };
  try {
    const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/notes`, {
      method: "POST",
      body: JSON.stringify({
        text: text || "",
        ts: ts || undefined,
        author: author || undefined,
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
EOF

echo
echo "== update TopBar: session selector + backend actions =="
cat > frontend/src/components/TopBar.jsx <<'EOF'
export default function TopBar({
  sessionId,
  sessions,
  backendStatus,
  onRefreshSessions,
  onNewBackendSession,
  onOpenSession,
}) {
  const items = Array.isArray(sessions) ? sessions : [];
  const statusLabel =
    backendStatus === "ok"
      ? "API: ok"
      : backendStatus === "fail"
        ? "API: fail"
        : "API: …";

  return (
    <div className="topbar">
      <div className="brand">
        <span className="dot" />
        <span>Food Process Copilot</span>
      </div>

      <div className="spacer" />

      <div className="small" style={{ color: "rgba(255,255,255,0.85)", fontWeight: 800 }}>
        {statusLabel}
      </div>

      <div style={{ width: 12 }} />

      <div className="small" style={{ color: "rgba(255,255,255,0.85)", fontWeight: 800 }}>
        Session: <span style={{ color: "#fff" }}>{sessionId || "—"}</span>
      </div>

      <div style={{ width: 12 }} />

      <select
        className="input"
        style={{ height: 34, minWidth: 260 }}
        value={sessionId || ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onOpenSession(v);
        }}
      >
        <option value="">— открыть сессию —</option>
        {items.map((s) => (
          <option key={s.session_id} value={s.session_id}>
            {s.title ? `${s.title} · ${s.session_id}` : s.session_id}
          </option>
        ))}
      </select>

      <div style={{ width: 8 }} />

      <button className="btn" onClick={onRefreshSessions} title="Обновить список">
        ↻
      </button>

      <div style={{ width: 8 }} />

      <button className="primaryBtn" style={{ height: 34 }} onClick={onNewBackendSession}>
        + New (API)
      </button>
    </div>
  );
}
EOF

echo
echo "== update NoSession: backend first + local fallback =="
cat > frontend/src/components/stages/NoSession.jsx <<'EOF'
export default function NoSession({ onCreateBackend, onCreateLocal, backendHint }) {
  return (
    <div className="panel">
      <div className="panelHead">Сессия</div>
      <div className="panelBody">
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Backend ↔ Frontend</div>
          <div className="small muted">
            Чтобы BPMN грузился с бэка, нужен реальный session_id (не local_*).
            Создай сессию через API — и фронт начнёт ходить в /api/sessions/&lt;id&gt;/bpmn и /notes.
          </div>
          {backendHint ? (
            <div className="small muted" style={{ marginTop: 8 }}>
              {backendHint}
            </div>
          ) : null}
        </div>

        <button className="primaryBtn" style={{ width: "100%", marginBottom: 10 }} onClick={onCreateBackend}>
          Создать сессию (API)
        </button>

        <button className="btn" style={{ width: "100%" }} onClick={onCreateLocal}>
          Local draft (без API)
        </button>

        <div className="small muted" style={{ marginTop: 10 }}>
          Local draft остаётся как fallback, но для “соединить бэк и фронт” используем API-сессию.
        </div>
      </div>
    </div>
  );
}
EOF

echo
echo "== update AppShell: pass backend props to TopBar =="
cat > frontend/src/components/AppShell.jsx <<'EOF'
import TopBar from "./TopBar";
import ProcessStage from "./ProcessStage";
import BottomDock from "./BottomDock";

export default function AppShell({
  sessionId,
  roles,
  mode,
  left,
  locked,
  notes,
  onAddNote,
  onNewLocalSession,
  sessions,
  backendStatus,
  onRefreshSessions,
  onNewBackendSession,
  onOpenSession,
}) {
  return (
    <div className="shell">
      <TopBar
        sessionId={sessionId}
        sessions={sessions}
        backendStatus={backendStatus}
        onRefreshSessions={onRefreshSessions}
        onNewBackendSession={onNewBackendSession}
        onOpenSession={onOpenSession}
      />

      <div className="workspace">
        {left}
        <ProcessStage mode={mode} sessionId={sessionId} roles={roles} onAddNote={onAddNote} />
      </div>

      <BottomDock locked={locked} notes={notes} onAddNote={onAddNote} />
    </div>
  );
}
EOF

echo
echo "== update App.jsx: backend sessions + create/open + post notes =="
cat > frontend/src/App.jsx <<'EOF'
import { useEffect, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import NotesPanel from "./components/NotesPanel";
import NoSession from "./components/stages/NoSession";
import ActorsSetup from "./components/stages/ActorsSetup";
import { uid } from "./lib/ids";
import { ensureDraftShape, hasActors, readDraft, writeDraft } from "./lib/draft";
import { apiCreateSession, apiGetSession, apiListSessions, apiPostNote } from "./lib/api";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

export default function App() {
  const initial = useMemo(() => ensureDraftShape(readDraft()), []);
  const [draft, setDraft] = useState(
    initial || { session_id: "", title: "", roles: [], start_role: "", notes: [] }
  );

  const [sessions, setSessions] = useState([]);
  const [backendStatus, setBackendStatus] = useState("idle"); // idle | ok | fail
  const [backendHint, setBackendHint] = useState("");

  const phase = !draft.session_id
    ? "no_session"
    : hasActors(draft)
      ? "interview"
      : "actors_setup";

  const locked = phase !== "interview";

  function updateDraft(next) {
    setDraft(next);
    writeDraft(next);
  }

  async function refreshSessions() {
    const r = await apiListSessions();
    if (r.ok) {
      setBackendStatus("ok");
      setBackendHint("");
      setSessions(r.sessions || []);
    } else {
      setBackendStatus("fail");
      setBackendHint(r.status === 401 ? "API вернул 401 (нужна авторизация?)" : "API недоступно или вернуло ошибку.");
      setSessions([]);
    }
  }

  useEffect(() => {
    refreshSessions();
  }, []);

  function createLocalSession() {
    const session_id = `local_${Date.now()}`;
    updateDraft({ session_id, title: "Local session", roles: [], start_role: "", notes: [] });
  }

  async function createBackendSession() {
    const r = await apiCreateSession({ title: "Interview session" });
    if (!r.ok) {
      setBackendStatus("fail");
      setBackendHint(r.status === 401 ? "API вернул 401 (нужна авторизация?)" : "Не удалось создать сессию через API.");
      return;
    }
    setBackendStatus("ok");
    setBackendHint("");
    updateDraft({ session_id: r.session_id, title: "Interview session", roles: [], start_role: "", notes: [] });
    refreshSessions();
  }

  async function openSession(sessionId) {
    if (!sessionId) return;
    const r = await apiGetSession(sessionId);
    if (!r.ok || !r.session) {
      setBackendStatus("fail");
      setBackendHint("Не удалось открыть сессию через API.");
      return;
    }
    setBackendStatus("ok");
    setBackendHint("");
    const shaped = ensureDraftShape(r.session);
    updateDraft(shaped);
  }

  function saveActors({ roles, start_role }) {
    updateDraft({ ...draft, roles, start_role });
  }

  async function addNote(text) {
    const note = {
      note_id: uid("note"),
      ts: new Date().toISOString(),
      author: "user",
      text,
    };
    const next = { ...draft, notes: [...(draft.notes || []), note] };
    updateDraft(next);

    if (draft.session_id && !isLocalSessionId(draft.session_id)) {
      await apiPostNote(draft.session_id, { text, ts: note.ts, author: note.author });
    }
  }

  const left =
    phase === "no_session" ? (
      <NoSession
        onCreateBackend={createBackendSession}
        onCreateLocal={createLocalSession}
        backendHint={backendHint}
      />
    ) : phase === "actors_setup" ? (
      <ActorsSetup draft={draft} onSaveActors={saveActors} />
    ) : (
      <NotesPanel draft={draft} />
    );

  return (
    <AppShell
      sessionId={draft.session_id}
      roles={draft.roles || []}
      mode={phase}
      left={left}
      locked={locked}
      notes={draft.notes || []}
      onAddNote={addNote}
      onNewLocalSession={createLocalSession}
      sessions={sessions}
      backendStatus={backendStatus}
      onRefreshSessions={refreshSessions}
      onNewBackendSession={createBackendSession}
      onOpenSession={openSession}
    />
  );
}
EOF

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== diff stat =="
git diff --stat || true

echo
echo "== commit (frontend only) =="
git add -A frontend
git status -sb || true
git commit -m "feat(frontend): bridge to backend sessions + notes (R7)" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R7 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend \
  -x "frontend/node_modules/*" \
  -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
