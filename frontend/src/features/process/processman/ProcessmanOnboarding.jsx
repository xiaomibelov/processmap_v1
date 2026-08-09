import { ru } from "../../../shared/i18n/ru";

// PROCESSMAN-REDESIGN (PR-1) — онбординг-карточка трёх действий.
// Показывается один раз (флаг в localStorage, см. chat/processmanOnboarding.js),
// затем доступна по иконке «?» в шапке. Заменяет постоянно висящий
// SchemaAssistantBlock «Помощник на схеме (LLM)».
const t = ru.processman;

export default function ProcessmanOnboarding({ onHide }) {
  return (
    <div className="pm-processman-onboarding" data-testid="processman-onboarding" role="note">
      <div className="pm-processman-onboarding__title">{t.onboardingTitle}</div>
      <ul className="pm-processman-onboarding__list">
        <li>{t.onboardingLine1}</li>
        <li>{t.onboardingLine2}</li>
        <li>{t.onboardingLine3}</li>
      </ul>
      <button
        type="button"
        className="pm-processman-onboarding__hide"
        data-testid="processman-onboarding-hide"
        onClick={() => onHide?.()}
      >
        {t.onboardingHide}
      </button>
    </div>
  );
}
