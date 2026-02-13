import { useMemo, useState } from "react";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function str(v) {
  return String(v || "").trim();
}

function roleObj(r, idx) {
  if (!r) return null;
  if (typeof r === "string") {
    const label = str(r);
    if (!label) return null;
    return { role_id: `role_${idx + 1}`, label };
  }
  if (typeof r === "object") {
    const role_id = str(r.role_id || r.id || `role_${idx + 1}`);
    const label = str(r.label || r.title || role_id);
    if (!role_id && !label) return null;
    return { role_id: role_id || `role_${idx + 1}`, label: label || role_id };
  }
  const label = str(r);
  if (!label) return null;
  return { role_id: `role_${idx + 1}`, label };
}

function normalizeRoles(roles) {
  const arr = asArray(roles);
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const x = roleObj(arr[i], out.length);
    if (x) out.push(x);
  }
  return out;
}

function startRoleLabel(start_role, roles) {
  const sr = str(start_role);
  if (!sr) return "—";
  const rr = normalizeRoles(roles);
  const hit = rr.find((r) => r.role_id === sr) || rr.find((r) => r.label === sr);
  return hit ? `${hit.label} (${hit.role_id})` : sr;
}

export default function NotesPanel({ draft, onAddNote, onGenerate, disabled }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const roles = useMemo(() => normalizeRoles(draft?.roles), [draft]);
  const notes = useMemo(() => {
    const arr = asArray(draft?.notes);
    return [...arr].slice(-3).reverse();
  }, [draft]);

  async function send() {
    const t = str(text);
    if (!t) return;
    if (disabled || busy) return;

    setBusy(true);
    setErr("");
    try {
      const r = onAddNote?.(t);
      const rr = r && typeof r.then === "function" ? await r : r;

      if (rr && rr.ok === false) {
        setErr(String(rr.error || "API error"));
        return;
      }

      setText("");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (disabled || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = onGenerate?.();
      const rr = r && typeof r.then === "function" ? await r : r;
      if (rr && rr.ok === false) setErr(String(rr.error || "API error"));
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="leftPanel">
      <div className="paneTitle">Сессия</div>

      <div className="card">
        <div className="cardTitle">Акторы</div>
        <div className="muted">
          roles: {roles.length ? roles.map((r) => r.label).join(", ") : "—"}
        </div>
        <div className="muted">start_role: {startRoleLabel(draft?.start_role, roles)}</div>
      </div>

      <div className="card">
        <div className="cardTitle">Заметки</div>
        <div className="muted">Кол-во: {asArray(draft?.notes).length}</div>
        {asArray(draft?.notes).length === 0 ? <div className="muted">Пока заметок нет.</div> : null}
        {notes.length ? (
          <div className="muted" style={{ marginTop: 8 }}>
            {notes.map((n, i) => (
              <div key={n?.id || i} style={{ marginTop: i ? 6 : 0 }}>
                {String(n?.text || n?.notes || n || "").slice(0, 140)}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <button className="primaryBtn" onClick={generate} disabled={!!disabled || busy || !onGenerate}>
        {busy ? "Генерирую..." : "Сгенерировать процесс"}
      </button>

      <div className="muted" style={{ marginTop: 10 }}>
        Делает: recompute → bpmn export → обновляет BPMN stage.
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="cardTitle">Сообщения / заметки</div>

        <div className="muted" style={{ marginTop: 6 }}>
          Ctrl/⌘ + Enter — отправить
        </div>

        {err ? (
          <div className="badge err" style={{ marginTop: 10 }}>
            {err}
          </div>
        ) : null}

        <textarea
          className="input"
          placeholder="Пиши заметку по процессу: условия, исключения, оборудование, контроль качества..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          style={{ marginTop: 10, resize: "vertical" }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          disabled={!!disabled || busy}
        />

        <button className="primaryBtn" onClick={send} disabled={!!disabled || busy} style={{ marginTop: 10 }}>
          {busy ? "Отправляю..." : "Отправить"}
        </button>
      </div>
    </div>
  );
}
