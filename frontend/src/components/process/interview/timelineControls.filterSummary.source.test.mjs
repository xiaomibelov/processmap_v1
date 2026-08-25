// Source-тест: filterSummary в TimelineControls должен быть определён до использования.
// Запуск: node --test src/components/process/interview/timelineControls.filterSummary.source.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./TimelineControls.jsx", import.meta.url)), "utf8");

test("TimelineControls: filterSummary определён в компоненте", () => {
  const useIdx = src.indexOf("title={filterSummary}");
  assert.ok(useIdx > -1, "использование filterSummary не найдено");

  const declarationRe = /(?:const|let|var|useMemo)\s+filterSummary\b/;
  assert.ok(
    declarationRe.test(src),
    "filterSummary должен быть объявлен (const/let/var/useMemo) до использования",
  );

  const declMatch = src.match(/(?:const|let|var|useMemo)\s+filterSummary\b/);
  assert.ok(declMatch, "declaration match отсутствует");
  assert.ok(
    declMatch.index < useIdx,
    "объявление filterSummary должно идти до его использования в JSX",
  );
});

test("TimelineControls: filterSummary не остаётся голым идентификатором вне JSX", () => {
  const bareMatches = src.match(/\bfilterSummary\b/g) || [];
  assert.ok(bareMatches.length >= 2, "filterSummary должен использоваться минимум в объявлении и JSX");
});
