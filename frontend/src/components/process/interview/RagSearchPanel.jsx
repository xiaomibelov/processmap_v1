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

  const hasExtractedName = isBpmn && !!(meta.element_name || extractBpmnName(chunkText));
  const showExcerpt = !isBpmn;
  const showRaw = isBpmn && !hasExtractedName;

  const sessionTitle = String(meta.session_title || "");
  const elementCtx = formatElementContext(meta);

  return (
    <div className="ragResultItem" data-testid="rag-result-item">
      <div className="ragResultHeader">
        <div className="ragResultTitle" data-testid="rag-result-title">{title}</div>
        <div className="ragResultBadges">
          <span className="ragResultTag">{sourceBadge}</span>
          <span className={`ragScorePill ${scoreClsName}`} data-testid="rag-result-score">{scoreLabel}</span>
        </div>
      </div>
      <div className="ragResultMeta">
        {elementCtx ? <span className="ragResultMetaItem"><span className="ragResultMetaLabel">Тип</span>{elementCtx}</span> : null}
        {sessionTitle ? <span className="ragResultMetaItem"><span className="ragResultMetaLabel">Сессия</span>{sessionTitle}</span> : null}
        {showRaw ? <span className="ragResultMetaItem ragResultMetaRaw">{chunkText}</span> : null}
        <button type="button" className="ragCopyBtn" onClick={() => handleCopy(chunkText)} title="Копировать" data-testid="rag-copy-btn">⎘</button>
      </div>
      {showExcerpt ? (
        <div className="ragResultExcerpt" data-testid="rag-result-excerpt">{chunkText}</div>
      ) : null}
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

      <form className="ragSearchForm" onSubmit={handleSearch} data-testid="rag-search-form">
        <div className="ragSearchRow">
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
          <input
            className="ragSearchInput"
            type="text"
            placeholder="Запрос…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="rag-search-input"
            disabled={searching}
          />
          <button
            type="submit"
            className="ragSearchBtn"
            disabled={searching || !query.trim()}
            data-testid="rag-search-btn"
          >
            {searching ? "…" : "Найти"}
          </button>
        </div>
      </form>

      {sid ? (
        <div className="ragIndexRow">
          <button
            type="button"
            className="ragIndexBtn"
            onClick={handleIndex}
            disabled={indexing}
            data-testid="rag-index-btn"
          >
            {indexing ? "Индексирование…" : "Обновить индекс"}
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
              <div className="ragResultsTotal" data-testid="rag-results-total">{results.length} результатов</div>
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
