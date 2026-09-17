// opsProposedModel — view-модель панели «предложенные изменения»
// (contour feature/async-save-pipeline-step2, UI.md §5): проигравшие LWW-ops
// из proposed store. Панель скрыта при пустом списке; «Применить» возвращает
// op в буфер новым opId (обычный flush), «Отклонить» удаляет запись.

function toText(value) {
  return String(value || "").trim();
}

function formatOpType(opTypeRaw = "") {
  const raw = toText(opTypeRaw);
  if (!raw) return "правка";
  // element.updateProperties → «element.updateProperties» — технический, но
  // честный ярлык; короткие алиасы не выдумываем (канон — op-vocabulary).
  return raw;
}

/**
 * @param {Array} records — proposed-записи из opsJournal.listProposed
 * @returns {{visible: boolean, count: number, items: Array}}
 */
export function buildOpsProposedView(recordsRaw = []) {
  const records = Array.isArray(recordsRaw) ? recordsRaw : [];
  const items = records
    .filter((record) => record && typeof record === "object" && toText(record.proposedId))
    .map((record) => {
      const elementId = toText(record.elementId);
      const opType = formatOpType(record.opType);
      return {
        proposedId: toText(record.proposedId),
        elementId,
        opType,
        title: elementId ? `${elementId} · ${opType}` : opType,
        createdAt: Number(record.createdAt) || 0,
        conflictVersion: Number(record.conflictVersion) || 0,
      };
    })
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  return {
    visible: items.length > 0,
    count: items.length,
    items,
  };
}
