import { useCallback, useState } from "react";
import { apiLlmExplainStep, apiLlmStepQa, apiLlmSuggestNext } from "../../lib/api";
import { SA_STATUS, mapSaResponse, saStatusLine } from "./schemaAssistantView";

// LLM3 — панель «Помощник на схеме»: 3 действия, ТОЛЬКО по клику
// (никаких авто-вызовов, в т.ч. при открытии панели — source-тест).
// suggest-next — кандидаты строго из живого каталога (backend-фильтр);
// explain-step — пересказ строго trace_map (нет решения → честный no_trace);
// step-qa — Q&A по выделенному шагу (контекст = проекция шага).
export default function SchemaAssistantBlock({ sessionId, selectedElement = null }) {
  const [open, setOpen] = useState(false);
  const [suggest, setSuggest] = useState({ status: SA_STATUS.IDLE });
  const [explain, setExplain] = useState({ status: SA_STATUS.IDLE });
  const [qa, setQa] = useState({ status: SA_STATUS.IDLE });
  const [question, setQuestion] = useState("");

  const selectedId = String(selectedElement?.id || "").trim();
  const selectedName = String(selectedElement?.name || selectedElement?.title || selectedId || "");

  const runSuggest = useCallback(async () => {
    setSuggest({ status: SA_STATUS.LOADING });
    const resp = await apiLlmSuggestNext(sessionId, { afterStepId: selectedId });
    setSuggest(mapSaResponse(resp));
  }, [sessionId, selectedId]);

  const runExplain = useCallback(async () => {
    if (!selectedId) return;
    setExplain({ status: SA_STATUS.LOADING });
    const resp = await apiLlmExplainStep(sessionId, { stepId: selectedId });
    setExplain(mapSaResponse(resp));
  }, [sessionId, selectedId]);

  const runQa = useCallback(async () => {
    const q = question.trim();
    if (!selectedId || !q) return;
    setQa({ status: SA_STATUS.LOADING });
    const resp = await apiLlmStepQa(sessionId, { stepId: selectedId, question: q });
    setQa(mapSaResponse(resp));
  }, [sessionId, selectedId, question]);

  const errLine = (st) => (
    <div className="muted small" style={{ margin: "6px 0", color: "#b91c1c" }}>
      {st.errorText}
    </div>
  );
  const isErr = (status) => [SA_STATUS.NO_PROVIDER, SA_STATUS.RATE_LIMITED, SA_STATUS.DISABLED, SA_STATUS.ERROR].includes(status);

  return (
    <div className="interviewBlock" data-testid="schema-assistant-block" style={{ margin: "8px 12px" }}>
      <div className="interviewBlockHead">
        <div>
          <div className="interviewBlockTitle">Помощник на схеме (LLM)</div>
          <div className="muted small" style={{ marginTop: 4 }}>
            Три действия по клику: следующий блок из каталога, объяснение AI-решения, вопрос по шагу.
          </div>
        </div>
        <button
          type="button"
          className="secondaryBtn smallBtn"
          data-testid="schema-assistant-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Свернуть" : "Открыть"}
        </button>
      </div>

      {open ? (
        <div data-testid="schema-assistant-panel" style={{ marginTop: 8 }}>
          {/* 1. suggest-next */}
          <div style={{ marginBottom: 10 }}>
            <button
              type="button"
              className="secondaryBtn smallBtn"
              data-testid="schema-assistant-suggest"
              disabled={suggest.status === SA_STATUS.LOADING}
              onClick={() => void runSuggest()}
            >
              {suggest.status === SA_STATUS.LOADING ? "Подбираю…" : "Предложить следующий блок"}
            </button>
            {isErr(suggest.status) ? errLine(suggest) : null}
            {[SA_STATUS.OK, SA_STATUS.PARTIAL, SA_STATUS.CACHED].includes(suggest.status) ? (
              <div data-testid="schema-assistant-suggest-result" style={{ marginTop: 6 }}>
                <div className="muted small" style={{ marginBottom: 4 }}>{saStatusLine(suggest.status, suggest.data?.dropped)}</div>
                {(suggest.data?.suggestions?.candidates || []).length ? (
                  <ul className="muted small" style={{ margin: "4px 0", paddingLeft: 18 }}>
                    {suggest.data.suggestions.candidates.map((c, i) => (
                      <li key={`sa-sug-${i}`}><code>{c.code}</code>{c.rationale ? ` — ${c.rationale}` : ""}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="muted small">LLM не предложил кандидатов из каталога.</div>
                )}
                {suggest.data?.suggestions?.note ? <div className="muted small">{suggest.data.suggestions.note}</div> : null}
              </div>
            ) : null}
          </div>

          {/* 2. explain-step */}
          <div style={{ marginBottom: 10 }}>
            <button
              type="button"
              className="secondaryBtn smallBtn"
              data-testid="schema-assistant-explain"
              disabled={!selectedId || explain.status === SA_STATUS.LOADING}
              title={selectedId ? "" : "Выделите шаг на схеме"}
              onClick={() => void runExplain()}
            >
              {explain.status === SA_STATUS.LOADING ? "Объясняю…" : "Объяснить AI-решение"}
            </button>
            <span className="muted small" style={{ marginLeft: 8 }}>
              {selectedId ? `шаг: ${selectedName || selectedId}` : "выделите шаг на схеме"}
            </span>
            {isErr(explain.status) || explain.status === SA_STATUS.NO_TRACE ? errLine(explain) : null}
            {[SA_STATUS.OK, SA_STATUS.PARTIAL, SA_STATUS.CACHED].includes(explain.status) ? (
              <div data-testid="schema-assistant-explain-result" style={{ marginTop: 6 }}>
                <div className="muted small" style={{ marginBottom: 4 }}>{saStatusLine(explain.status)}</div>
                {explain.data?.trace?.rule_name ? (
                  <div className="muted small" style={{ marginBottom: 4 }}>
                    Решение: <b>{explain.data.trace.rule_name}</b>
                    {explain.data.trace.source ? ` (источник: ${explain.data.trace.source})` : ""}
                  </div>
                ) : null}
                <div className="small">{explain.data?.explanation || ""}</div>
                {explain.data?.note ? <div className="muted small">{explain.data.note}</div> : null}
              </div>
            ) : null}
          </div>

          {/* 3. step-qa */}
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                className="input"
                data-testid="schema-assistant-question"
                placeholder={selectedId ? "Вопрос по выделенному шагу…" : "Сначала выделите шаг на схеме"}
                value={question}
                disabled={!selectedId}
                onChange={(e) => setQuestion(e.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                className="secondaryBtn smallBtn"
                data-testid="schema-assistant-ask"
                disabled={!selectedId || !question.trim() || qa.status === SA_STATUS.LOADING}
                onClick={() => void runQa()}
              >
                {qa.status === SA_STATUS.LOADING ? "Спрашиваю…" : "Спросить"}
              </button>
            </div>
            {isErr(qa.status) || qa.status === SA_STATUS.STEP_NOT_FOUND ? errLine(qa) : null}
            {[SA_STATUS.OK, SA_STATUS.PARTIAL, SA_STATUS.CACHED].includes(qa.status) ? (
              <div data-testid="schema-assistant-qa-result" style={{ marginTop: 6 }}>
                <div className="muted small" style={{ marginBottom: 4 }}>{saStatusLine(qa.status)}</div>
                <div className="small">{qa.data?.answer || ""}</div>
                {qa.data?.note ? <div className="muted small">{qa.data.note}</div> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
