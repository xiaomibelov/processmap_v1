import { useEffect, useState } from "react";

import AdminTabs from "../components/common/AdminTabs";
import { toText } from "../adminUtils";
import LlmProvidersPanel from "../llm/LlmProvidersPanel";
import LlmPromptsPanel from "../llm/LlmPromptsPanel";
import LlmFeaturesPanel from "../llm/LlmFeaturesPanel";
import LlmUsagePanel from "../llm/LlmUsagePanel";
import { t } from "../llm/i18n";

const ALL_LLM_TABS = [
  { id: "providers", label: t("tab.providers") },
  { id: "prompts", label: t("tab.prompts") },
  { id: "features", label: t("tab.features") },
  { id: "usage", label: t("tab.usage") },
];

const DEFAULT_TAB = "providers";

export default function AdminLlmPage() {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_TAB;
    const params = new URLSearchParams(window.location.search);
    const tab = toText(params.get("tab"));
    return ALL_LLM_TABS.some((row) => row.id === tab) ? tab : DEFAULT_TAB;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === activeTab) return;
    if (activeTab === DEFAULT_TAB) {
      params.delete("tab");
    } else {
      params.set("tab", activeTab);
    }
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", newUrl);
  }, [activeTab]);

  useEffect(() => {
    if (!ALL_LLM_TABS.some((row) => row.id === activeTab)) {
      setActiveTab(DEFAULT_TAB);
    }
  }, [activeTab]);

  function renderTabContent() {
    if (activeTab === "prompts") return <LlmPromptsPanel />;
    if (activeTab === "features") return <LlmFeaturesPanel />;
    if (activeTab === "usage") return <LlmUsagePanel />;
    return <LlmProvidersPanel />;
  }

  return (
    <div className="space-y-5" data-testid="admin-llm-page">
      <AdminTabs tabs={ALL_LLM_TABS} activeTab={activeTab} onChange={setActiveTab} testIdPrefix="llm-tab-" />
      {renderTabContent()}
    </div>
  );
}
