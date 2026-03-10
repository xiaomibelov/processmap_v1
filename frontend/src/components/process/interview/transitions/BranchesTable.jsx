import { useMemo, useState } from "react";
import BranchRow from "./BranchRow";

function toText(value) {
  return String(value || "").trim();
}

const PAGE_SIZE = 20;

export default function BranchesTable({
  transitions,
  laneOptions,
  groupByFrom,
  editingKey,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  insertTargetKey,
  insertState,
  onOpenInsertBetween,
  onCancelInsertBetween,
  onConfirmInsertBetween,
}) {
  const [page, setPage] = useState(1);
  const total = Array.isArray(transitions) ? transitions.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE;
  const pagedTransitions = useMemo(
    () => (Array.isArray(transitions) ? transitions.slice(from, to) : []),
    [transitions, from, to],
  );

  const grouped = useMemo(() => {
    if (!groupByFrom) return [];
    const groups = new Map();
    pagedTransitions.forEach((tr) => {
      const key = toText(tr?.from_node_id);
      if (!key) return;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          title: tr?.from_title || key,
          lane: tr?.from_lane || "",
          rows: [],
        });
      }
      groups.get(key).rows.push(tr);
    });
    return Array.from(groups.values());
  }, [groupByFrom, pagedTransitions]);

  return (
    <>
      <div className="interviewTableWrap">
        {!groupByFrom ? (
          <table className="interviewTable interviewBranchesTable">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Condition</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!pagedTransitions.length ? (
                <tr>
                  <td colSpan={4} className="muted interviewEmpty">Нет переходов по текущему фильтру.</td>
                </tr>
              ) : (
                pagedTransitions.map((tr) => (
                  <BranchRow
                    key={tr.id || tr.key}
                    tr={tr}
                    laneOptions={laneOptions}
                    isEditing={editingKey === tr.key}
                    isInsertOpen={insertTargetKey === tr.key}
                    onStartEdit={onStartEdit}
                    onCancelEdit={onCancelEdit}
                    onSaveEdit={onSaveEdit}
                    onOpenInsertBetween={onOpenInsertBetween}
                    onCancelInsertBetween={onCancelInsertBetween}
                    onConfirmInsertBetween={onConfirmInsertBetween}
                    insertState={insertState}
                  />
                ))
              )}
            </tbody>
          </table>
        ) : (
          <div className="interviewBranchesGrouped">
            {!grouped.length ? (
              <div className="muted interviewEmpty">Нет переходов по текущему фильтру.</div>
            ) : grouped.map((group) => (
              <details className="interviewBranchesGroup" key={group.key} open>
                <summary>
                  From: <b>{group.title}</b>{group.lane ? ` (${group.lane})` : ""} — {group.rows.length}
                </summary>
                <table className="interviewTable interviewBranchesTable">
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th>Condition</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((tr) => (
                      <BranchRow
                        key={tr.id || tr.key}
                        tr={tr}
                        laneOptions={laneOptions}
                        isEditing={editingKey === tr.key}
                        isInsertOpen={insertTargetKey === tr.key}
                        onStartEdit={onStartEdit}
                        onCancelEdit={onCancelEdit}
                        onSaveEdit={onSaveEdit}
                        onOpenInsertBetween={onOpenInsertBetween}
                        onCancelInsertBetween={onCancelInsertBetween}
                        onConfirmInsertBetween={onConfirmInsertBetween}
                        insertState={insertState}
                      />
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </div>
        )}
      </div>
      <div className="interviewBranchesPager">
        <button
          type="button"
          className="secondaryBtn smallBtn"
          disabled={currentPage <= 1}
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
        >
          ← Prev
        </button>
        <span className="muted small">
          Стр. {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          className="secondaryBtn smallBtn"
          disabled={currentPage >= totalPages}
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
        >
          Next →
        </button>
      </div>
    </>
  );
}
