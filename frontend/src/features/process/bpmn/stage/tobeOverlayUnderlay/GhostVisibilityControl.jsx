import { GHOST_VISIBILITY_PRESETS } from "./ghostVisibilityPresets.js";
import { setGhostVisibility } from "./tobeOverlayUnderlayStore.js";
import { useTobeOverlayUnderlayGhostVisibility } from "./useTobeOverlayUnderlay.js";
import { t } from "../../../../../shared/i18n/index.js";

// Сегментed-контрол пресета видимости ghost-подложки AS IS (faint/medium/
// strong). Паттерн radiogroup: выбранный сегмент — primary-стиль, остальные —
// ghost/secondary (дизайн-система хедера, по образцу соседних контролов).
// Сам себя по гейтам НЕ рендерит — гейт остаётся на месте интеграции
// (TobeOverlayUnderlayControls). Порядок сегментов фиксирован (UI.md).
const PRESET_ORDER = ["faint", "medium", "strong"];

export default function GhostVisibilityControl() {
  // Хук лениво гидрирует persisted-пресет из localStorage перед подпиской.
  const preset = useTobeOverlayUnderlayGhostVisibility();

  return (
    <div
      role="radiogroup"
      aria-label={t("tobeUnderlay.visibility.label")}
      className="flex items-center gap-1"
    >
      {PRESET_ORDER.map((name) => {
        const selected = preset === name;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected ? "true" : "false"}
            className={selected ? "primaryBtn h-8 px-2 text-xs" : "secondaryBtn h-8 px-2 text-xs"}
            title={t(`tobeUnderlay.visibility.${name}`)}
            data-testid={`tobe-ghost-preset-${name}`}
            onClick={() => setGhostVisibility(name)}
          >
            {t(`tobeUnderlay.visibility.${name}`)}
          </button>
        );
      })}
    </div>
  );
}
