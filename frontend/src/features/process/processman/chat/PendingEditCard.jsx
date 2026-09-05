// AGENT-3 — панель pending edits: структурированный diff (элемент, свойство,
// было → стало) с кнопками «Применить»/«Отклонить» и таймером подтверждения.
// View-модель — chat/editDiffFormat.js; «было» резолвится из загруженной
// bpmn-модели (D1-A). Неподдержанные бэкендом операции исключаются из
// «Применить» с явным пояснением — тихих частичных применений нет.
import { useEffect, useMemo, useState } from "react";
import { ru } from "../../../../shared/i18n/ru";
import { AGENT_STATUS } from "./processmanChatStore";
import { buildNodeNameResolver, formatEditPlan } from "./editDiffFormat";

const t = ru.processman;

const OP_LABEL_KEYS = {
  update: "editCardOpUpdate",
  add_node: "editCardOpAddNode",
  delete_node: "editCardOpDeleteNode",
  add_edge: "editCardOpAddEdge",
  delete_edge: "editCardOpDeleteEdge",
};

const FIELD_LABEL_KEYS = {
  title: "editCardFieldTitle",
  name: "editCardFieldName",
  operation_code: "editCardFieldOperation_code",
};

function fieldLabel(field) {
  const label = t[FIELD_LABEL_KEYS[String(field || "")]];
  return label || String(field || "—");
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Дедлайн подтверждения: момент получения confirm_required + timeout_sec. */
function resolveDeadline(edit) {
  const attachedAt = Number(edit?.attachedAt || 0);
  const timeoutSec = Number(edit?.timeoutSec || 0);
  if (!attachedAt || !timeoutSec) return 0;
  return attachedAt + timeoutSec * 1000;
}

function useCountdown(deadline, active) {
  const compute = () => (deadline > 0 ? deadline - Date.now() : 0);
  const [remaining, setRemaining] = useState(compute);
  useEffect(() => {
    setRemaining(compute());
    if (!active || deadline <= 0) return undefined;
    const timer = setInterval(() => setRemaining(compute()), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, active]);
  return remaining;
}

export default function PendingEditCard({ edit, nodes, onConfirm, onReject }) {
  const isPending = edit.status === AGENT_STATUS.EDIT_PENDING;
  const isApplied = edit.status === AGENT_STATUS.EDIT_APPLIED;
  const isRejected = edit.status === AGENT_STATUS.EDIT_REJECTED;
  const isExpired = edit.status === AGENT_STATUS.EDIT_EXPIRED;
  const isConflict = edit.status === AGENT_STATUS.EDIT_CONFLICT;
  const isError = edit.status === AGENT_STATUS.ERROR;

  const resolveNodeName = useMemo(() => buildNodeNameResolver(nodes), [nodes]);
  const vm = useMemo(
    () => formatEditPlan({ editPlan: edit.editPlan, diff: edit.diff, resolveNodeName }),
    [edit.editPlan, edit.diff, resolveNodeName],
  );

  const deadline = resolveDeadline(edit);
  const remaining = useCountdown(deadline, isPending && !isExpired);
  const ttlExpired = isPending && deadline > 0 && remaining <= 0;
  // apply доступен только пока ждём решения, TTL не истёк и бэкенд применит
  // всю пачку целиком (для BPMN — только rename; иначе кнопки нет, есть баннер).
  const canApply = isPending && !ttlExpired && vm.applySupported;

  const conflictDetails = isConflict && edit.result?.details && typeof edit.result.details === "object"
    ? edit.result.details
    : null;
  const conflictText = conflictDetails
    ? String(t.editCardConflictVersions)
      .replace("{base}", String(conflictDetails.pending_base_version ?? "—"))
      .replace("{current}", String(conflictDetails.server_current_version ?? "—"))
    : t.editCardConflict;

  const statusText = ttlExpired
    ? t.editCardExpired
    : isApplied
      ? t.editCardApplied
      : isRejected
        ? t.editCardRejected
        : isExpired
          ? t.editCardExpired
          : isConflict
            ? conflictText
            : isError
              ? edit.errorText || t.errorTitle
              : t.editCardPending;

  const showActions = canApply || (isPending && !ttlExpired && !vm.applySupported);

  return (
    <div className="pm-processman-edit-card" data-testid="processman-edit-card">
      <div className="pm-processman-edit-card__title">{t.editCardTitle}</div>
      {vm.note ? (
        <div className="pm-processman-edit-card__note" data-testid="processman-edit-note">
          <span className="pm-processman-edit-card__note-label">{t.editCardNoteTitle}:</span> {vm.note}
        </div>
      ) : null}
      <div className="pm-processman-edit-card__diff" data-testid="processman-edit-diff">
        <div className="pm-processman-edit-card__diff-title">{t.editCardDiffTitle}</div>
        {vm.items.length === 0 ? (
          <div className="pm-processman-edit-card__diff-empty">—</div>
        ) : (
          <div className="pm-processman-edit-card__ops" role="table" data-testid="processman-edit-ops">
            <div className="pm-processman-edit-card__ops-head" role="row">
              <span role="columnheader">{t.editCardColElement}</span>
              <span role="columnheader">{t.editCardColProperty}</span>
              <span role="columnheader">{t.editCardColWas}</span>
              <span role="columnheader">{t.editCardColWill}</span>
            </div>
            {vm.items.map((item) => {
              const opLabel = t[OP_LABEL_KEYS[item.op]] || t.editCardOpUnknown;
              const elementName = item.op === "add_edge" || item.op === "delete_edge"
                ? `${item.fromName || item.fromId} → ${item.toName || item.toId}`
                : (item.nodeName || item.nodeId || "—");
              const valueFrom = item.oldValue ?? "—";
              const valueTo = item.newValue ?? "—";
              return (
                <div
                  key={item.key}
                  role="row"
                  className={`pm-processman-edit-card__op-row pm-processman-edit-card__op-row--${item.op}${item.supported ? "" : " pm-processman-edit-card__op-row--unsupported"}`}
                  data-testid="processman-edit-op-row"
                >
                  <span role="cell" className="pm-processman-edit-card__op-element" title={item.nodeId || item.fromId || ""}>
                    <span className="pm-processman-edit-card__op-kind">{opLabel}</span>
                    {elementName}
                  </span>
                  <span role="cell" className="pm-processman-edit-card__op-field">
                    {item.op === "update" ? fieldLabel(item.field) : "—"}
                  </span>
                  <span role="cell" className="pm-processman-edit-card__op-old">{valueFrom}</span>
                  <span role="cell" className="pm-processman-edit-card__op-new">{valueTo}</span>
                  {item.supported ? null : (
                    <span role="cell" className="pm-processman-edit-card__op-badge" data-testid="processman-edit-op-badge">
                      {t.editCardUnsupportedBadge}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {isPending && vm.hasUnsupported ? (
        <div className="pm-processman-edit-card__unsupported" data-testid="processman-edit-unsupported" role="note">
          {t.editCardUnsupportedBanner}
        </div>
      ) : null}
      {isPending && !ttlExpired && deadline > 0 ? (
        <div className="pm-processman-edit-card__timer" data-testid="processman-edit-timer">
          {t.editCardTimeLeft}: {formatRemaining(remaining)}
        </div>
      ) : null}
      <div className="pm-processman-edit-card__status" data-testid="processman-edit-status">
        {statusText}
      </div>
      {showActions ? (
        <div className="pm-processman-edit-card__actions" data-testid="processman-edit-actions">
          {canApply ? (
            <button
              type="button"
              className="pm-processman-edit-card__confirm"
              data-testid="processman-edit-confirm"
              onClick={(e) => { e.stopPropagation(); onConfirm?.(); }}
            >
              {t.editCardConfirm}
            </button>
          ) : null}
          <button
            type="button"
            className="pm-processman-edit-card__reject"
            data-testid="processman-edit-reject"
            onClick={(e) => { e.stopPropagation(); onReject?.(); }}
          >
            {t.editCardReject}
          </button>
        </div>
      ) : null}
    </div>
  );
}
