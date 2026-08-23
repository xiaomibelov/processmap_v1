import React, { useMemo, useState } from "react";
import { VirtualTable } from "./VirtualTable.jsx";
import styles from "./VirtualBranchesTable.module.css";

function toText(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return toText(value).toLowerCase();
}

export const VirtualBranchesTable = React.memo(function VirtualBranchesTable({
  transitions = [],
  rowHeight = 48,
  tableHeight = 320,
  onStartEdit,
  onSaveEdit,
  emptyState,
  "data-testid": dataTestId,
}) {
  const [editingKey, setEditingKey] = useState("");
  const [draftWhen, setDraftWhen] = useState("");

  const rows = useMemo(() => {
    return (Array.isArray(transitions) ? transitions : []).map((tr) => ({
      key: tr.key || `${tr.from_node_id || ""}__${tr.to_node_id || ""}`,
      from: tr.from_title || tr.from_node_id || "—",
      to: tr.to_title || tr.to_node_id || "—",
      fromLane: tr.from_lane || "",
      toLane: tr.to_lane || "",
      when: tr.when || "",
      raw: tr,
    }));
  }, [transitions]);

  const renderHeader = () => (
    <div className={styles.headerRow} role="row">
      <div className={styles.headerCell} role="columnheader">From</div>
      <div className={styles.headerCell} role="columnheader">To</div>
      <div className={styles.headerCell} role="columnheader">Condition</div>
      <div className={styles.headerCell} role="columnheader">Actions</div>
    </div>
  );

  const renderRow = (row) => {
    const isEditing = editingKey === row.key;
    return (
      <div className={styles.row} role="row">
        <div className={styles.cell} role="cell" title={row.fromLane ? `${row.from} · ${row.fromLane}` : row.from}>
          <span className={styles.cellText}>{row.from}</span>
          {row.fromLane ? <span className={styles.lane}>{row.fromLane}</span> : null}
        </div>
        <div className={styles.cell} role="cell" title={row.toLane ? `${row.to} · ${row.toLane}` : row.to}>
          <span className={styles.cellText}>{row.to}</span>
          {row.toLane ? <span className={styles.lane}>{row.toLane}</span> : null}
        </div>
        <div className={styles.cell} role="cell">
          {isEditing ? (
            <input
              className={styles.input}
              value={draftWhen}
              onChange={(e) => setDraftWhen(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onSaveEdit?.(row.raw, draftWhen);
                  setEditingKey("");
                }
                if (e.key === "Escape") {
                  setEditingKey("");
                }
              }}
              autoFocus
            />
          ) : (
            <span className={styles.cellText}>{row.when || "—"}</span>
          )}
        </div>
        <div className={styles.cell} role="cell">
          {isEditing ? (
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => {
                onSaveEdit?.(row.raw, draftWhen);
                setEditingKey("");
              }}
            >
              Save
            </button>
          ) : (
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => {
                setEditingKey(row.key);
                setDraftWhen(row.when);
                onStartEdit?.(row.raw);
              }}
            >
              Edit
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <VirtualTable
      rows={rows}
      rowHeight={rowHeight}
      renderRow={renderRow}
      headerHeight={40}
      renderHeader={renderHeader}
      height={tableHeight}
      emptyState={emptyState}
      className={styles.table}
      data-testid={dataTestId || "virtual-branches-table"}
    />
  );
});
