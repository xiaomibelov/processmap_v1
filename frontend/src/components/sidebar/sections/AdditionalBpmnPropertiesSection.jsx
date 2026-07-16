import InlineBpmnPropertyRow from "../rows/InlineBpmnPropertyRow";
import SidebarInfoTip from "../SidebarInfoTip";

export default function AdditionalBpmnPropertiesSection({
  open,
  onToggleOpen,
  count,
  rows,
  hasDictionarySchema,
  dictionaryLoading,
  disabled,
  extensionStateBusy,
  updatePropertyRow,
  deletePropertyRow,
  addPropertyRow,
  refOptions = [],
  onSaveExtensionState,
  hideHeader = false,
}) {
  const showFallbackBlock = !hasDictionarySchema;

  function handleDelete(rowId) {
    // The controller returns the next extension state synchronously so we can
    // flush it immediately. Passing the explicit draft avoids reading a stale
    // batched state when saveSelectedCamundaProperties falls back to its
    // captured camundaPropertiesDraft.
    const nextState = deletePropertyRow(rowId);
    if (nextState && typeof onSaveExtensionState === "function") {
      void onSaveExtensionState(nextState, { silent: true });
    }
  }

  const tableBody = (
    <>
      {!hasDictionarySchema && !showFallbackBlock && dictionaryLoading ? (
        <div className="sidebarFieldHint">Ожидаю загрузку схемы операции.</div>
      ) : null}
      <div className="sidebarPropertiesRows sidebarPropertiesRows--table sidebarPropertiesRows--zebra">
        <div className="sidebarPropertiesTableHead" role="presentation">
          <span>Свойство</span>
          <span>Значение</span>
          <span>Действие</span>
        </div>
        {rows.map((row) => (
          <InlineBpmnPropertyRow
            key={String(row?.id || "")}
            row={row}
            disabled={disabled}
            extensionStateBusy={extensionStateBusy}
            updatePropertyRow={updatePropertyRow}
            deletePropertyRow={handleDelete}
            refOptions={refOptions}
          />
        ))}
      </div>
      <div className="sidebarButtonRow">
        <button
          type="button"
          className="sidebarAddBtn"
          onClick={addPropertyRow}
          disabled={!!disabled || !!extensionStateBusy}
        >
          + Добавить BPMN-свойство
        </button>
      </div>
    </>
  );

  if (hideHeader) {
    return (
      <section className="sidebarPropertiesBlock sidebarPropertiesBlock--secondary sidebarPropertiesBlock--wide">
        {tableBody}
      </section>
    );
  }

  return (
    <section className="sidebarPropertiesBlock sidebarPropertiesBlock--secondary sidebarPropertiesBlock--wide">
      <div className="sidebarPropertiesBlockHead">
        <button
          type="button"
          className="sidebarPropertiesBlockToggle"
          onClick={() => onToggleOpen((prev) => !prev)}
          aria-expanded={open ? "true" : "false"}
        >
          <span className="sidebarPropertiesBlockToggleChevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
          <span className="sidebarPropertiesBlockTitle">Дополнительные BPMN-свойства</span>
          <span className="sidebarPropertiesBlockMeta">{count}</span>
        </button>
        <SidebarInfoTip
          label="О дополнительных BPMN-свойствах"
          text="Extension properties текущего элемента в формате name/value."
        />
      </div>
      {open ? tableBody : null}
    </section>
  );
}
