import { useMemo, useState } from "react";

function safeArr(v) {
  return Array.isArray(v) ? v : [];
}

export default function NotesPanel({
  draft,
  sessionId,
  onNewLocal,
  onGenerate,
  onAddNote,
  generating,
  errorText,
  onEditActors,
}) {
  const [text, setText] = useState("");

  const roles = useMemo(() => safeArr(draft?.roles), [draft]);
  const startRole = String(draft?.start_role || "").trim();

  function add() {
    const t = String(text || "").trim();
    if (!t) return;
    onAddNote?.(t);
    setText("");
  }

  return (
    <div className="notesPanel">
      <div className="panelTitleRow">
        <div className="panelTitle">Заметки</div>
        <div className="panelSub">
          {sessionId ? <span className="muted">session: {sessionId}</span> : null}
        </div>
      </div>

      <div className="panelBlock">
        <div className="rowBetween">
          <div className="blockTitle">Акторы</div>
          <button className="secondaryBtn" onClick={() => onEditActors?.()} title="Редактировать акторов">
            Редактировать
          </button>
        </div>

        <div className="muted small">
          {roles.length ? (
            <>
              <div>Всего: {roles.length}</div>
              <div>Стартовая роль: {startRole || "—"}</div>
            </>
          ) : (
            <div>Акторы не заданы — добавь роли, чтобы собирать процесс по лайнам.</div>
          )}
        </div>

        {roles.length ? (
          <div className="chips">
            {roles.map((r, idx) => (
              <span className="chip" key={`${r}_${idx}`}>
                {r}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="panelBlock">
        <div className="blockTitle">Добавить заметку</div>
        <textarea
          className="textarea"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Пиши заметки по шагам. Потом будем превращать их в узлы процесса и AI-вопросы."
        />
        <div className="row">
          <button className="primaryBtn" onClick={add} title="Добавить">
            Добавить
          </button>
          <button
            className="secondaryBtn"
            onClick={onGenerate}
            disabled={generating}
            title="Сгенерировать/обновить процесс из текущих данных"
          >
            {generating ? "Генерация…" : "Обновить процесс"}
          </button>
          <button className="secondaryBtn" onClick={onNewLocal} title="Перейти в локальный черновик">
            Local draft
          </button>
        </div>

        {errorText ? <div className="errBox">{errorText}</div> : null}
      </div>
    </div>
  );
}
