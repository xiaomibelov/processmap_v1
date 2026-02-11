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
