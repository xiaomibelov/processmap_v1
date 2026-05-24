import { useState } from "react";

function toText(value) {
  return String(value || "").trim();
}

function display(value, fallback = "—") {
  return toText(value) || fallback;
}

function formatRowDate(value) {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw) || raw <= 0) return toText(value) || "—";
  try {
    return new Date(raw * 1000).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return toText(value) || "—";
  }
}

function StatusBadge({ completeness }) {
  const isComplete = completeness === "complete";
  return (
    <span className={`productActionsRegistryCompleteness ${isComplete ? "complete" : "incomplete"}`}>
      {isComplete ? "Полная" : "Неполная"}
    </span>
  );
}

function ActionChips({ row }) {
  const chips = [
    toText(row.action_stage),
    toText(row.action_object),
    toText(row.action_object_category),
    toText(row.action_method),
  ].filter(Boolean);
  if (!chips.length) return null;
  return (
    <span className="productActionsRegistryRowChips">
      {chips.map((chip) => (
        <span key={chip}>{chip}</span>
      ))}
    </span>
  );
}

function Row({ row }) {
  const [open, setOpen] = useState(false);
  const bpmnCode = toText(row.bpmn_element_id);
  const sessionId = toText(row.session_id);
  const registryId = toText(row.registry_id || row.id);
  const dateValue = row.updated_at || row.created_at || "";
  return (
    <article
      className={`productActionsRegistryRow ${open ? "productActionsRegistryRow--open" : ""}`}
      role="row"
      data-expanded={open ? "true" : "false"}
    >
      <button
        type="button"
        className="productActionsRegistryRowMain"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <div className="productActionsRegistryRowCell productActionsRegistryRowCell--product">
          <span className={`productActionsRegistryRowChevron ${open ? "isOpen" : ""}`} aria-hidden="true">▸</span>
          <span className="productActionsRegistryRowProduct">
            <b>{display(row.product_name, "Товар не указан")}</b>
            <small>{display(row.product_group, "Группа не указана")}</small>
          </span>
        </div>
        <div className="productActionsRegistryRowCell productActionsRegistryRowCell--action">
          <b>{display(row.action_type, "—")}</b>
          <ActionChips row={row} />
        </div>
        <div className="productActionsRegistryRowCell productActionsRegistryRowCell--process">
          <b>{display(row.step_label || row.session_title, "Шаг не указан")}</b>
          {bpmnCode ? <small className="productActionsRegistryRowBpmn">BPMN: {bpmnCode}</small> : null}
        </div>
        <div className="productActionsRegistryRowCell productActionsRegistryRowCell--status">
          <StatusBadge completeness={row.completeness} />
          <small>{display(row.role, "роль не указана")}</small>
        </div>
      </button>
      <div className="productActionsRegistryRowExpansion" role="region" aria-hidden={!open}>
        <dl className="productActionsRegistryRowExpansionGrid">
          <div><dt>ID</dt><dd>{display(registryId)}</dd></div>
          <div><dt>BPMN</dt><dd>{display(bpmnCode)}</dd></div>
          <div><dt>Сессия</dt><dd>{display(row.session_title || sessionId)}</dd></div>
          <div><dt>Дата</dt><dd>{display(formatRowDate(dateValue))}</dd></div>
        </dl>
      </div>
    </article>
  );
}

export default function ProductActionsRegistryTable({
  rows = [],
  loading = false,
  emptyMessage = "Нет данных.",
}) {
  return (
    <div className="productActionsRegistryTable" role="table" data-testid="product-actions-registry-preview">
      <div className="productActionsRegistryTableHead" role="row">
        <span>Продукт</span>
        <span>Действие</span>
        <span>Процесс / шаг</span>
        <span className="productActionsRegistryTableHeadStatus">Статус</span>
      </div>
      {!rows.length ? (
        <div className="productActionsRegistryEmpty" data-testid="product-actions-registry-empty">
          {loading ? "Загружаю данные…" : emptyMessage}
        </div>
      ) : null}
      {rows.map((row) => (
        <Row key={row.registry_id || row.id} row={row} />
      ))}
    </div>
  );
}
