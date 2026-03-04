#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="chore/frontend-r5-remove-demos-v1"
TAG_START="cp/foodproc_frontend_r5_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r5_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r5_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R5 start (${TS})" >/dev/null 2>&1 || true
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
echo "== docs: contract_session_api.md =="
mkdir -p docs
cat > docs/contract_session_api.md <<'EOF'
# Session API contract (draft)

Цель: сохранять и восстанавливать интервью‑сессию (actors → nodes/edges → вопросы/ответы → заметки), чтобы при F5 ничего не терялось.
Mermaid — временный превью. Цель экспорта — BPMN XML.

## Session shape (v0)

```json
{
  "session_id": "uuid-or-string",
  "title": "optional",
  "roles": [
    { "role_id": "cook_1", "label": "Повар 1" }
  ],
  "start_role": "cook_1",
  "nodes": [],
  "edges": [],
  "questions": [],
  "answers": [],
  "notes": [
    { "note_id": "note_...", "ts": "2026-02-11T12:00:00Z", "author": "user", "text": "..." }
  ]
}
```

Поля `nodes/edges/questions/answers` расширяем по мере реализации.

## Endpoints (минимум)

- `GET /api/sessions` — список сессий для TopBar
- `POST /api/sessions` — создать сессию
- `GET /api/sessions/{id}` — получить полную сессию
- `POST /api/sessions/{id}/notes` — добавить заметку
- `POST /api/sessions/{id}/answers` — записать ответ
- `GET /api/sessions/{id}/bpmn` — BPMN XML (для bpmn-js viewer)

## Notes

- Для фронта критично: сессия восстанавливается “как есть”.
- Желательно стабильные id: `note_id`, `question_id`.
- Если API недоступно — фронт держит draft в localStorage как fallback.
EOF

echo
echo "== styles: ensure .card exists =="
APP_CSS="frontend/src/styles/app.css"
if [ -f "$APP_CSS" ]; then
  if ! grep -qE '^\s*\.card\s*\{' "$APP_CSS"; then
    cat >> "$APP_CSS" <<'EOF'

.card {
  background: #fff;
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.06);
  padding: 12px;
}
EOF
  fi
fi

echo
echo "== NotesPanel: remove demo content, show real draft =="
cat > frontend/src/components/NotesPanel.jsx <<'EOF'
export default function NotesPanel({ draft }) {
  const roles = Array.isArray(draft?.roles) ? draft.roles : [];
  const notes = Array.isArray(draft?.notes) ? draft.notes : [];
  const startRole = typeof draft?.start_role === "string" ? draft.start_role : "";

  return (
    <div className="panel">
      <div className="panelHead">Сессия</div>

      <div className="panelBody">
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Actors</div>

          {roles.length === 0 ? (
            <div className="small muted">Пока нет ролей.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {roles.map((r) => (
                <div key={r.role_id} className="small">
                  <span style={{ fontWeight: 900 }}>{r.label}</span>{" "}
                  <span className="muted">({r.role_id})</span>
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

        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Заметки</div>
          <div className="small muted" style={{ marginBottom: 8 }}>
            Кол-во: <span style={{ fontWeight: 900 }}>{notes.length}</span>
          </div>

          {notes.length === 0 ? (
            <div className="small muted">Пока заметок нет. Добавляй через нижний dock.</div>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: 360, overflow: "auto" }}>
              {notes
                .slice()
                .reverse()
                .map((n) => (
                  <div key={n.note_id} className="small">
                    <div className="muted" style={{ fontSize: 11 }}>
                      {new Date(n.ts).toLocaleString()}
                    </div>
                    <div>{n.text}</div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <button className="primaryBtn" disabled>
          Сгенерировать процесс
        </button>
        <div className="small muted" style={{ marginTop: 10 }}>
          Кнопка активируется после подключения “normalize → nodes/edges → bpmn export”.
        </div>
      </div>
    </div>
  );
}
EOF

echo
echo "== CopilotOverlay: hide demo cards for now =="
cat > frontend/src/components/process/CopilotOverlay.jsx <<'EOF'
export default function CopilotOverlay() {
  return null;
}
EOF

echo
echo "== App.jsx: ensure interview phase uses NotesPanel(draft) =="
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
      <NotesPanel draft={draft} />
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
echo "== build smoke =="
if [ -d frontend/node_modules ]; then
  ( cd frontend && npm -s run build )
else
  if [ -f frontend/package-lock.json ]; then
    ( cd frontend && npm -s ci )
  else
    ( cd frontend && npm -s install )
  fi
  ( cd frontend && npm -s run build )
fi

echo
echo "== diff stat =="
git diff --stat || true

echo
echo "== commit (frontend + docs only) =="
git add -A frontend docs
git status -sb || true
git commit -m "chore(frontend): remove demo examples (notes/copilot) + add session API contract doc (R5)" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R5 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend docs \
  -x "frontend/node_modules/*" \
  -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
