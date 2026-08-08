import { useState } from "react";
import { ru } from "../../../shared/i18n/ru";
import SchemaAssistantBlock from "../../../components/process/SchemaAssistantBlock";
import TobeStepContext from "./TobeStepContext";
import LlmAnalysisSummary from "./LlmAnalysisSummary";
import { buildProcessmanTabs } from "./processmanView";

// LLM4 — панель «Процесс-менеджер» (PROCESSMAN) поверх схемы v1.
// Контракт пропсов (спека LLM4): { sessionId, steps, selectedBpmnElement,
// tab, switchTab, llmStatus, onOpenFullAnalysis }.
// Token economy: открытие панели, переключение вкладок и выбор узла НЕ делают
// LLM-вызовов (0 токенов). Действия по клику внутри SchemaAssistantBlock — 1
// вызов = 1 действие. llmStatus кэшируется на сессию в ProcessStage.
const t = ru.processman;

function StaticTab({ title, text, hint, testid }) {
  return (
    <div data-testid={testid} style={{ padding: 12 }}>
      <div className="small" style={{ fontWeight: 600, color: "#111827", marginBottom: 4 }}>{title}</div>
      <div className="muted small" style={{ marginBottom: 8 }}>{text}</div>
      {hint ? <div className="muted small">{hint}</div> : null}
    </div>
  );
}

export default function ProcessmanPanel({
  sessionId,
  steps = [],
  selectedBpmnElement = null,
  llmStatus = null,
  onOpenFullAnalysis,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState("schema");
  const tabs = buildProcessmanTabs(t.tabs);

  return (
    <div
      className="processmanPanel"
      data-testid="processman-panel"
      role="dialog"
      aria-label={t.panelTitle}
      style={{
        position: "absolute",
        top: 56,
        right: 12,
        width: 420,
        maxWidth: "calc(100vw - 24px)",
        maxHeight: "calc(100% - 68px)",
        overflowY: "auto",
        zIndex: 30,
        background: "#ffffff",
        border: "1px solid #d0d7de",
        borderRadius: 12,
        boxShadow: "0 12px 32px rgba(0,0,0,.18)",
        color: "#111827",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 14px 8px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="interviewBlockTitle" style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
            {t.panelTitle}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>{t.panelSubtitle}</div>
        </div>
        <button
          type="button"
          className="secondaryBtn smallBtn"
          data-testid="processman-close"
          aria-label={t.close}
          title={t.close}
          onClick={() => onClose?.()}
        >
          ×
        </button>
      </div>

      <div
        role="tablist"
        aria-label={t.panelTitle}
        style={{ display: "flex", gap: 4, padding: "0 12px 8px", borderBottom: "1px solid #e5e7eb" }}
      >
        {tabs.map((tabItem) => {
          const active = activeTab === tabItem.id;
          return (
            <button
              key={tabItem.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`processman-tab-${tabItem.id}`}
              className="smallBtn"
              onClick={() => setActiveTab(tabItem.id)}
              style={{
                flex: 1,
                whiteSpace: "nowrap",
                padding: "5px 8px",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                borderRadius: 8,
                border: active ? "1px solid #1f6feb" : "1px solid transparent",
                color: active ? "#ffffff" : "#374151",
                background: active ? "#1f6feb" : "transparent",
                cursor: "pointer",
              }}
            >
              {tabItem.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" data-testid="processman-tabpanel" style={{ paddingBottom: 4 }}>
        {activeTab === "schema" ? (
          <div data-testid="processman-schema-pane">
            <div className="muted small" style={{ padding: "10px 12px 0" }}>{t.schemaTabHint}</div>
            <SchemaAssistantBlock sessionId={sessionId} selectedElement={selectedBpmnElement} />
          </div>
        ) : null}
        {activeTab === "tobe" ? (
          <TobeStepContext selectedElement={selectedBpmnElement} steps={steps} />
        ) : null}
        {activeTab === "analysis" ? (
          <LlmAnalysisSummary llmStatus={llmStatus} onOpenFullAnalysis={onOpenFullAnalysis} />
        ) : null}
        {activeTab === "asis" ? (
          <StaticTab title={t.asisTitle} text={t.asisText} testid="processman-asis" />
        ) : null}
        {activeTab === "reports" ? (
          <StaticTab title={t.reportsTitle} text={t.reportsText} hint={t.s7ReportsHint} testid="processman-reports" />
        ) : null}
      </div>
    </div>
  );
}
