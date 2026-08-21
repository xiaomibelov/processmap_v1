import { useMemo } from "react";

export default function NotesCard({ notes }) {
  const list = Array.isArray(notes) ? notes : [];

  const lastNotes = useMemo(() => {
    const arr = list.slice().reverse();
    return arr.slice(0, 6);
  }, [list]);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>Заметки</div>

      <div className="small muted" style={{ marginBottom: 8 }}>
        Кол-во: <span style={{ fontWeight: 900 }}>{list.length}</span>
      </div>

      {list.length === 0 ? (
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
  );
}
