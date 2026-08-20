import { useEffect } from "react";

import LoadingBlock from "../components/common/LoadingBlock";

export default function AdminAiModulesPage({ onNavigate }) {
  useEffect(() => {
    if (typeof onNavigate === "function") {
      onNavigate("/admin/llm?tab=modules", { replace: true });
    } else if (typeof window !== "undefined") {
      window.location.replace("/admin/llm?tab=modules");
    }
  }, [onNavigate]);

  return (
    <div className="space-y-5" data-testid="admin-ai-modules-page">
      <LoadingBlock label="Перенаправление в единый раздел LLM…" />
    </div>
  );
}
