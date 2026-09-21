// Контур fix/canvas-nan-di-stuck-drag, P0-3: self-heal NaN-DI при импорте.
// Нефинитные DI-координаты в durable XML (RC1 аудита
// canvas-drag-stuck-after-1008) санацируются ДО importXML — иначе re-layout
// уходит в non-finite, render-listener бросает и drag залипает (RC2).
// Возвращает healed XML + id связей, которым был пересобран маршрут, —
// вызывающий (load) делает для них best-effort modeling.layoutConnection
// после импорта.

import { findNonFiniteDi, sanitizeDiFiniteness } from "../di/diFiniteness.js";

export function healImportXml(xml, { record, trace } = {}) {
  if (!xml || typeof xml !== "string") return { xml, healedEdges: [] };
  const nonFinite = findNonFiniteDi(xml);
  if (nonFinite.length === 0) return { xml, healedEdges: [] };

  const { xml: healedXml, repaired } = sanitizeDiFiniteness(xml);
  const healedEdges = [
    ...new Set(
      repaired
        .filter((entry) => entry && (entry.kind === "edge-relayout" || entry.kind === "waypoint-drop"))
        .map((entry) => entry.edgeId)
        .filter(Boolean),
    ),
  ];
  try {
    record?.("di_import_healed", {
      count: nonFinite.length,
      healed_edges: healedEdges.length,
      repaired: repaired.length,
    });
  } catch {
    // диагностика не должна ломать импорт
  }
  try {
    trace?.("load.di_heal", {
      count: nonFinite.length,
      healed_edges: healedEdges.join(",") || "",
      repaired: repaired.length,
    });
  } catch {
    // no-op
  }
  return { xml: healedXml, healedEdges };
}
