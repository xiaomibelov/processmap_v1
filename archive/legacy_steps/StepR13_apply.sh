#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="fix/frontend-r13-move-notes-left-v1"
TAG_START="cp/foodproc_frontend_r13_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r13_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r13_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R13 start (${TS})" >/dev/null 2>&1 || true
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
git restore --staged StepR*.sh 2>/dev/null || true
git restore --staged Run_StepR*.sh 2>/dev/null || true
git restore --staged artifacts 2>/dev/null || true
git restore --staged artifacts/* 2>/dev/null || true
git restore --staged backend 2>/dev/null || true

echo
echo "== NotesPanel: move composer under 'Сгенерировать процесс' (left column) =="
mkdir -p frontend/src/components

cat > frontend/src/components/NotesPanel.jsx <<'EOF'
import { useMemo, useState } from "react";

export default function NotesPanel({ draft, onAddNote, disabled }) {
  const roles = Array.isArray(draft?.roles) ? draft.roles : [];
  const notes = Array.isArray(draft?.notes) ? draft.notes : [];
  const startRole = typeof draft?.start_role === "string" ? draft.start_role : "";

  const [text, setText] = useState("");

  const lastNotes = useMemo(() => {
    const arr = notes.slice().reverse();
    return arr.slice(0, 5);
  }, [notes]);

  function submit() {
    const t = String(text || "").trim();
    if (!t) return;
    if (typeof onAddNote === "function") onAddNote(t);
    setText("");
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="panel">
      <div className="panelHead">Сессия</div>

      <div className="panelBody">
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Акторы</div>

          {roles.length === 0 ? (
            <div className="small muted">Пока нет ролей.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {roles.map((r) => (
                <div key={r.role_id || r} className="small">
                  <span style={{ fontWeight: 900 }}>{r.label || r}</span>{" "}
                  <span className="muted">({r.role_id || r})</span>
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
            <div className="small muted">Пока заметок нет.</div>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: 210, overflow: "auto" }}>
              {lastNotes.map((n) => (
                <div key={n.note_id || n.ts} className="small">
                  <div className="muted" style={{ fontSize: 11 }}>
                    {n.ts ? new Date(n.ts).toLocaleString() : ""}
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

        <div className="card notesDock" style={{ marginTop: 12 }}>
          <div className="notesDockHead">
            <div style={{ fontWeight: 900 }}>Сообщения / заметки</div>
            <div className="small muted">Ctrl/⌘ + Enter — отправить</div>
          </div>

          <textarea
            className="input"
            rows={5}
            placeholder={
              disabled
                ? "Сначала заполни роли и start_role."
                : "Пиши заметку по процессу: условия, исключения, оборудование, контроль качества…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!!disabled}
            style={{ resize: "vertical", minHeight: 92 }}
          />

          <div className="notesDockActions">
            <button className="primaryBtn" onClick={submit} disabled={!!disabled || !String(text || "").trim()}>
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
EOF

echo
echo "== App.jsx: pass onAddNote/disabled into NotesPanel (interview only) =="
cat > .tools_patch_r13_app.py <<'PY'
import pathlib, re

p = pathlib.Path("frontend/src/App.jsx")
s = p.read_text(encoding="utf-8")

# Replace NotesPanel usage in interview phase
s2 = re.sub(
    r"<NotesPanel\s+draft=\{draft\}\s*/>",
    r"<NotesPanel draft={draft} onAddNote={addNote} disabled={false} />",
    s,
    count=1,
)

# If not found, try alternate formatting
if s2 == s:
    s2 = re.sub(
        r"<NotesPanel\s+draft=\{draft\}\s*/>",
        r"<NotesPanel draft={draft} onAddNote={addNote} disabled={false} />",
        s,
        count=1,
        flags=re.M,
    )

# Ensure import exists
if "from "./components/NotesPanel"" not in s2 and "from './components/NotesPanel'" not in s2:
    # best-effort: leave as is
    pass

p.write_text(s2, encoding="utf-8")
PY
python .tools_patch_r13_app.py
rm -f .tools_patch_r13_app.py

echo
echo "== AppShell: remove BottomDock rendering (composer is now inside left panel) =="
cat > .tools_patch_r13_shell.py <<'PY'
import pathlib, re

p = pathlib.Path("frontend/src/components/AppShell.jsx")
s = p.read_text(encoding="utf-8")

# drop BottomDock import
s = re.sub(r"^import\s+.*BottomDock.*\n", "", s, flags=re.M)

# drop self-closing BottomDock blocks
s = re.sub(r"\n\s*<BottomDock[\s\S]*?\/>\s*\n", "\n", s)

# drop paired BottomDock blocks if any
s = re.sub(r"\n\s*<BottomDock[\s\S]*?</BottomDock>\s*\n", "\n", s)

p.write_text(s, encoding="utf-8")
PY
python .tools_patch_r13_shell.py
rm -f .tools_patch_r13_shell.py

echo
echo "== styles: make .card dark glass (reduce white glare) + notes dock helpers =="
APP_CSS="frontend/src/styles/app.css"
if [ -f "$APP_CSS" ]; then
cat >> "$APP_CSS" <<'EOF'

/* R13: reduce glare — cards follow graphite glass */
.card{
  background: var(--panel2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: 0 10px 30px rgba(0,0,0,.35);
  padding: 12px;
}

.notesDockHead{
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:10px;
  margin-bottom:10px;
}

.notesDockActions{
  display:flex;
  justify-content:flex-end;
  margin-top:10px;
}
EOF
fi

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== commit (frontend only) =="
git add -A frontend
git status -sb || true
git commit -m "feat(frontend): move notes/messages composer into left panel under generate button (R13)" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R13 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend -x "frontend/node_modules/*" -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout "$TAG_START""
