import React from "react";

export function toText(value) {
  return String(value || "").trim();
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export function isHybridIdSelected(idRaw, activeIdRaw, selectedIds) {
  const id = toText(idRaw);
  if (!id) return false;
  if (toText(activeIdRaw) === id) return true;
  if (selectedIds?.has?.(id)) return true;
  return false;
}

export function renderTextLines(textRaw, x, y, lineHeight) {
  const lines = String(textRaw || "").split(/\r?\n/);
  return lines.map((line, idx) => (
    <tspan key={`line_${idx}`} x={x} dy={idx === 0 ? 0 : lineHeight}>
      {line || " "}
    </tspan>
  ));
}
