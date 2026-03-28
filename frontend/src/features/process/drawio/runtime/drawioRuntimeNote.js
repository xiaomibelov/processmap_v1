function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

function clampNumber(valueRaw, fallback, min, max) {
  const value = toNumber(valueRaw, fallback);
  return Math.max(min, Math.min(max, value));
}

export const DRAWIO_NOTE_DEFAULT_WIDTH = 160;
export const DRAWIO_NOTE_DEFAULT_HEIGHT = 120;
export const DRAWIO_NOTE_DEFAULT_TEXT = "Заметка";
export const DRAWIO_NOTE_DEFAULT_STYLE = Object.freeze({
  bg_color: "#fef08a",
  border_color: "#ca8a04",
  text_color: "#1f2937",
});

export function isDrawioNoteToolId(toolIdRaw) {
  return toText(toolIdRaw).toLowerCase() === "note";
}

export function isDrawioNoteRow(rowRaw) {
  return toText(asObject(rowRaw).type).toLowerCase() === "note";
}

export function normalizeDrawioNoteStyle(styleRaw = {}) {
  const style = asObject(styleRaw);
  return {
    bg_color: toText(style.bg_color) || DRAWIO_NOTE_DEFAULT_STYLE.bg_color,
    border_color: toText(style.border_color) || DRAWIO_NOTE_DEFAULT_STYLE.border_color,
    text_color: toText(style.text_color) || DRAWIO_NOTE_DEFAULT_STYLE.text_color,
  };
}

export function normalizeDrawioNoteDimensions(widthRaw, heightRaw) {
  return {
    width: Math.round(clampNumber(widthRaw, DRAWIO_NOTE_DEFAULT_WIDTH, 80, 1600)),
    height: Math.round(clampNumber(heightRaw, DRAWIO_NOTE_DEFAULT_HEIGHT, 56, 1600)),
  };
}

export function normalizeDrawioNoteRow(rowRaw = {}) {
  const row = asObject(rowRaw);
  const { width, height } = normalizeDrawioNoteDimensions(row.width, row.height);
  let text = DRAWIO_NOTE_DEFAULT_TEXT;
  if (row.text === "") {
    text = "";
  } else if (row.text != null) {
    text = toText(row.text) || DRAWIO_NOTE_DEFAULT_TEXT;
  } else if (row.label === "") {
    text = "";
  } else {
    text = toText(row.label) || DRAWIO_NOTE_DEFAULT_TEXT;
  }
  return {
    ...row,
    type: "note",
    width,
    height,
    text,
    style: normalizeDrawioNoteStyle(row.style),
  };
}

export function buildRuntimeNoteElementRow({
  elementId,
  layerIdRaw,
  zIndexRaw,
  pointRaw = {},
}) {
  const point = asObject(pointRaw);
  const { width, height } = normalizeDrawioNoteDimensions(
    DRAWIO_NOTE_DEFAULT_WIDTH,
    DRAWIO_NOTE_DEFAULT_HEIGHT,
  );
  const x = toNumber(point.x, 0);
  const y = toNumber(point.y, 0);
  return {
    id: toText(elementId),
    type: "note",
    layer_id: toText(layerIdRaw) || "DL1",
    visible: true,
    locked: false,
    deleted: false,
    opacity: 1,
    offset_x: Math.round((x - (width / 2)) * 1000) / 1000,
    offset_y: Math.round((y - (height / 2)) * 1000) / 1000,
    z_index: Math.max(0, Math.round(toNumber(zIndexRaw, 0))),
    width,
    height,
    text: DRAWIO_NOTE_DEFAULT_TEXT,
    style: normalizeDrawioNoteStyle({}),
  };
}

function estimateCharsPerLine(widthRaw, paddingRaw, fontSizeRaw) {
  const width = Math.max(80, toNumber(widthRaw, DRAWIO_NOTE_DEFAULT_WIDTH));
  const padding = Math.max(4, toNumber(paddingRaw, 12));
  const fontSize = Math.max(10, toNumber(fontSizeRaw, 14));
  const usable = Math.max(24, width - (padding * 2));
  return Math.max(4, Math.floor(usable / Math.max(5, fontSize * 0.6)));
}

export function buildDrawioNoteTextLines(textRaw, widthRaw, options = {}) {
  const padding = toNumber(asObject(options).padding, 12);
  const fontSize = toNumber(asObject(options).fontSize, 14);
  const maxChars = estimateCharsPerLine(widthRaw, padding, fontSize);
  const paragraphs = String(textRaw ?? "").replace(/\r\n/g, "\n").split("\n");
  const lines = [];
  paragraphs.forEach((paragraphRaw) => {
    const paragraph = String(paragraphRaw || "");
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      return;
    }
    let current = "";
    words.forEach((wordRaw) => {
      const word = String(wordRaw || "");
      if (!current) {
        current = word;
        return;
      }
      const candidate = `${current} ${word}`;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
  });
  return lines.length ? lines : [""];
}

export function buildDrawioNoteFallbackText(textRaw, linesRaw = []) {
  if (textRaw != null) return String(textRaw);
  const lines = Array.isArray(linesRaw) ? linesRaw : [];
  if (!lines.length) return "";
  return lines
    .map((lineRaw) => {
      const normalized = String(lineRaw ?? "").replace(/\u00a0/g, " ");
      return normalized.trim() === "" ? "" : normalized;
    })
    .join("\n");
}

export function patchDrawioNoteRowText(rowRaw, textRaw) {
  if (!isDrawioNoteRow(rowRaw)) return rowRaw;
  const row = normalizeDrawioNoteRow(rowRaw);
  const nextText = String(textRaw ?? "");
  if (row.text === nextText) return rowRaw;
  return {
    ...row,
    text: nextText,
    label: nextText,
  };
}

export function patchDrawioNoteRowSize(rowRaw, sizeRaw = {}) {
  if (!isDrawioNoteRow(rowRaw)) return rowRaw;
  const row = normalizeDrawioNoteRow(rowRaw);
  const size = asObject(sizeRaw);
  const { width, height } = normalizeDrawioNoteDimensions(
    size.width != null ? size.width : row.width,
    size.height != null ? size.height : row.height,
  );
  if (width === row.width && height === row.height) return rowRaw;
  return {
    ...row,
    width,
    height,
  };
}

export function patchDrawioNoteRowStyle(rowRaw, styleRaw = {}) {
  if (!isDrawioNoteRow(rowRaw)) return rowRaw;
  const row = normalizeDrawioNoteRow(rowRaw);
  const nextStyle = normalizeDrawioNoteStyle({
    ...row.style,
    ...asObject(styleRaw),
  });
  if (
    nextStyle.bg_color === row.style.bg_color
    && nextStyle.border_color === row.style.border_color
    && nextStyle.text_color === row.style.text_color
  ) {
    return rowRaw;
  }
  return {
    ...row,
    style: nextStyle,
  };
}

export function resolveDrawioNotePresetStyle(rowRaw, presetRaw = {}) {
  const row = normalizeDrawioNoteRow(rowRaw);
  const presetSvg = asObject(asObject(presetRaw).svg);
  return normalizeDrawioNoteStyle({
    bg_color: toText(presetSvg.fill) || row.style.bg_color,
    border_color: toText(presetSvg.stroke) || row.style.border_color,
    text_color: row.style.text_color,
  });
}
