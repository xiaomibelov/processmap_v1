import { useEffect, useState } from "react";

function toText(value) {
  return String(value || "").trim();
}

export default function BranchRow({
  tr,
  laneOptions,
  isEditing,
  isInsertOpen,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onOpenInsertBetween,
  onCancelInsertBetween,
  onConfirmInsertBetween,
  insertState,
}) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!isEditing) return;
    setDraft(toText(tr?.when));
  }, [isEditing, tr?.when]);

  const hasWhen = !!toText(tr?.when);
  const dirty = isEditing && toText(draft) !== toText(tr?.when);

  return (
    <>
      <tr className="interviewBranchRow" data-testid="interview-transition-row">
        <td>
          <div className="font-semibold text-fg">
            {toText(tr?.from_graph_no) ? `[${tr.from_graph_no}] ` : ""}{tr.from_title}
          </div>
          <div className="muted small">{tr.from_lane ? `${tr.from_lane} · ` : ""}internal: {tr.from_node_id}</div>
        </td>
        <td>
          <div className="font-semibold text-fg">
            {toText(tr?.to_graph_no) ? `[${tr.to_graph_no}] ` : ""}{tr.to_title}
          </div>
          <div className="muted small">{tr.to_lane ? `${tr.to_lane} · ` : ""}internal: {tr.to_node_id}</div>
        </td>
        <td>
          {isEditing ? (
            <div className="interviewBranchEditWrap">
              <input
                className="input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Условие перехода"
                data-testid="interview-transition-inline-input"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onSaveEdit?.(tr, draft);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    onCancelEdit?.();
                  }
                }}
              />
              <div className="interviewBranchEditActions">
                {dirty ? <span className="badge warn">unsaved</span> : null}
                <button type="button" className="secondaryBtn smallBtn" onClick={() => onSaveEdit?.(tr, draft)}>
                  Save
                </button>
                <button type="button" className="secondaryBtn smallBtn" onClick={onCancelEdit}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="interviewBranchWhenCell">
              <span className={`badge ${hasWhen ? "ok" : ""}`}>{hasWhen ? "conditional" : "default"}</span>
              <span className={`interviewBranchWhenText ${hasWhen ? "hasWhen" : ""}`}>
                {hasWhen ? tr.when : "—"}
              </span>
            </div>
          )}
        </td>
        <td>
          <div className="interviewBranchActions">
            <button
              type="button"
              className="secondaryBtn smallBtn interviewBranchActionBtn"
              title="Редактировать условие"
              onClick={() => (isEditing ? onCancelEdit?.() : onStartEdit?.(tr))}
              data-testid="interview-transition-edit-btn"
            >
              ✎
            </button>
            <button
              type="button"
              className="secondaryBtn smallBtn interviewBranchActionBtn"
              title="Вставить шаг между"
              onClick={() => onOpenInsertBetween?.(tr)}
              data-testid="interview-insert-between-btn"
            >
              ⇄
            </button>
          </div>
        </td>
      </tr>

      {isInsertOpen ? (
        <tr data-testid="interview-insert-between-row">
          <td colSpan={4}>
            <div className="inputRow interviewBranchInsertRow">
              <label className="interviewField">
                <span>Новый шаг (между выбранными)</span>
                <input
                  className="input"
                  data-testid="interview-insert-between-title"
                  value={insertState.title}
                  onChange={(event) => insertState.setTitle(event.target.value)}
                  placeholder="Напр.: Проверить температуру упаковки"
                />
              </label>
              <label className="interviewField">
                <span>Лайн/роль</span>
                <select
                  className="select"
                  data-testid="interview-insert-between-lane"
                  value={insertState.lane}
                  onChange={(event) => insertState.setLane(event.target.value)}
                >
                  <option value="">Без роли</option>
                  {laneOptions.map((lane) => (
                    <option key={`lane_${lane}`} value={lane}>
                      {lane}
                    </option>
                  ))}
                </select>
              </label>
              <div className="interviewBranchInsertActions">
                <button
                  type="button"
                  className="secondaryBtn smallBtn"
                  data-testid="interview-insert-between-confirm"
                  onClick={() => onConfirmInsertBetween?.(tr)}
                >
                  Сохранить
                </button>
                <button type="button" className="secondaryBtn smallBtn" onClick={onCancelInsertBetween}>
                  Отмена
                </button>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
