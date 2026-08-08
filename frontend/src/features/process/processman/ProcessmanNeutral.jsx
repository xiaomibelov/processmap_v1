import { ru } from "../../../shared/i18n/ru";

// LLM4 — нейтральное состояние панели PROCESSMAN (AS IS / Отчёты / прочие
// вкладки воркбенча: xml/doc/dod/analytics). Без действий, без запросов.
const t = ru.processman;

export default function ProcessmanNeutral() {
  return (
    <div className="pm-processman__state" data-testid="processman-neutral">
      <div className="pm-processman__state-title">{t.neutralTitle}</div>
      <div className="pm-processman__state-text">{t.neutralText}</div>
    </div>
  );
}
