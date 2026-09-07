// Canonical FNV-1a (32-bit, hex) for BPMN XML strings.
//
// Единственная реализация хэша XML в save hot-path ProcessMap. Раньше
// существовало 6+ копий этой функции (store/persistence/coordinator/
// camunda/snapshots/stage); contour canvas-save-hot-path-v1 (Коммит 3)
// свёл горячие копии на этот листовой модуль, чтобы:
//   - мемо export-dialect (messageFlowDialect.js) ключовался тем же хэшем,
//     что и store/persistence (одинаковые значения на одной строке);
//   - исключить расхождение копий при будущих правках.
//
// Листовой модуль (без импортов) — безопасен для импорта из любого места
// дерева, включая camunda/ и bpmn/*, без риска циклических зависимостей.
//
// Поведение (characterization-вектор):
//   createBpmnStore.fnv1a-vector.characterization.test.mjs.

export function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
