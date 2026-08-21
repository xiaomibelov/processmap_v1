import { useEffect, useState } from "react";

import AdminTabs from "../components/common/AdminTabs";
import { toText } from "../adminUtils";
import LlmProvidersPanel from "../llm/LlmProvidersPanel";
import LlmModelsPanel from "../llm/LlmModelsPanel";
import LlmModulesPanel from "../llm/LlmModulesPanel";
import LlmPromptsPanel from "../llm/LlmPromptsPanel";
import LlmFeaturesPanel from "../llm/LlmFeaturesPanel";
import LlmUsagePanel from "../llm/LlmUsagePanel";
import TestgenPanel from "../llm/TestgenPanel";
import { t } from "../llm/i18n";

const ALL_LLM_TABS = [
  { id: "providers", label: t("tab.providers") },
  { id: "models", label: t("tab.models") },
  { id: "modules", label: t("tab.modules") },
  { id: "prompts", label: t("tab.prompts") },
  { id: "features", label: t("tab.features") },
  { id: "usage", label: t("tab.usage") },
];

const DEFAULT_TAB = "providers";

const TESTGEN_TAB = { id: "testgen", label: t("tab.testgen") };

export default function AdminLlmPage({ showTestgen = false }) {
  // Видимость таба TestGen — по праву «API Docs» (вычисляется в AdminApp).
  // Без права таба и панели нет в DOM.
  const tabs = showTestgen ? [...ALL_LLM_TABS, TESTGEN_TAB] : ALL_LLM_TABS;
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_TAB;
    const params = new URLSearchParams(window.location.search);
    const tab = toText(params.get("tab"));
    return tabs.some((row) => row.id === tab) ? tab : DEFAULT_TAB;
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
    if (!tabs.some((row) => row.id === activeTab)) {
      setActiveTab(DEFAULT_TAB);
    }
  }, [activeTab, tabs]);

  function renderTabContent() {
    if (activeTab === "models") return <LlmModelsPanel />;
    if (activeTab === "modules") return <LlmModulesPanel />;
    if (activeTab === "prompts") return <LlmPromptsPanel />;
    if (activeTab === "features") return <LlmFeaturesPanel />;
    if (activeTab === "usage") return <LlmUsagePanel />;
    if (activeTab === "testgen") return showTestgen ? <TestgenPanel /> : null;
    return <LlmProvidersPanel />;
  }

  return (
    <div className="space-y-5" data-testid="admin-llm-page">
      <AdminTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} testIdPrefix="llm-tab-" />
      {renderTabContent()}
    </div>
  );
}
