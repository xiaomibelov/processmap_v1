set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="feat/frontend-r3-actors-first-v1"
TAG_START="cp/foodproc_frontend_r3_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r3_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r3_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R3 start (${TS})" >/dev/null 2>&1 || true
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
echo "== unstage helper scripts/artifacts if any =="
git restore --staged StepR*.sh 2>/dev/null || true
git restore --staged artifacts 2>/dev/null || true
git restore --staged artifacts/* 2>/dev/null || true

echo
echo "== ensure dirs =="
mkdir -p frontend/src/components/stages frontend/src/lib

echo
echo "== lib: ids + draft =="
cat > frontend/src/lib/ids.js <<'EOF'
export function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
EOF

cat > frontend/src/lib/draft.js <<'EOF'
import { readJson, writeJson } from "./storage";

export const LS_KEY = "fp_copilot_draft_v0";

export function readDraft() {
  return readJson(LS_KEY, null);
}

export function writeDraft(draft) {
  writeJson(LS_KEY, draft);
}

export function ensureDraftShape(d) {
  if (!d || typeof d !== "object") return null;

  const roles = Array.isArray(d.roles) ? d.roles : [];
  const notes = Array.isArray(d.notes) ? d.notes : [];

  return {
    session_id: typeof d.session_id === "string" ? d.session_id : "",
    title: typeof d.title === "string" ? d.title : "",
    roles,
    start_role: typeof d.start_role === "string" ? d.start_role : "",
    notes,
  };
}

export function hasActors(draft) {
  return (
    !!draft &&
    Array.isArray(draft.roles) &&
    draft.roles.length > 0 &&
    typeof draft.start_role === "string" &&
    draft.start_role.length > 0
  );
}
EOF

echo
echo "== stages: NoSession / ActorsSetup =="
cat > frontend/src/components/stages/NoSession.jsx <<'EOF'
export default function NoSession({ onCreateLocal }) {
  return (
    <div className="panel">
      <div className="panelHead">Сессия</div>
      <div className="panelBody">
        <div style={{ fontWeight: 900, marginBottom: 6 }}>NoSession</div>
        <div className="small muted" style={{ marginBottom: 12 }}>
          Сначала нужно создать/открыть сессию. На этом шаге делаем минимум:
          локальная сессия (draft в localStorage). API подключим следующим шагом.
        </div>

        <button className="primaryBtn" onClick={onCreateLocal}>
          Создать сессию
        </button>

        <div className="small muted" style={{ marginTop: 10 }}>
          План: GET/POST /api/sessions + селектор сессий в TopBar.
        </div>
      </div>
    </div>
  );
}
EOF

cat > frontend/src/components/stages/ActorsSetup.jsx <<'EOF'
import { useMemo, useState } from "react";
import { uid } from "../../lib/ids";

function normalizeRoleId(s) {
  const v = String(s || "").trim();
  if (!v) return "";
  return v
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 32);
}

export default function ActorsSetup({ draft, onSaveActors }) {
  const [label, setLabel] = useState("");
  const [roles, setRoles] = useState(Array.isArray(draft.roles) ? draft.roles : []);
  const [startRole, setStartRole] = useState(typeof draft.start_role === "string" ? draft.start_role : "");

  const options = useMemo(
    () => roles.map((r) => ({ value: r.role_id, label: r.label })),
    [roles]
  );

  function addRole() {
    const v = label.trim();
    if (!v) return;

    const base = normalizeRoleId(v);
    let role_id = base || `role_${roles.length + 1}`;
    if (roles.some((r) => r.role_id === role_id)) {
      role_id = `${role_id}_${uid("r").slice(-4)}`;
    }

    const next = [...roles, { role_id, label: v }];
    setRoles(next);
    if (!startRole) setStartRole(role_id);
    setLabel("");
  }

  function removeRole(role_id) {
    const next = roles.filter((r) => r.role_id !== role_id);
    setRoles(next);
    if (startRole === role_id) setStartRole(next[0]?.role_id || "");
  }

  const canStart = roles.length > 0 && !!startRole;

  return (
    <div className="panel">
      <div className="panelHead">Actors-first</div>
      <div className="panelBody">
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Настройка акторов</div>
        <div className="small muted" style={{ marginBottom: 12 }}>
          Добавь роли (cook_1, hot_shop_operator и т.д.) и выбери <strong>start_role</strong>.
          Пока это не заполнено — интервью/заметки блокируются.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Роли</div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Напр: Повар 1 / Горячий цех"
                className="textarea"
                style={{ minHeight: 40, height: 40, resize: "none" }}
              />
              <button className="btn" onClick={addRole} disabled={!label.trim()}>
                Добавить
              </button>
            </div>

            <div className="hr" />

            {roles.length === 0 ? (
              <div className="small muted">Пока ролей нет.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {roles.map((r) => (
                  <div key={r.role_id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ fontWeight: 900 }}>{r.label}</div>
                    <div className="small muted">({r.role_id})</div>
                    <div style={{ flex: 1 }} />
                    <button className="btn" onClick={() => removeRole(r.role_id)}>
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Start role</div>

            <select
              className="textarea"
              style={{ minHeight: 40, height: 40, resize: "none" }}
              value={startRole}
              onChange={(e) => setStartRole(e.target.value)}
              disabled={roles.length === 0}
            >
              <option value="">— выбрать —</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({o.value})
                </option>
              ))}
            </select>

            <div className="small muted" style={{ marginTop: 8 }}>
              Это актор, который начинает процесс.
            </div>
          </div>

          <button
            className="primaryBtn"
            disabled={!canStart}
            onClick={() => onSaveActors({ roles, start_role: startRole })}
          >
            Начать интервью
          </button>

          {!canStart ? (
            <div className="small muted">
              Нужны минимум 1 роль и выбранный start_role.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
EOF

echo
echo "== ProcessStage: mode-aware (actors-first overlay) =="
cat > frontend/src/components/ProcessStage.jsx <<'EOF'
import CopilotOverlay from "./process/CopilotOverlay";

export default function ProcessStage({ mode }) {
  const isInterview = mode === "interview";

  return (
    <div className="panel processPanel">
      <div className="processHead">
        <div className="title">
          Процесс <span className="muted" style={{ fontWeight: 600 }}>(Workflow)</span>
        </div>
        <div className="spacer" />
        <button className="btn" disabled>−</button>
        <button className="btn" disabled>+</button>
        <button className="btn" disabled>Fit</button>
      </div>

      <div className="processCanvas">
        <div className="lanesBg" />

        <div className="laneLabel" style={{ top: 78 }}>Горячий цех</div>
        <div className="laneLabel" style={{ top: 166 }}>Упаковка</div>
        <div className="laneLabel" style={{ top: 254 }}>Контроль качества</div>
        <div className="laneLabel" style={{ top: 342 }}>Логистика</div>

        {!isInterview ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
            <div className="card" style={{ maxWidth: 560 }}>
              <div style={{ fontWeight: 950, marginBottom: 6 }}>Actors-first</div>
              <div className="small muted">
                Заполни роли и start_role. После этого включится режим интервью и активируется док заметок.
              </div>
            </div>
          </div>
        ) : null}

        {isInterview ? (
          <>
            <div className="mockCircle mockStart" style={{ position: "absolute", left: 56, top: 78 }}>●</div>
            <div className="small muted" style={{ position: "absolute", left: 58, top: 128, fontWeight: 800 }}>Старт</div>

            <div className="mockNode" style={{ left: 140, top: 66, width: 170 }}>
              Подготовка<br />ингредиентов
            </div>

            <div className="arrow" style={{ left: 108, top: 101, width: 30 }} />
            <div className="arrow" style={{ left: 224, top: 146, width: 2, height: 34, background: "rgba(16,24,40,0.55)" }} />

            <div className="mockNode" style={{ left: 160, top: 150, width: 160 }}>
              Обжарка<br />на сковороде
            </div>

            <div className="arrow" style={{ left: 322, top: 182, width: 52 }} />

            <div className="mockNode" style={{ left: 380, top: 150, width: 150 }}>
              Довести<br />до готовности
            </div>

            <div className="arrow" style={{ left: 450, top: 206, width: 2, height: 52, background: "rgba(16,24,40,0.55)" }} />

            <div className="mockNode" style={{ left: 360, top: 244, width: 160 }}>
              Упаковка<br />блюда
            </div>

            <div className="arrow" style={{ left: 522, top: 276, width: 52 }} />

            <div className="mockNode" style={{ left: 580, top: 244, width: 170 }}>
              Проверка<br />качества
            </div>

            <div className="arrow" style={{ left: 752, top: 276, width: 52 }} />

            <div className="mockNode" style={{ left: 810, top: 244, width: 42, textAlign: "center" }}>
              ◇
            </div>

            <div className="arrow" style={{ left: 828, top: 286, width: 2, height: 78, background: "rgba(16,24,40,0.55)" }} />

            <div className="mockNode" style={{ left: 760, top: 342, width: 170 }}>
              Отправка<br />на доставку
            </div>

            <div className="arrow" style={{ left: 838, top: 396, width: 2, height: 56, background: "rgba(16,24,40,0.55)" }} />

            <div className="mockCircle mockEnd" style={{ position: "absolute", left: 816, top: 450 }}>●</div>
            <div className="small muted" style={{ position: "absolute", left: 808, top: 500, fontWeight: 800 }}>Финиш</div>

            <CopilotOverlay />
          </>
        ) : null}
      </div>
    </div>
  );
}
EOF

echo
echo "== BottomDock: store notes + show last notes =="
cat > frontend/src/components/BottomDock.jsx <<'EOF'
import { useMemo, useState } from "react";

export default function BottomDock({ locked, notes, onAddNote }) {
  const [text, setText] = useState("");

  const last = useMemo(() => {
    const arr = Array.isArray(notes) ? notes : [];
    return arr.slice(-3).reverse();
  }, [notes]);

  function send() {
    const v = text.trim();
    if (!v) return;
    onAddNote(v);
    setText("");
  }

  return (
    <div className="bottomDock">
      <div className="dockHead">
        <div style={{ fontWeight: 900, color: "#0f172a" }}>Сообщения / Заметки</div>
        <div className="spacer" />
        <button className="btn" disabled>Expand</button>
      </div>

      <div className="dockBody">
        <div className="small muted">
          {locked
            ? "Actors-first: сначала роли и start_role. Потом — интервью и заметки."
            : "Заметки сохраняются в localStorage (не теряются при F5). Далее подключим /api/sessions/{id}/notes."}
        </div>

        {!locked && last.length > 0 ? (
          <div className="card">
            <div className="small muted" style={{ fontWeight: 900, marginBottom: 6 }}>
              Последние заметки
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {last.map((n) => (
                <div key={n.note_id} className="small">
                  <span className="muted">[{new Date(n.ts).toLocaleTimeString()}]</span> {n.text}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="inputRow">
          <textarea
            className="textarea"
            placeholder={locked ? "Сначала заполните Actors (roles + start_role)..." : "Введите сообщение..."}
            disabled={locked}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn" disabled={locked || !text.trim()} onClick={send}>
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
EOF

echo
echo "== AppShell: left slot + mode to ProcessStage =="
cat > frontend/src/components/AppShell.jsx <<'EOF'
import TopBar from "./TopBar";
import ProcessStage from "./ProcessStage";
import BottomDock from "./BottomDock";

export default function AppShell({
  sessionId,
  mode,
  left,
  locked,
  notes,
  onAddNote,
  onNewLocalSession,
}) {
  return (
    <div className="shell">
      <TopBar
        sessionId={sessionId}
        onNewSession={onNewLocalSession}
        onOpenSession={() => {}}
      />

      <div className="workspace">
        {left}
        <ProcessStage mode={mode} />
      </div>

      <BottomDock locked={locked} notes={notes} onAddNote={onAddNote} />
    </div>
  );
}
EOF

echo
echo "== TopBar: enable New (local session) =="
cat > frontend/src/components/TopBar.jsx <<'EOF'
export default function TopBar({ sessionId, onNewSession, onOpenSession }) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brandBadge" />
        <div>Food Process Copilot</div>
      </div>

      <div className="spacer" />

      <div style={{ fontWeight: 800, opacity: 0.95 }}>
        Session: <span style={{ fontWeight: 950 }}>{sessionId || "—"}</span>
      </div>

      <button className="iconBtn" title="Help" disabled>?</button>
      <button className="iconBtn" title="Notes" disabled>💬</button>
      <button className="iconBtn" title="User" disabled>👤</button>

      <button className="iconBtn" title="Open session (later)" onClick={onOpenSession} disabled>⤓</button>
      <button className="iconBtn" title="New local session" onClick={onNewSession}>＋</button>
    </div>
  );
}
EOF

echo
echo "== App.jsx: state machine NoSession -> ActorsSetup -> Interview =="
cat > frontend/src/App.jsx <<'EOF'
import { useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import NotesPanel from "./components/NotesPanel";
import NoSession from "./components/stages/NoSession";
import ActorsSetup from "./components/stages/ActorsSetup";
import { uid } from "./lib/ids";
import { ensureDraftShape, hasActors, readDraft, writeDraft } from "./lib/draft";

export default function App() {
  const initial = useMemo(() => ensureDraftShape(readDraft()), []);
  const [draft, setDraft] = useState(
    initial || { session_id: "", title: "", roles: [], start_role: "", notes: [] }
  );

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

  function createLocalSession() {
    const session_id = `local_${Date.now()}`;
    updateDraft({ session_id, title: "Local session", roles: [], start_role: "", notes: [] });
  }

  function saveActors({ roles, start_role }) {
    updateDraft({ ...draft, roles, start_role });
  }

  function addNote(text) {
    const note = {
      note_id: uid("note"),
      ts: new Date().toISOString(),
      author: "user",
      text,
    };
    updateDraft({ ...draft, notes: [...(draft.notes || []), note] });
  }

  const left =
    phase === "no_session" ? (
      <NoSession onCreateLocal={createLocalSession} />
    ) : phase === "actors_setup" ? (
      <ActorsSetup draft={draft} onSaveActors={saveActors} />
    ) : (
      <NotesPanel locked={false} />
    );

  return (
    <AppShell
      sessionId={draft.session_id}
      mode={phase}
      left={left}
      locked={locked}
      notes={draft.notes || []}
      onAddNote={addNote}
      onNewLocalSession={createLocalSession}
    />
  );
}
EOF

echo
echo "== ensure deps installed =="
if [ -d frontend/node_modules ]; then
  echo "ok: node_modules exists"
else
  ( cd frontend && npm install )
fi

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== commit (frontend only) =="
git add -A frontend
git status -sb || true
git commit -m "feat(frontend): Actors-first userflow + localStorage notes (R3)" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R3 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
