import { useCallback, useRef, useState } from "react";
import { apiRagSearch, apiRagIndex } from "../../../lib/api.js";
import { scoreClass, formatElementContext, indexStatusClass, extractBpmnName, makeBpmnResultTitle, formatScore, getSourceTypeLabel } from "./RagSearchPanel.helpers.js";

const SOURCE_TYPE_OPTIONS = [
  { value: "", label: "Все типы" },
  { value: "bpmn_xml", label: "BPMN XML" },
  { value: "product_action", label: "Продуктовые действия" },
];

function handleCopy(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function RagResultItem({ item }) {
  const rawScore = item?.score;
  const sourceType = String(item?.source_type || item?.metadata?.source_type || "");
  const chunkText = String(item?.chunk_text || "");
  const meta = item?.metadata || {};
  const isBpmn = sourceType === "bpmn_xml";
  const isProductAction = sourceType === "product_action";

  const title = isBpmn
    ? makeBpmnResultTitle(meta, chunkText)
    : isProductAction
      ? String(meta.product_name || meta.action_type || "Продуктовое действие")
      : getSourceTypeLabel(sourceType) || "Фрагмент";

  const sourceBadge = isBpmn ? "BPMN" : isProductAction ? "Действие" : getSourceTypeLabel(sourceType);
  const scoreLabel = formatScore(rawScore);
  const scoreClsName = typeof rawScore === "number" ? scoreClass(rawScore) : "";

  const hasExtractedName = isBpmn && !!extractBpmnName(chunkText);
  const showExcerpt = !isBpmn || !hasExtractedName;
  const showRaw = isBpmn;

  const sessionTitle = String(meta.session_title || "");
  const elementCtx = formatElementContext(meta);

  return (
    <div className="ragResultItem" data-testid="rag-result-item">
      <div className="ragResultHeader">
        <span className="ragResultTitle" data-testid="rag-result-title">{title}</span>
        <div className="ragResultBadges">
          <span className="ragResultTag">{sourceBadge}</span>
          <span className={`ragScorePill ${scoreClsName}`} data-testid="rag-result-score">{scoreLabel}</span>
        </div>
      </div>
      {showExcerpt ? (
        <div className="ragResultExcerpt" data-testid="rag-result-excerpt">{chunkText}</div>
      ) : null}
      {showRaw ? (
        <div className="ragResultRaw" data-testid="rag-result-raw">{chunkText}</div>
      ) : null}
      <div className="ragResultFooter">
        {sessionTitle ? <span className="ragResultSource" title={sessionTitle}>{sessionTitle}</span> : null}
        {elementCtx ? <span className="ragResultContext">{elementCtx}</span> : null}
        <button type="button" className="ragCopyBtn" onClick={() => handleCopy(chunkText)} title="Копировать" data-testid="rag-copy-btn">⎘</button>
      </div>
    </div>
  );
}

export default function RagSearchPanel({ sessionId }) {
  const sid = String(sessionId || "").trim();

  const [query, setQuery] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [indexStatus, setIndexStatus] = useState("");

  const abortRef = useRef(null);

  const handleSearch = useCallback(async (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setSearching(true);
    setSearchError("");
    setResults(null);

    try {
      const r = await apiRagSearch({
        q,
        top_k: 10,
        source_type: sourceType,
        session_id: sid,
      });
      if (ac.signal.aborted) return;
      if (!r.ok) {
        setSearchError(String(r.error || "Ошибка поиска"));
        setResults([]);
      } else {
        setResults(r.results);
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      setSearchError(String(err?.message || "Ошибка поиска"));
      setResults([]);
    } finally {
      if (!ac.signal.aborted) setSearching(false);
    }
  }, [query, sourceType, sid]);

  const handleIndex = useCallback(async () => {
    if (!sid) return;
    setIndexing(true);
    setIndexStatus("");
    try {
      const r = await apiRagIndex({ source_type: "bpmn_xml", session_id: sid });
      if (!r.ok) {
        setIndexStatus(`Ошибка: ${String(r.error || "unknown")}`);
      } else {
        setIndexStatus(r.was_updated
          ? `Проиндексировано: ${r.chunks_created} чанков`
          : "Без изменений (хэш совпадает)");
      }
    } catch (err) {
      setIndexStatus(`Ошибка: ${String(err?.message || "unknown")}`);
    } finally {
      setIndexing(false);
    }
  }, [sid]);

  const hasResults = Array.isArray(results);
  const showInitialHint = results === null && !searching && !searchError;

  return (
    <div className="ragSearchPanel" data-testid="rag-search-panel">
      <div className="ragReadOnlyNotice" data-testid="rag-readonly-notice">
        Только чтение — результаты не применяются автоматически
      </div>

      <form className="ragSearchForm" onSubmit={handleSearch} data-testid="rag-search-form">
        <div className="ragSearchInputRow">
          <input
            className="ragSearchInput"
            type="text"
            placeholder="Поиск по базе знаний…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="rag-search-input"
            disabled={searching}
          />
        </div>
        <div className="ragFiltersRow">
          <select
            className="ragSourceTypeSelect"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            data-testid="rag-source-type-select"
            disabled={searching}
          >
            {SOURCE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            type="submit"
            className="secondaryBtn tinyBtn"
            disabled={searching || !query.trim()}
            data-testid="rag-search-btn"
          >
            {searching ? "Поиск…" : "Найти"}
          </button>
        </div>
      </form>

      {sid ? (
        <div className="ragIndexRow">
          <button
            type="button"
            className="secondaryBtn tinyBtn"
            onClick={handleIndex}
            disabled={indexing}
            data-testid="rag-index-btn"
          >
            {indexing ? "Индексирование…" : "Индексировать сессию"}
          </button>
          {indexStatus ? (
            <span className={`ragIndexStatus ${indexStatusClass(indexStatus)}`} data-testid="rag-index-status">{indexStatus}</span>
          ) : null}
        </div>
      ) : null}

      <div className="ragResultsArea">
        {searching ? (
          <div className="ragSearchingIndicator" data-testid="rag-searching-indicator">Поиск…</div>
        ) : null}

        {searchError ? (
          <div className="interviewAnnotationNotice err ragSearchError" data-testid="rag-search-error">
            {searchError}
          </div>
        ) : null}

        {showInitialHint ? (
          <div className="ragInitialHint" data-testid="rag-initial-hint">
            Введите запрос для поиска по базе знаний
          </div>
        ) : null}

        {hasResults ? (
          results.length === 0 ? (
            <div className="ragResultsEmpty" data-testid="rag-results-empty">
              Ничего не найдено
            </div>
          ) : (
            <>
              <div className="ragResultsTotal" data-testid="rag-results-total">Найдено: {results.length}</div>
              <div className="ragResultsList" data-testid="rag-results-list">
                {results.map((item, i) => (
                  <RagResultItem key={String(item?.chunk_id || i)} item={item} />
                ))}
              </div>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}
