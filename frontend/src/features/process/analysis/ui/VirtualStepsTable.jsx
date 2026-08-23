import React, { useMemo, useState, useCallback } from "react";
import { VirtualTable } from "./VirtualTable.jsx";
import styles from "./VirtualStepsTable.module.css";

function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatSeq(step, index) {
  return Number(step?._order_index || step?.order_index || step?.seq || index + 1);
}

export const VirtualStepsTable = React.memo(function VirtualStepsTable({
  steps = [],
  selectedStepIds = [],
  activeStepId = "",
  onToggleStepSelection,
  onToggleAllStepSelection,
  onActivateStep,
  patchStep,
  productActionCountByStepId = {},
  rowHeight = 64,
  tableHeight = 420,
  emptyState,
  "data-testid": dataTestId,
}) {
  const selectedSet = useMemo(
    () => new Set(toArray(selectedStepIds).map((id) => toText(id)).filter(Boolean)),
    [selectedStepIds]
  );

  const [editingStepId, setEditingStepId] = useState("");
  const [draftByStepId, setDraftByStepId] = useState({});

  const rows = useMemo(() => toArray(steps), [steps]);
  const allSelected = rows.length > 0 && rows.every((row) => selectedSet.has(toText(row?.id)));
  const someSelected = rows.some((row) => selectedSet.has(toText(row?.id)));

  const startEdit = useCallback((stepId, currentTitle) => {
    setEditingStepId(stepId);
    setDraftByStepId((prev) => ({ ...prev, [stepId]: currentTitle }));
  }, []);

  const commitEdit = useCallback(
    (stepId) => {
      const next = draftByStepId[stepId];
      if (next !== undefined) {
        patchStep?.(stepId, "action", next);
      }
      setEditingStepId("");
    },
    [draftByStepId, patchStep]
  );

  const cancelEdit = useCallback(() => {
    setEditingStepId("");
  }, []);

  const handleToggleAll = useCallback(
    (e) => {
      onToggleAllStepSelection?.(!!e.target.checked);
    },
    [onToggleAllStepSelection]
  );

  const renderHeader = useCallback(() => {
    return (
      <div className={styles.headerRow} role="row">
        <div className={styles.headerCell} role="columnheader">
          <label className={styles.selectHead}>
            <input
              type="checkbox"
              checked={allSelected}
              ref={(node) => {
                if (node) node.indeterminate = !allSelected && someSelected;
              }}
              onChange={handleToggleAll}
              data-testid="analysis-step-select-all"
              aria-label="Выбрать все видимые шаги"
            />
            <span>№</span>
          </label>
        </div>
        <div className={styles.headerCell} role="columnheader">Лайн</div>
        <div className={styles.headerCell} role="columnheader">Шаг</div>
        <div className={styles.headerCell} role="columnheader">BPMN</div>
        <div className={styles.headerCell} role="columnheader">Статусы</div>
        <div className={styles.headerCell} role="columnheader">Действия</div>
      </div>
    );
  }, [allSelected, someSelected, handleToggleAll]);

  const renderRow = useCallback(
    (row, index) => {
      const stepId = toText(row?.id);
      const selected = selectedSet.has(stepId);
      const active = activeStepId === stepId;
      const isEditing = editingStepId === stepId;
      const seq = formatSeq(row, index);
      const title = toText(row?.action) || "Без названия";
      const lane = toText(row?.lane_name || row?.lane || row?.role || row?.area);
      const bound = !!row?.node_bound;
      const nodeId = toText(row?.node_bind_id);
      const productActionCount = Number(productActionCountByStepId[stepId] || 0);
      const tier = toText(row?.tier);

      return (
        <div
          className={[
            styles.row,
            selected ? styles.rowSelected : "",
            active ? styles.rowActive : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="row"
          data-testid="analysis-step-list-row"
          data-step-id={stepId}
        >
          <div className={styles.cell} role="cell">
            <label className={styles.selectCell}>
              <input
                type="checkbox"
                checked={selected}
                onChange={(e) => {
                  onActivateStep?.(stepId);
                  onToggleStepSelection?.(stepId, !!e.target.checked);
                }}
                data-testid="interview-step-select"
                aria-label={`Выбрать шаг ${seq}`}
              />
              <span>#{seq}</span>
            </label>
          </div>

          <div className={styles.cell} role="cell" title={lane || undefined}>
            {lane ? <span className={styles.laneBadge}>{lane}</span> : <span className={styles.muted}>—</span>}
          </div>

          <div className={styles.cell} role="cell">
            {isEditing ? (
              <input
                className={styles.inlineInput}
                value={draftByStepId[stepId] ?? title}
                onChange={(e) => setDraftByStepId((prev) => ({ ...prev, [stepId]: e.target.value }))}
                onBlur={() => commitEdit(stepId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitEdit(stepId);
                  }
                  if (e.key === "Escape") {
                    cancelEdit();
                  }
                }}
                autoFocus
                data-testid="analysis-step-edit-input"
              />
            ) : (
              <button
                type="button"
                className={styles.titleBtn}
                onClick={() => onActivateStep?.(stepId)}
                onDoubleClick={() => startEdit(stepId, title)}
                data-testid="analysis-step-title"
              >
                {title}
              </button>
            )}
          </div>

          <div className={styles.cell} role="cell">
            {bound ? (
              <span className={styles.nodeId}>{nodeId || "—"}</span>
            ) : (
              <span className={styles.missingBind}>Не привязан</span>
            )}
          </div>

          <div className={`${styles.cell} ${styles.statusCell}`} role="cell">
            {tier && tier !== "None" ? (
              <span className={`${styles.tierBadge} ${styles[`tier${tier}`] || ""}`} data-testid="analysis-step-tier">
                {tier}
              </span>
            ) : null}
            {productActionCount > 0 ? (
              <span className={styles.paBadge} data-testid="analysis-step-product-actions">
                ПА {productActionCount}
              </span>
            ) : null}
            {bound ? (
              <span className={styles.okBadge} data-testid="analysis-step-bpmn-status">BPMN</span>
            ) : (
              <span className={styles.warnBadge} data-testid="analysis-step-bpmn-status">!BPMN</span>
            )}
          </div>

          <div className={styles.cell} role="cell">
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => onActivateStep?.(stepId)}
              data-testid="analysis-step-details"
            >
              Детали
            </button>
            {!isEditing ? (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => startEdit(stepId, title)}
                data-testid="analysis-step-edit"
              >
                Edit
              </button>
            ) : null}
          </div>
        </div>
      );
    },
    [
      selectedSet,
      activeStepId,
      editingStepId,
      draftByStepId,
      productActionCountByStepId,
      onActivateStep,
      onToggleStepSelection,
      startEdit,
      commitEdit,
      cancelEdit,
    ]
  );

  return (
    <VirtualTable
      rows={rows}
      rowHeight={rowHeight}
      height={tableHeight}
      renderHeader={renderHeader}
      renderRow={renderRow}
      emptyState={emptyState}
      className={styles.table}
      data-testid={dataTestId || "virtual-steps-table"}
    />
  );
});
