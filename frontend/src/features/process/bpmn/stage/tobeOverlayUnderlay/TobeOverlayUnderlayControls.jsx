import { t } from "../../../../../shared/i18n/index.js";
import GhostVisibilityControl from "./GhostVisibilityControl.jsx";
import {
  setTobeOverlayUnderlayVisible,
} from "./tobeOverlayUnderlayStore.js";
import {
  useTobeOverlayUnderlayActive,
  useTobeOverlayUnderlayAvailable,
  useTobeOverlayUnderlayVisible,
} from "./useTobeOverlayUnderlay.js";
import {
  useTobeOverlayProvenanceStatus,
  useTobeProvenanceEmptyHintVisible,
} from "../tobeOverlayProvenance/useTobeOverlayProvenance.js";
import { dismissProvenanceEmptyHint } from "../tobeOverlayProvenance/tobeProvenanceEmptyState.js";

// Контрол underlay-режима TO BE overlay (реальная AS IS-подложка).
// Живёт в ProcessStageHeader (НЕ поверх канваса — user rejection).
// Рендерится ТОЛЬКО когда текущая сессия — to_be с непустым
// derived_from_session_id (гейт — проп underlayAsisSid из ProcessStageHeader;
// флаг — на уровне хидера, зеркально mock-контролам). Пустое состояние
// (as_is / без связи) — компонент не рендерится вовсе, без ошибок (UI.md).
// T11: при status provenance === "empty" первая попытка selection показывает
// одноразовую подсказку под группой контролов (объясняет ПОЧЕМУ связей нет).
export default function TobeOverlayUnderlayControls({ underlayAsisSid = null }) {
  const active = useTobeOverlayUnderlayActive();
  const visible = useTobeOverlayUnderlayVisible();
  const available = useTobeOverlayUnderlayAvailable();
  const provenanceStatus = useTobeOverlayProvenanceStatus();
  const emptyHintVisible = useTobeProvenanceEmptyHintVisible(provenanceStatus);

  if (!underlayAsisSid) return null;

  if (!available) {
    return (
      <button
        type="button"
        className="secondaryBtn h-8 px-2 text-xs"
        disabled
        title="Связанная AS IS-сессия недоступна"
        data-testid="tobe-underlay-unavailable"
      >
        {t("tobeUnderlay.unavailable")}
      </button>
    );
  }

  if (!active) return null;

  return (
    <div className="relative flex items-center gap-1">
      <button
        type="button"
        className="secondaryBtn h-8 px-2 text-xs"
        onClick={() => setTobeOverlayUnderlayVisible(!visible)}
        title="Показать/скрыть AS IS-подложку (реальная схема связанной сессии)"
        data-testid="tobe-underlay-toggle"
      >
        {t("tobeUnderlay.toggle")}
        {visible ? "" : ` ${t("tobeUnderlay.toggleHidden")}`}
      </button>
      <GhostVisibilityControl />
      {emptyHintVisible ? (
        <div className="tobeProvEmptyHint" data-testid="tobe-prov-empty-hint" role="status">
          <span className="tobeProvEmptyHint-text">{t("tobeUnderlay.provenance.empty")}</span>
          <button
            type="button"
            className="tobeProvEmptyHint-dismiss"
            data-testid="tobe-prov-empty-dismiss"
            onClick={() => dismissProvenanceEmptyHint()}
          >
            {t("tobeUnderlay.provenance.dismiss")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
