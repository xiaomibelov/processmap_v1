import Modal from "../../../shared/ui/Modal";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function statusLabel(status) {
  const key = toText(status).toLowerCase();
  if (key === "missing_binding") return "не привязан";
  if (key === "missing_node") return "узел не найден";
  if (key === "duplicate_node") return "конфликт привязки";
  return "требуется проверка";
}

export default function BindingAssistantModal({
  open,
  onClose,
  issueCount,
  issues,
  autoBindCount,
  onAutoBindAll,
  onBindOne,
  feedbackText,
}) {
  return (
    <Modal
      open={open}
      title="Помощник привязок"
      onClose={onClose}
      footer={(
        <>
          <button
            type="button"
            className="secondaryBtn"
            onClick={() => onAutoBindAll?.()}
            disabled={Number(autoBindCount || 0) <= 0}
            data-testid="binding-assistant-autobind"
          >
            Автопривязать все (безопасно)
          </button>
          <button type="button" className="primaryBtn" onClick={onClose}>
            Закрыть
          </button>
        </>
      )}
    >
      <div className="space-y-3" data-testid="binding-assistant-modal">
        <div className="rounded-lg border border-border bg-panel2/40 px-3 py-2 text-xs text-muted">
          Проблемных шагов: <b className="text-fg" data-testid="binding-assistant-count">{Number(issueCount || 0)}</b>
          {" · "}
          безопасный автоподбор: <b className="text-fg">{Number(autoBindCount || 0)}</b>
        </div>
        {feedbackText ? (
          <div className="badge">{feedbackText}</div>
        ) : null}
        <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
          {asArray(issues).length === 0 ? (
            <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted">
              Все шаги привязаны.
            </div>
          ) : (
            asArray(issues).map((item) => {
              const stepId = toText(item?.stepId);
              return (
                <div
                  key={stepId}
                  className="rounded-lg border border-border bg-panel px-3 py-2"
                  data-testid="binding-assistant-issue"
                  data-step-id={stepId}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-fg">
                      {Number(item?.seq || 0)}. {toText(item?.action) || "Без названия"}
                    </div>
                    <span className="badge warn text-[10px]">{statusLabel(item?.status)}</span>
                  </div>
                  <div className="mb-2 text-xs text-muted">
                    lane: {toText(item?.role) || "—"} · node_id: {toText(item?.explicitNodeId) || "—"} · top confidence: {Number(item?.topConfidence || 0).toFixed(2)}
                  </div>
                  <div className="space-y-1.5">
                    {asArray(item?.candidates).map((candidate) => (
                      <div
                        key={`${stepId}_${toText(candidate?.id)}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel2 px-2 py-1.5 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-fg">
                            {toText(candidate?.title)} {toText(candidate?.lane) ? `· ${toText(candidate?.lane)}` : ""}
                          </div>
                          <div className="truncate text-muted font-mono">{toText(candidate?.id)}</div>
                        </div>
                        <div className="text-muted">{Number(candidate?.confidence || 0).toFixed(2)}</div>
                        <button
                          type="button"
                          className="secondaryBtn h-7 px-2 text-[11px]"
                          onClick={() => onBindOne?.(stepId, toText(candidate?.id))}
                          data-testid="binding-assistant-bind"
                          data-step-id={stepId}
                          data-node-id={toText(candidate?.id)}
                        >
                          Привязать
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
