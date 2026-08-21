import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../../../../shared/ui/Modal";

function toText(value) {
  return String(value || "").trim();
}

function StepSelect({
  label,
  value,
  onChange,
  search,
  onSearch,
  options,
  selectTestId,
  searchTestId,
  autoFocusRef,
}) {
  const q = toText(search).toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return options;
    return (Array.isArray(options) ? options : []).filter((item) =>
      toText(item?.label).toLowerCase().includes(q),
    );
  }, [options, q]);

  return (
    <label className="interviewField">
      <span>{label}</span>
      <input
        ref={autoFocusRef}
        className="input"
        value={search}
        onChange={(event) => onSearch?.(event.target.value)}
        placeholder="Поиск шага..."
        data-testid={searchTestId}
      />
      <select
        className="select"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        size={Math.min(7, Math.max(3, filtered.length || 3))}
        data-testid={selectTestId}
      >
        {filtered.map((option) => (
          <option key={`${selectTestId}_${option.stepId}`} value={option.stepId}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function AddBranchModal({
  open,
  onClose,
  stepOptions,
  fromStepId,
  toStepId,
  whenDraft,
  onFromStepIdChange,
  onToStepIdChange,
  onWhenDraftChange,
  onConfirm,
}) {
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  const fromSearchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setFromSearch("");
    setToSearch("");
    window.setTimeout(() => {
      fromSearchRef.current?.focus?.();
    }, 0);
  }, [open]);

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button type="button" className="secondaryBtn" onClick={onClose}>
        Отмена
      </button>
      <button
        type="button"
        className="primaryBtn"
        onClick={() => onConfirm?.()}
        data-testid="interview-add-transition-btn"
      >
        Добавить
      </button>
    </div>
  );

  return (
    <Modal open={open} title="Добавить переход" onClose={onClose} footer={footer}>
      <div className="grid gap-3 md:grid-cols-2" data-testid="interview-add-transition-modal">
        <StepSelect
          label="From step"
          value={fromStepId}
          onChange={onFromStepIdChange}
          search={fromSearch}
          onSearch={setFromSearch}
          options={stepOptions}
          selectTestId="interview-transition-from"
          searchTestId="interview-transition-from-search"
          autoFocusRef={fromSearchRef}
        />
        <StepSelect
          label="To step"
          value={toStepId}
          onChange={onToStepIdChange}
          search={toSearch}
          onSearch={setToSearch}
          options={stepOptions}
          selectTestId="interview-transition-to"
          searchTestId="interview-transition-to-search"
        />
      </div>
      <label className="interviewField mt-3">
        <span>Условие (опционально)</span>
        <input
          className="input"
          value={whenDraft}
          onChange={(event) => onWhenDraftChange?.(event.target.value)}
          placeholder="Напр.: Да / Нет, температура &lt; 90"
          data-testid="interview-transition-when"
        />
      </label>
    </Modal>
  );
}
