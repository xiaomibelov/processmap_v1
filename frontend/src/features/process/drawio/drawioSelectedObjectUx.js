function toText(value) {
  return String(value || "").trim();
}

function bool(value) {
  return value === true;
}

function buildCapability(id, label) {
  return {
    id: toText(id),
    label: toText(label),
  };
}

export function resolveSelectedObjectUxModel(options = {}) {
  const kind = toText(options.selectedKind).toLowerCase();
  const selectedEntityId = toText(options.selectedEntityId);
  const selectedLayerId = toText(options.selectedLayerId);
  const drawioResizeSurface = toText(options.selectedDrawioResizeSurface);
  const drawioStyleSurface = toText(options.selectedDrawioStyleSurface);
  const hasText = bool(options.selectedDrawioTextEditable) && !!options.selectedDrawioTextState;
  const hasStyle = Number(options.selectedDrawioStylePresetCount || 0) > 0;
  const hasResize = !!drawioResizeSurface;
  const anchorStatus = toText(options.anchorStatus).toLowerCase();
  const showAnchorSection = kind === "drawio" && !!selectedEntityId
    && (options.anchorEligible === true || anchorStatus === "anchored" || anchorStatus === "orphaned" || anchorStatus === "invalid");

  const base = {
    kind,
    hasSelection: !!selectedEntityId,
    typeKey: "none",
    typeLabel: "Ничего не выбрано",
    summary: "Выберите объект на canvas, чтобы увидеть доступные действия.",
    capabilities: [],
    showTextSection: false,
    showTextWidthSection: false,
    showStyleSection: false,
    showResizeSection: false,
    showAnchorSection,
    showBindingSection: kind === "hybrid",
    styleSectionLabel: "Быстрый стиль",
    resizeSectionLabel: "Размер",
    advancedHint: "",
    advancedBoundaryLabel: "",
  };

  if (!base.hasSelection) return base;

  if (kind === "drawio") {
    if (hasText) {
      return {
        ...base,
        typeKey: "drawio_text",
        typeLabel: "Текстовый блок",
        summary: selectedLayerId
          ? `Runtime text в слое ${selectedLayerId}. Основные правки делаются прямо здесь.`
          : "Runtime text. Основные правки делаются прямо здесь.",
        capabilities: [
          buildCapability("text", "Текст"),
          buildCapability("text_width", "Ширина текста"),
          ...(hasStyle ? [buildCapability("style", drawioStyleSurface === "text" ? "Быстрый цвет" : "Быстрый стиль")] : []),
          buildCapability("anchor", "Anchor"),
          buildCapability("visibility", "Скрыть"),
          buildCapability("delete", "Удалить"),
        ],
        showTextSection: true,
        showTextWidthSection: true,
        showStyleSection: hasStyle,
        showResizeSection: false,
        styleSectionLabel: drawioStyleSurface === "text" ? "Быстрый цвет" : "Быстрый стиль",
        resizeSectionLabel: "Текстовый блок",
        advancedHint: "Сложная typography и нестандартные label modes остаются в full editor.",
        advancedBoundaryLabel: "Advanced",
      };
    }

    if (hasResize) {
      return {
        ...base,
        typeKey: "drawio_box",
        typeLabel: "Блок / контейнер",
        summary: selectedLayerId
          ? `Shape-like draw.io объект в слое ${selectedLayerId}. Размер и стиль можно менять без full editor.`
          : "Shape-like draw.io объект. Размер и стиль можно менять без full editor.",
        capabilities: [
          ...(hasStyle ? [buildCapability("style", drawioStyleSurface === "text" ? "Быстрый цвет" : "Быстрый стиль")] : []),
          buildCapability("size", "Размер блока"),
          buildCapability("anchor", "Anchor"),
          buildCapability("visibility", "Скрыть"),
          buildCapability("delete", "Удалить"),
        ],
        showTextSection: false,
        showTextWidthSection: false,
        showStyleSection: hasStyle,
        showResizeSection: true,
        styleSectionLabel: drawioStyleSurface === "text" ? "Быстрый цвет" : "Быстрый стиль",
        resizeSectionLabel: "Размер блока",
        advancedHint: "Сложная геометрия, connectors и произвольные shapes остаются в full editor.",
        advancedBoundaryLabel: "Advanced",
      };
    }

    return {
      ...base,
      typeKey: "drawio_other",
      typeLabel: "Draw.io объект",
      summary: "Этот объект виден на canvas, но базовые session-first правки для него не включены.",
      capabilities: [
        buildCapability("visibility", "Скрыть"),
        buildCapability("delete", "Удалить"),
      ],
      showTextSection: false,
      showTextWidthSection: false,
      showStyleSection: hasStyle,
      showResizeSection: false,
      styleSectionLabel: drawioStyleSurface === "text" ? "Быстрый цвет" : "Быстрый стиль",
      resizeSectionLabel: "Размер",
      advancedHint: "Для этого surface продолжайте в full editor.",
      advancedBoundaryLabel: "Advanced",
    };
  }

  if (kind === "hybrid") {
    return {
      ...base,
      typeKey: "hybrid",
      typeLabel: "Hybrid element",
      summary: "Hybrid слой редактируется локально: привязка, скрытие и фокус живут здесь.",
      capabilities: [
        buildCapability("visibility", "Скрыть"),
        buildCapability("lock", "Блокировать"),
        buildCapability("focus", "Фокус"),
      ],
      showBindingSection: true,
    };
  }

  if (kind === "legacy") {
    return {
      ...base,
      typeKey: "legacy",
      typeLabel: "Legacy marker",
      summary: "Legacy marker поддерживает только базовые действия слоя.",
      capabilities: [
        buildCapability("visibility", "Скрыть"),
        buildCapability("focus", "Фокус"),
        buildCapability("delete", "Удалить"),
      ],
      showBindingSection: false,
    };
  }

  return {
    ...base,
    typeKey: "unknown",
    typeLabel: "Unknown object",
    summary: "Тип объекта не распознан. Доступны только безопасные действия.",
    capabilities: [
      buildCapability("delete", "Удалить"),
    ],
  };
}
