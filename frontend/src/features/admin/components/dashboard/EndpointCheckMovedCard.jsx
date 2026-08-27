import SectionCard from "../common/SectionCard";
import { t } from "../../llm/i18n";

export default function EndpointCheckMovedCard({ onNavigate }) {
  return (
    <SectionCard title={t("endpointCheck.moved.title")} subtitle={t("endpointCheck.moved.subtitle")}>
      <button
        type="button"
        className="text-xs font-medium text-emerald-700 hover:underline"
        onClick={() => onNavigate?.("/admin/llm?tab=endpoint-check")}
        data-testid="endpoint-check-moved-link"
      >
        {t("endpointCheck.moved.link")}
      </button>
    </SectionCard>
  );
}
