// Пресеты видимости ghost-подложки AS IS (режим TO BE underlay).
// Значения verbatim из UI.md D2: faint — бит-в-бит текущий стиль
// tobeOverlayUnderlay.css:10-13; medium — дефолт; strong — максимальная
// читаемость подложки. Потребители: store (T2), контрол в хедере и
// CSS-модификаторы контроллера (T3/T4).

export const GHOST_VISIBILITY_PRESETS = Object.freeze({
  faint: Object.freeze({
    opacity: 0.30,
    filter: "grayscale(0.7) saturate(0.4)",
    cssClass: "bpmnLayer--underlayAsis--faint",
  }),
  medium: Object.freeze({
    opacity: 0.55,
    filter: "grayscale(0.35) saturate(0.75)",
    cssClass: "bpmnLayer--underlayAsis--medium",
  }),
  strong: Object.freeze({
    opacity: 0.85,
    filter: "none",
    cssClass: "bpmnLayer--underlayAsis--strong",
  }),
});

// Дефолтный пресет видимости подложки.
export const DEFAULT_GHOST_VISIBILITY = "medium";

// Приводит произвольное значение к валидному пресету:
// unknown/null/undefined → DEFAULT_GHOST_VISIBILITY ("medium").
export function normalizeGhostVisibility(value) {
  return Object.prototype.hasOwnProperty.call(GHOST_VISIBILITY_PRESETS, value)
    ? value
    : DEFAULT_GHOST_VISIBILITY;
}
