// RED-тесты контура fix/canvas-250-editing-performance (этап 1, TDD red).
//
// Контракт производительности редактирования на схеме 250+ элементов:
//   (a) правка одного элемента НЕ вызывает полный diff всех элементов;
//   (b) мемоизация селекторов/рендера — правка узла A не инвалидирует B..Z;
//   (c) dirty-флаг синхронно виден сразу после createShape (без await микротасков);
//   (d) создание версии НЕ блокируется незавершённым direct-editing.
//
// Импортируемый контрактный модуль ./modelDiff.js намеренно ОТСУТСТВУЕТ:
// он появится в этапе 2 (green). Тесты (a), (b), (d) падают на этапе 1 по
// import-ошибке — это и есть RED. Тест (c) написан против существующего
// store и, скорее всего, зелёный — это допустимо, он фиксирует регрессию.
//
// Запуск (host без node):
//   docker run --rm -v <worktree>/frontend:/app -w /app node:20 \
//     node --test src/features/process/bpmn/coordinator/model-diff.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  createModelDiffTracker,
  createElementRenderMemo,
  resolveRevisionCreateAvailability,
} from "./modelDiff.js";
import createBpmnStore from "../store/createBpmnStore.js";

// (a) Правка одного элемента не вызывает полный diff всех элементов.
test("single element edit does not trigger a full diff of all elements", () => {
  const fullDiffCalls = [];
  const tracker = createModelDiffTracker({
    onFullDiff: (scope) => fullDiffCalls.push(scope),
  });

  tracker.notifyElementEdited("Task_17");
  tracker.flush();

  assert.equal(
    fullDiffCalls.length,
    0,
    "полный diff всех элементов после правки одного запрещён",
  );
  assert.deepEqual(
    tracker.stats().elementsRecomputed,
    ["Task_17"],
    "пересчитан должен быть только изменённый элемент",
  );
  assert.equal(tracker.stats().fullDiffCalls, 0);
});

// (b) Мемоизация селекторов: правка узла A не инвалидирует узлы B..Z.
test("memoized selectors: editing node A does not invalidate nodes B..Z", () => {
  const memo = createElementRenderMemo();

  memo.invalidate("Node_A");
  assert.deepEqual(memo.takeInvalidated(), ["Node_A"]);
  assert.deepEqual(
    memo.takeInvalidated(),
    [],
    "без новых правок повторный запрос не должен ничего инвалидировать",
  );

  memo.invalidate("Node_A");
  memo.invalidate("Node_B");
  const invalidated = memo.takeInvalidated();
  assert.deepEqual([...invalidated].sort(), ["Node_A", "Node_B"]);
  for (const untouched of ["Node_C", "Node_D", "Node_M", "Node_Z"]) {
    assert.ok(
      !invalidated.includes(untouched),
      `узел ${untouched} не должен инвалидироваться при правке Node_A`,
    );
  }
});

// (c) Dirty-флаг синхронно после createShape.
// Против существующего store — ожидается GREEN (фиксирует регрессию).
test("dirty flag is synchronously true right after a shape mutation", () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"x\"/>",
    dirty: false,
  });
  assert.equal(store.getState().dirty, false);

  // Синхронно, без await/Promise — ровно как createShape маркирует модель.
  store.markDirty("shape.create");

  assert.equal(
    store.getState().dirty,
    true,
    "dirty должен быть виден синхронно сразу после мутации",
  );
});

// (d) Создание версии не блокируется незавершённым direct-editing:
// контракт — label автозавершается и версия создаётся (allowed=true).
test("create revision is not blocked by an unfinished direct-editing session", () => {
  const resolution = resolveRevisionCreateAvailability({
    directEditingActive: true,
    hasUnsavedChanges: true,
  });

  assert.equal(
    resolution.allowed,
    true,
    "при наличии несохранённых изменений direct-editing не должен блокировать создание версии",
  );
  assert.ok(
    typeof resolution.reason === "string" && resolution.reason.length > 0,
    "resolution должна объяснять, как обработан активный direct-editing",
  );

  // Без несохранённых изменений версия не нужна — но и это не «блокировка».
  const idle = resolveRevisionCreateAvailability({
    directEditingActive: true,
    hasUnsavedChanges: false,
  });
  assert.equal(typeof idle.allowed, "boolean");
});
