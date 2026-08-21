import { useEffect, useRef, useState } from "react";

import { isRefPropertyName } from "../../../features/process/camunda/refsModel";

function PencilIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

export default function InlineBpmnPropertyRow({
  row,
  disabled = false,
  extensionStateBusy = false,
  updatePropertyRow,
  deletePropertyRow,
  refOptions = [],
  isSelected = false,
  onToggleSelect,
  onShiftClick,
  rowIndex = -1,
}) {
  const rowId = String(row?.id || "").trim();
  const savedName = String(row?.name || "");
  const savedValue = String(row?.value || "");
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(savedName);
  const [draftValue, setDraftValue] = useState(savedValue);
  const rowRef = useRef(null);
  const nameInputRef = useRef(null);

  useEffect(() => {
    setDraftName(savedName);
    setDraftValue(savedValue);
  }, [savedName, savedValue]);

  useEffect(() => {
    if (isEditing && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditing]);

  function commit() {
    const nextName = draftName.trim();
    const nextValue = draftValue.trim();
    if (nextName !== savedName || nextValue !== savedValue) {
      updatePropertyRow(rowId, { name: nextName, value: nextValue });
    }
    setIsEditing(false);
  }

  function cancel() {
    setDraftName(savedName);
    setDraftValue(savedValue);
    setIsEditing(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  }

  function handleBlur(event) {
    // Stay in edit mode when focus moves between the two inputs inside this row.
    if (rowRef.current && rowRef.current.contains(event.relatedTarget)) {
      return;
    }
    commit();
  }

  const isBusy = !!disabled || !!extensionStateBusy;
  // Ref-named properties (*_ref) offer native autocomplete from the
  // process-wide ref pool + backend reference options. The datalist is
  // based on the draft name so renaming a row to a *_ref name picks it up
  // immediately; with no options the input stays a plain text input.
  const isRefRow = isRefPropertyName(draftName || savedName);
  const refListOptions = isRefRow && Array.isArray(refOptions) ? refOptions : [];
  const refDatalistId = `prop_ref_${rowId}`;

  const checkboxCell = (
    <div className="sidebarPropertyCheckboxCell">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => {
          e.stopPropagation();
          onToggleSelect?.(rowId);
        }}
        onClick={(e) => {
          if (e.shiftKey) {
            e.preventDefault();
            onShiftClick?.(rowId, rowIndex);
          }
        }}
        disabled={isBusy}
      />
    </div>
  );

  if (!isEditing) {
    return (
      <div
        className={`sidebarSchemaPropertyRow sidebarBpmnPropertyItem${isSelected ? " isSelected" : ""}`}
        onClick={() => setIsEditing(true)}
        role="button"
        tabIndex={isBusy ? -1 : 0}
        aria-label={`Редактировать свойство ${savedName || "новое"}`}
        onKeyDown={(event) => {
          if (!isBusy && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            setIsEditing(true);
          }
        }}
      >
        {checkboxCell}
        <div className="sidebarSchemaPropertyLabel">
          <div className="sidebarSchemaPropertyHuman">{savedName.trim() || <span className="text-muted">—</span>}</div>
        </div>
        <div className="sidebarSchemaPropertyValueCell">
          <div className="sidebarSchemaPropertyValueText">{savedValue.trim() || <span className="text-muted">—</span>}</div>
        </div>
        <div className="sidebarSchemaPropertyActionCell">
          <button
            type="button"
            className="sidebarPropertyActionBtn"
            onClick={(event) => {
              event.stopPropagation();
              setIsEditing(true);
            }}
            disabled={isBusy}
            aria-label="Редактировать свойство"
            title="Редактировать свойство"
          >
            <PencilIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={rowRef} className={`sidebarSchemaPropertyRow sidebarBpmnPropertyItem isEditing${isSelected ? " isSelected" : ""}`}>
      {checkboxCell}
      <div className="sidebarSchemaPropertyValueCell">
        <input
          ref={nameInputRef}
          className="input sidebarInput w-full min-w-0"
          placeholder="Название"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={isBusy}
        />
      </div>
      <div className="sidebarSchemaPropertyValueCell">
        <input
          className="input sidebarInput w-full min-w-0"
          placeholder="Значение"
          value={draftValue}
          list={refListOptions.length ? refDatalistId : undefined}
          onChange={(event) => setDraftValue(event.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={isBusy}
        />
        {refListOptions.length ? (
          <datalist id={refDatalistId}>
            {refListOptions.map((value) => (
              <option key={`prop_ref_option_${rowId}_${value}`} value={value} />
            ))}
          </datalist>
        ) : null}
      </div>
      <div className="sidebarSchemaPropertyActionCell">
        <button
          type="button"
          className="sidebarPropertyActionBtn"
          onClick={(event) => {
            event.stopPropagation();
            commit();
          }}
          disabled={isBusy}
          aria-label="Сохранить изменения"
          title="Сохранить изменения"
        >
          ✓
        </button>
      </div>
    </div>
  );
}
