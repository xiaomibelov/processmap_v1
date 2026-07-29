import React from "react";

// E6.5 — панель результатов «Проверить»: (а) dry-run findings (клик → подсветка
// элемента в GraphCanvas, UX как в E3 ImportBpmn), (б) pre-check по кухням
// (мультивыбор + таблица покрытия с бейджами ok/warning/blocked).

const SEVERITY_META = {
  error: { icon: "⛔", label: "Ошибка", className: "ctor-check__finding--error" },
  warning: { icon: "⚠️", label: "Предупреждение", className: "ctor-check__finding--warning" },
};

const VERDICT_META = {
  ok: { label: "OK", className: "ctor-check__badge--ok" },
  warning: { label: "Предупреждение", className: "ctor-check__badge--warning" },
  blocked: { label: "Заблокировано", className: "ctor-check__badge--blocked" },
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function CheckPanel({
  validation, // {summary, findings} | null
  kitchens, // [{id, name}]
  selectedKitchenIds, // string[]
  onToggleKitchen,
  mode, // "warning" | "strict"
  onModeChange,
  precheck, // {summary, kitchens: [{kitchen_id, name, verdict, unmet}]} | null
  busy,
  onRunPrecheck,
  onSelectFinding,
  onClose,
}) {
  const findings = asArray(validation?.findings);
  const summary = validation?.summary || {};
  const precheckKitchens = asArray(precheck?.kitchens);
  const selected = new Set(asArray(selectedKitchenIds).map(String));

  return (
    <div className="ctor-check" data-testid="check-panel">
      <div className="ctor-check__head">
        <h2 className="ctor-check__title">Результаты проверки</h2>
        {busy ? <span className="ctor-hint" data-testid="check-busy">Проверяем…</span> : null}
        <button type="button" className="ctor-btn ctor-btn--small" data-testid="check-close" onClick={onClose}>
          Скрыть
        </button>
      </div>

      <section className="ctor-check__section" data-testid="check-findings">
        <h3>Сухой прогон (dry-run)</h3>
        <div className="ctor-check__summary" data-testid="check-summary">
          <span>узлов {Number(summary.nodes) || 0}</span>
          <span>потоков {Number(summary.flows) || 0}</span>
          <span className="ctor-check__summary-errors">ошибок {Number(summary.errors) || 0}</span>
          <span className="ctor-check__summary-warnings">предупреждений {Number(summary.warnings) || 0}</span>
        </div>
        {findings.length === 0 ? (
          <div className="ctor-hint" data-testid="check-findings-empty">Замечаний нет</div>
        ) : (
          <ul className="ctor-check__findings-list">
            {findings.map((finding, idx) => {
              const meta = SEVERITY_META[String(finding?.severity || "")] || {
                icon: "ℹ️",
                label: "Инфо",
                className: "ctor-check__finding--info",
              };
              const elementId = String(finding?.element_id || "");
              return (
                <li key={`${String(finding?.code || "finding")}_${idx}`}>
                  <button
                    type="button"
                    className={`ctor-check__finding ${meta.className}`}
                    data-testid={`check-finding-${idx}`}
                    data-element-id={elementId}
                    onClick={() => onSelectFinding(elementId)}
                  >
                    <span className="ctor-check__finding-head">
                      <span className="ctor-check__finding-icon" title={meta.label}>{meta.icon}</span>
                      <span className="ctor-check__finding-code">{String(finding?.code || "")}</span>
                      {finding?.element_name ? (
                        <span className="ctor-check__finding-element">{String(finding.element_name)}</span>
                      ) : null}
                    </span>
                    <span className="ctor-check__finding-message">{String(finding?.message || "")}</span>
                    {finding?.recommendation ? (
                      <span className="ctor-check__finding-recommendation">
                        Рекомендация: {String(finding.recommendation)}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="ctor-check__section" data-testid="check-precheck">
        <h3>Pre-check по кухням</h3>
        <div className="ctor-check__precheck-controls">
          <span className="ctor-field-label">Кухни:</span>
          {asArray(kitchens).map((kitchen) => {
            const id = String(kitchen?.id || "");
            return (
              <label className="ctor-check__kitchen" key={id} data-testid={`precheck-kitchen-${id}`}>
                <input
                  type="checkbox"
                  checked={selected.has(id)}
                  onChange={() => onToggleKitchen(id)}
                />
                <span>{String(kitchen?.name || id)}</span>
              </label>
            );
          })}
          <label className="ctor-check__mode">
            <span className="ctor-field-label">Режим:</span>
            <select data-testid="precheck-mode" value={mode} onChange={(e) => onModeChange(e.target.value)}>
              <option value="warning">warning (по умолчанию)</option>
              <option value="strict">strict</option>
            </select>
          </label>
          <button
            type="button"
            className="ctor-btn ctor-btn--small"
            data-testid="precheck-run"
            disabled={busy || selected.size === 0}
            onClick={onRunPrecheck}
          >
            Обновить pre-check
          </button>
        </div>

        {precheck ? (
          <table className="ctor-check__table" data-testid="precheck-table">
            <thead>
              <tr>
                <th>Кухня</th>
                <th>Вердикт</th>
                <th>Непокрытые требования</th>
              </tr>
            </thead>
            <tbody>
              {precheckKitchens.map((row) => {
                const id = String(row?.kitchen_id || "");
                const verdict = String(row?.verdict || "ok");
                const meta = VERDICT_META[verdict] || VERDICT_META.ok;
                const unmet = asArray(row?.unmet);
                return (
                  <tr key={id} data-testid={`precheck-row-${id}`}>
                    <td>{String(row?.name || id)}</td>
                    <td>
                      <span
                        className={`ctor-check__badge ${meta.className}`}
                        data-testid={`precheck-verdict-${id}`}
                        data-verdict={verdict}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      {unmet.length === 0 ? (
                        <span className="ctor-hint">все требования покрыты</span>
                      ) : (
                        <ul className="ctor-check__unmet">
                          {unmet.map((item, idx) => (
                            <li key={`${id}_unmet_${idx}`}>
                              <code>{String(item?.operation_code || "")}</code>: {String(item?.detail_ru || "")}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="ctor-hint" data-testid="precheck-empty">Pre-check ещё не запускался</div>
        )}
      </section>
    </div>
  );
}
