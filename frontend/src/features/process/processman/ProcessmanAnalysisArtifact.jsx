import { useCallback, useEffect, useRef, useState } from "react";
import { ru } from "../../../shared/i18n/ru";
import { apiAgentAnalysisArtifact } from "../../../lib/api";

// M9 (agent-ui-completion-v1) — карточка сохранённого артефакта фонового
// анализа (bpmn_meta.agent_analysis_v1) на вкладке «Анализ процессов».
// Read-only GET при монтировании вкладки + кнопка «Обновить». 0 LLM-вызовов.
// Контракт: { artifact, schema_version, version, updated_at }; artifact=null
// или 404 — анализ ещё не выполнялся; artifact.status="failed" — честный фейл.
const t = ru.processman;

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function ProcessmanAnalysisArtifact({ sessionId }) {
  const sid = String(sessionId || "");
  const [state, setState] = useState({ kind: "loading", artifact: null, updatedAt: null, version: null });
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    if (!sid) return;
    const seq = (seqRef.current += 1);
    setState((prev) => ({ ...prev, kind: "loading" }));
    const res = await apiAgentAnalysisArtifact(sid);
    if (seq !== seqRef.current) return; // устаревший ответ
    if (!res.ok) {
      // 404 = артефакт ещё не сохранён — штатное «нет анализа», не сбой сети
      setState({ kind: res.status === 404 ? "none" : "failed", artifact: null, updatedAt: null, version: null });
      return;
    }
    const artifact = res.artifact;
    if (!artifact) {
      setState({ kind: "none", artifact: null, updatedAt: null, version: null });
      return;
    }
    setState({
      kind: artifact.status === "failed" ? "failed" : "ready",
      artifact,
      updatedAt: res.updatedAt ?? artifact.generated_at ?? null,
      version: res.version ?? null,
    });
  }, [sid]);

  useEffect(() => {
    void load();
  }, [load]);

  const { kind, artifact, updatedAt, version } = state;

  return (
    <div data-testid="processman-analysis-artifact" style={{ marginTop: 14, borderTop: "1px solid var(--pm-border, rgba(148,163,184,0.25))", paddingTop: 10 }}>
      <div className="pm-processman__section-title">{t.artifactTitle}</div>

      {kind === "loading" ? (
        <div className="pm-processman__hint" data-testid="processman-analysis-artifact-loading">
          {t.artifactLoading}
        </div>
      ) : null}

      {kind === "none" ? (
        <div className="pm-processman__hint" data-testid="processman-analysis-artifact-none">
          {t.artifactNone}
        </div>
      ) : null}

      {kind === "failed" ? (
        <div className="pm-processman__state pm-processman__state--warning" data-testid="processman-analysis-artifact-failed">
          <div className="pm-processman__state-title">{t.artifactFailed}</div>
          {artifact?.error ? (
            <div className="pm-processman__state-text" data-testid="processman-analysis-artifact-error">
              {String(artifact.error)}
            </div>
          ) : null}
        </div>
      ) : null}

      {kind === "ready" && artifact ? (
        <div data-testid="processman-analysis-artifact-ready">
          <div className="pm-processman__hint" data-testid="processman-analysis-artifact-summary">
            {[
              t.artifactStatusDone,
              artifact.generated_at ? `${t.artifactGeneratedAt}: ${String(artifact.generated_at)}` : "",
              artifact.model ? `${t.artifactModel}: ${String(artifact.model)}` : "",
              updatedAt ? `${t.artifactUpdated}: ${String(updatedAt)}` : "",
              version !== null && version !== undefined ? `v${String(version)}` : "",
            ].filter(Boolean).join(" · ")}
          </div>
          {artifact.analysis?.summary && typeof artifact.analysis.summary === "string" ? (
            <div className="pm-processman__hint" data-testid="processman-analysis-artifact-brief">{artifact.analysis.summary}</div>
          ) : null}
          <details className="pm-processman-sources" data-testid="processman-analysis-artifact-details">
            <summary>{t.artifactDetails}</summary>
            <div className="pm-processman-sources__body">
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 11 }}>{safeJson(artifact)}</pre>
            </div>
          </details>
        </div>
      ) : null}

      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          className="pm-processman__action"
          data-testid="processman-analysis-artifact-refresh"
          onClick={() => void load()}
          disabled={kind === "loading"}
        >
          {kind === "loading" ? t.artifactRefreshing : t.artifactRefresh}
        </button>
      </div>
    </div>
  );
}
