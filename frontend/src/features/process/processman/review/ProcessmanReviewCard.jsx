import { useState } from "react";
import { ru } from "../../../../shared/i18n/ru";
import processmanIconRaw from "../../../../assets/icons/processman.svg?raw";
import { AGENT_STATUS } from "../chat/processmanChatStore";
import { formatClock } from "../processmanView";
import { buildReviewSegments, countBySeverity, normalizeSeverity } from "./reviewSegments";
import ReviewAnnotationPopover from "./ReviewAnnotationPopover";

// feature/session-doc-attachments — карточка ревью по техкарте.
// Проверяемый текст с подсветкой найденных цитат (<mark data-annotation-idx>),
// клик по mark → поповер аннотации; ненайденные цитаты — боковой список.
// Состояния: pending (skeleton) / error (inline + retry) / done.
const t = ru.processman;

function severityLabel(severity) {
  const normalized = normalizeSeverity(severity);
  return normalized === "error" ? t.reviewSeverityError
    : normalized === "warning" ? t.reviewSeverityWarning
      : t.reviewSeverityInfo;
}

function IconRetry() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v6h-6" />
    </svg>
  );
}

function ReviewSkeleton() {
  return (
    <div className="pm-review-card__skeleton" data-testid="processman-review-loading" aria-hidden="true">
      <span className="pm-review-card__skeleton-line pm-review-card__skeleton-line--short" />
      <span className="pm-review-card__skeleton-line" />
      <span className="pm-review-card__skeleton-line pm-review-card__skeleton-line--medium" />
    </div>
  );
}

export default function ProcessmanReviewCard({ msg, onRetry }) {
  const [openAnnotation, setOpenAnnotation] = useState(null); // { annotation, index, anchor }
  const review = msg?.review || {};
  const status = review.status || AGENT_STATUS.DONE;
  const annotations = Array.isArray(review.annotations) ? review.annotations : [];
  const { segments, side } = buildReviewSegments(review.checkedText, annotations);
  const counts = countBySeverity(annotations);
  const retrievalMode = String(review.retrievalMode || "").trim().toLowerCase();

  const closePopover = () => setOpenAnnotation(null);

  return (
    <div
      className="pm-processman-msg pm-processman-msg--agent pm-review-card"
      data-testid="processman-review-card"
      title={formatClock(msg?.at)}
    >
      <div className="pm-processman-msg__avatar-row" aria-hidden="true">
        <span className="pm-processman-msg__avatar" aria-hidden="true" dangerouslySetInnerHTML={{ __html: processmanIconRaw }} />
      </div>
      <div className="pm-processman-msg__body pm-review-card__body">
        {status === AGENT_STATUS.PENDING ? <ReviewSkeleton /> : null}

        {status === AGENT_STATUS.ERROR ? (
          <div className="pm-review-card__error" data-testid="processman-review-error">
            <div className="pm-processman__state-title">{t.errorTitle}</div>
            <div className="pm-processman__state-text">{review.errorText || t.reviewErrorFallback}</div>
            <button
              type="button"
              className="pm-processman-msg__secondary"
              data-testid="processman-review-retry"
              onClick={(e) => { e.stopPropagation(); onRetry?.(msg); }}
            >
              <IconRetry />
              {t.retryLabel}
            </button>
          </div>
        ) : null}

        {status === AGENT_STATUS.DONE ? (
          <>
            {annotations.length === 0 ? (
              <div className="pm-review-card__ok" data-testid="processman-review-clean">
                <span className="pm-review-card__ok-title">{t.reviewIssuesNoneTitle}</span>
                <span className="pm-review-card__ok-text">{t.reviewIssuesNoneText}</span>
              </div>
            ) : (
              <>
                <div className="pm-review-card__summary" data-testid="processman-review-summary">
                  <span className="pm-review-card__count">{annotations.length} {t.reviewIssuesCount}</span>
                  {counts.error ? <span className="pm-review-badge pm-review-badge--error">{t.reviewSeverityError}: {counts.error}</span> : null}
                  {counts.warning ? <span className="pm-review-badge pm-review-badge--warning">{t.reviewSeverityWarning}: {counts.warning}</span> : null}
                  {counts.info ? <span className="pm-review-badge pm-review-badge--info">{t.reviewSeverityInfo}: {counts.info}</span> : null}
                  {retrievalMode ? (
                    <span className="pm-review-card__mode">
                      {retrievalMode === "direct" ? t.reviewModeDirect : t.reviewModeRag}
                    </span>
                  ) : null}
                </div>
                <div className="pm-review-card__text" data-testid="processman-review-text">
                  {segments.map((segment, idx) => segment.type === "mark" ? (
                    <mark
                      key={`mk_${idx}`}
                      className={`pm-review-mark pm-review-mark--${normalizeSeverity(segment.annotation.severity)}`}
                      data-annotation-idx={segment.index}
                      data-testid="processman-review-mark"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenAnnotation({ annotation: segment.annotation, index: segment.index, anchor: e.currentTarget });
                      }}
                    >
                      {segment.text}
                    </mark>
                  ) : (
                    <span key={`tx_${idx}`}>{segment.text}</span>
                  ))}
                </div>
                {side.length ? (
                  <div className="pm-review-card__side" data-testid="processman-review-side">
                    <div className="pm-review-card__side-title">{t.reviewUnfoundTitle}</div>
                    {side.map(({ annotation, index }) => (
                      <div key={`sd_${index}`} className="pm-review-card__side-item">
                        <span className={`pm-review-badge pm-review-badge--${normalizeSeverity(annotation.severity)}`}>
                          {severityLabel(annotation.severity)}
                        </span>
                        <span className="pm-review-card__side-quote">{String(annotation.quote || "—")}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </div>

      {openAnnotation ? (
        <ReviewAnnotationPopover
          anchor={openAnnotation.anchor}
          annotation={openAnnotation.annotation}
          onClose={closePopover}
        />
      ) : null}
    </div>
  );
}
