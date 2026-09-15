import { useEffect, useMemo, useRef, useState } from "react";
import { shortSnapshotHash } from "../../bpmn/snapshots/bpmnSnapshots";
import { formatRevisionTimestampRu } from "./revisionHistoryUiModel";
import { useWindowedList } from "./useWindowedList";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function itemId(item) {
  return String(item?.id || "");
}

function itemNumber(item) {
  return Number(item?.revisionNumber || item?.rev || item?.userFacingRevisionNumber || 0);
}

function itemTitle(item) {
  if (item?.isTechnicalRevision) {
    return String(item?.reasonLabel || item?.reason || "Техническая версия");
  }
  const n = itemNumber(item);
  return n > 0 ? `Версия ${n}` : "Без номера версии";
}

function itemAuthor(item) {
  return String(item?.authorLabel || item?.authorName || item?.authorEmail || item?.authorId || "Автор не указан");
}

function formatItemSize(bytes) {
  const n = Number(bytes || 0);
  if (!n || n <= 0) return "—";
  const kb = n / 1024;
  return `${kb < 1 ? n.toFixed(0) : kb.toFixed(1)} ${kb < 1 ? "B" : "KB"}`;
}

function itemHash(item) {
  return shortSnapshotHash(String(item?.hash || item?.sessionPayloadHash || item?.xml || ""));
}

function chipClass(active, slot) {
  const base = "pointer-events-auto flex h-5 w-5 cursor-pointer items-center justify-center rounded border text-[11px] font-semibold transition-colors duration-150 ";
  if (active && slot === "A") return `${base} border-accent bg-accent text-white`;
  if (active && slot === "B") return `${base} border-accent2 bg-accent2 text-white`;
  return `${base} border-border bg-panel text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:border-accent hover:text-fg`;
}

export default function BpmnVersionList({
  items,
  previewId,
  compareAId,
  compareBId,
  busy = false,
  loadingMore = false,
  hasMore = false,
  loadState = "idle",
  loadError = "",
  emptyMessage = "",
  totalCount = 0,
  includeTechnical = false,
  isAdmin = false,
  onPreview,
  onAssign,
  onLoadMore,
  onRefresh,
  onToggleTechnical,
  getDiffSummary,
}) {
  const list = useMemo(() => asArray(items), [items]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [copiedId, setCopiedId] = useState("");
  const copyTimerRef = useRef(null);
  const cardRefs = useRef(new Map());

  const { scrollRef, enabled: windowingEnabled, start, end, topSpacer, bottomSpacer, resetScroll } = useWindowedList(list);

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
  }, []);

  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, list.length - 1)));
  }, [list.length]);

  useEffect(() => {
    resetScroll();
  }, [resetScroll, loadState]);

  const latestUserFacingId = useMemo(() => {
    let bestId = "";
    let bestTs = -1;
    list.forEach((item) => {
      if (item?.isTechnicalRevision) return;
      const ts = Number(item?.ts || 0);
      if (ts >= bestTs) {
        bestTs = ts;
        bestId = itemId(item);
      }
    });
    return bestId;
  }, [list]);

  const visibleItems = windowingEnabled ? list.slice(start, end) : list;

  const focusCard = (index) => {
    const clamped = Math.max(0, Math.min(list.length - 1, index));
    setActiveIndex(clamped);
    const node = cardRefs.current.get(clamped);
    if (node && typeof node.focus === "function") node.focus();
  };

  const handleKeyDown = (event) => {
    if (!list.length) return;
    const key = event.key;
    if (key === "ArrowDown") {
      event.preventDefault();
      focusCard(activeIndex + 1);
      return;
    }
    if (key === "ArrowUp") {
      event.preventDefault();
      focusCard(activeIndex - 1);
      return;
    }
    const item = list[activeIndex];
    if (!item) return;
    if (key === "Enter") {
      event.preventDefault();
      onPreview?.(item);
      return;
    }
    if (key === "a" || key === "A" || key === "ф" || key === "Ф") {
      event.preventDefault();
      onAssign?.("A", item);
      return;
    }
    if (key === "b" || key === "B" || key === "и" || key === "И") {
      event.preventDefault();
      onAssign?.("B", item);
    }
  };

  const handleCopyHash = async (item) => {
    const hash = itemHash(item);
    if (!hash) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(hash);
      }
    } catch {
      // Clipboard недоступен (небезопасный контекст) — подсветка всё равно покажется.
    }
    setCopiedId(itemId(item));
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopiedId(""), 1500);
  };

  const renderCard = (item, index) => {
    const id = itemId(item);
    const technical = !!item?.isTechnicalRevision;
    const active = id === String(previewId || "");
    const inA = id === String(compareAId || "");
    const inB = id === String(compareBId || "");
    const diffSummary = typeof getDiffSummary === "function" ? getDiffSummary(item) : null;
    const copied = copiedId === id && !technical;
    return (
      <div
        key={id || `idx_${index}`}
        ref={(node) => {
          if (node) cardRefs.current.set(index, node);
          else cardRefs.current.delete(index);
        }}
        role="option"
        aria-selected={active}
        tabIndex={index === activeIndex ? 0 : -1}
        className={
          "group relative cursor-pointer rounded-xl border p-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 "
          + (technical ? "opacity-75 " : "")
          + (active
            ? "border-accent bg-accentSoft/35"
            : "border-border bg-panel hover:border-accent hover:bg-panel2")
        }
        data-testid="bpmn-version-item"
        data-snapshot-id={id}
        onClick={() => {
          setActiveIndex(index);
          onPreview?.(item);
        }}
      >
        <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1">
          <button
            type="button"
            aria-pressed={inA}
            aria-label="Назначить версию A"
            title={inA ? "Снять метку A" : "Назначить версию A"}
            className={chipClass(inA, "A")}
            data-testid="bpmn-version-assign-a"
            onClick={(event) => {
              event.stopPropagation();
              onAssign?.("A", item);
            }}
          >
            A
          </button>
          <button
            type="button"
            aria-pressed={inB}
            aria-label="Назначить версию B"
            title={inB ? "Снять метку B" : "Назначить версию B"}
            className={chipClass(inB, "B")}
            data-testid="bpmn-version-assign-b"
            onClick={(event) => {
              event.stopPropagation();
              onAssign?.("B", item);
            }}
          >
            B
          </button>
        </div>

        <div className="mb-1 flex items-center gap-1.5 pr-14">
          <span className="truncate text-[15px] font-semibold text-fg" data-testid="bpmn-version-label">
            {itemTitle(item)}
          </span>
          {id === latestUserFacingId && !technical ? (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              последняя
            </span>
          ) : null}
          {technical ? (
            <span className="rounded-full border border-border bg-panel2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
              техническая
            </span>
          ) : null}
        </div>

        <div className="mb-1 text-[13px] text-muted">
          {formatRevisionTimestampRu(item?.ts)} · {itemAuthor(item)}
        </div>

        {diffSummary ? (
          <div className="mb-1 font-mono text-xs text-muted" data-testid="bpmn-version-diff-summary">
            {String(diffSummary)}
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-xs text-muted">
          <button
            type="button"
            className="cursor-pointer font-mono text-fg underline decoration-dotted underline-offset-2 hover:text-accent"
            title={copied ? "Скопировано" : "Скопировать хэш"}
            onClick={(event) => {
              event.stopPropagation();
              void handleCopyHash(item);
            }}
          >
            {copied ? "Скопировано" : itemHash(item)}
          </button>
          <span>·</span>
          <span>{formatItemSize(item?.len)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-0 h-full flex-col" data-testid="bpmn-versions-list">
      <div className="mb-2 px-1 text-xs text-muted" data-testid="bpmn-versions-count">
        <div className="flex items-center justify-between gap-2">
          <span data-testid="bpmn-versions-shown-count">
            Показано {list.length} из {Math.max(Number(totalCount || 0), list.length)} версий
          </span>
          {isAdmin ? (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-accent"
                checked={!!includeTechnical}
                onChange={() => onToggleTechnical?.()}
                disabled={busy || loadingMore}
                data-testid="bpmn-versions-show-technical"
              />
              Показать технические
            </label>
          ) : null}
        </div>
        <div className="mt-1 text-[11px] leading-snug text-muted">
          Клик по карточке — предпросмотр. Клавиши A/B — назначение версии в пару сравнения.
        </div>
      </div>

      <div
        ref={scrollRef}
        role="listbox"
        aria-label="Версии BPMN"
        tabIndex={-1}
        className="min-h-0 flex-1 space-y-2 overflow-auto pr-1 focus-visible:outline-none"
        onKeyDown={handleKeyDown}
      >
        {loadState === "loading" ? (
          <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted" data-testid="bpmn-versions-loading">
            Загружаем историю версий...
          </div>
        ) : loadState === "failed" ? (
          <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200" data-testid="bpmn-versions-error">
            Не удалось загрузить историю версий: {String(loadError || "ошибка загрузки")}
          </div>
        ) : loadState === "empty" || (loadState === "ready" && list.length === 0) ? (
          <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted" data-testid="bpmn-versions-empty">
            {String(emptyMessage || "Версий пока нет. Текущий BPMN может быть сохранён как черновик; новая версия создаётся отдельным действием.")}
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted" data-testid="bpmn-versions-idle">
            История версий ещё не загружена.
          </div>
        ) : (
          <>
            {windowingEnabled && topSpacer ? <div style={{ height: topSpacer }} aria-hidden="true" /> : null}
            {visibleItems.map((item, offset) => renderCard(item, windowingEnabled ? start + offset : offset))}
            {windowingEnabled && bottomSpacer ? <div style={{ height: bottomSpacer }} aria-hidden="true" /> : null}
          </>
        )}
      </div>

      {loadState === "ready" && list.length > 0 ? (
        <div className="flex items-center justify-center gap-2 pt-2">
          {hasMore ? (
            <button
              type="button"
              className="secondaryBtn h-8 px-3 text-xs"
              onClick={() => onLoadMore?.()}
              disabled={busy || loadingMore}
              data-testid="bpmn-versions-load-more"
            >
              {loadingMore ? "Загрузка..." : "Загрузить ещё 10"}
            </button>
          ) : (
            <span className="text-[11px] text-muted">Все версии загружены</span>
          )}
        </div>
      ) : null}
      {loadState === "failed" ? (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            className="secondaryBtn h-8 px-3 text-xs"
            onClick={() => onRefresh?.()}
            disabled={busy || loadingMore}
            data-testid="bpmn-versions-retry"
          >
            Обновить список версий
          </button>
        </div>
      ) : null}
    </div>
  );
}
