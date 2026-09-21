// Контур fix/canvas-nan-di-stuck-drag, P0-4: snapshot/enrichment контекста
// команды не должны рвать каскад commandStack.changed → notifyChange →
// mapper/outbox (lead L1 аудита canvas-drag-stuck-after-1008). При ошибке —
// диагностика в saveDiagnosticsTrail, каскад продолжается со снапшотом как
// есть (пустой/частичный снапшот → маппер fail-closed → needsFullSave).

export function captureCommandContextSafely({
  command,
  contextSource,
  snapshot,
  enrich,
  record,
}) {
  let result = null;
  try {
    result = snapshot(contextSource);
    enrich(command, contextSource, result);
  } catch (error) {
    try {
      record?.("command_context_enrichment_failed", {
        command,
        msg: String(error?.message || error),
      });
    } catch {
      // диагностика не должна ломать каскад
    }
  }
  return result;
}
