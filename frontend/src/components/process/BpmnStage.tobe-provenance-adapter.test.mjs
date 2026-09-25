import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// T8: lazy fetch-адаптер provenance-индекса в BpmnStage — source-guard по
// прецеденту BpmnStage.tobe-underlay-adapter.test.mjs (монолитный компонент
// не монтируется в unit; runtime-доказательства — в e2e фазы).
const source = fs.readFileSync(new URL("./BpmnStage.jsx", import.meta.url), "utf8");

const blockMatch = source.match(
  /\/\/ TO BE provenance \(feature\/tobe-overlay-visibility-provenance-v1, T8\)[\s\S]*?const v2PropertyPreviewMapRef/,
);
assert.ok(blockMatch, "provenance-блок адаптера найден в BpmnStage");
// Комментарии вырезаем: guard проверяет код, а не собственные пояснения.
const block = blockMatch[0].split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");

test("гейты адаптера: флаг подложки + active + sessionId + diagramReady", () => {
  assert.match(block, /tobeOverlayUnderlayFlag && underlayActive && sessionId && diagramReady/);
});

test("lazy-гейт: планирование через requestIdleCallback (прецедент underlay)", () => {
  assert.match(block, /window\.requestIdleCallback\(runLoad, \{ timeout: 2000 \}\)/);
});

test("fetch-контракт: raw TO BE XML + session meta (оба канала индекса)", () => {
  assert.match(block, /apiGetBpmnXml\(sid, \{ raw: true, includeOverlay: false, cacheBust: true \}\)/);
  assert.match(block, /apiGetSessionMeta\(sid\)/);
  assert.match(block, /loadProvenanceForSession\(\{/);
});

test("read-only граница: ноль мутаций модели (ни commandStack/modeling/save)", () => {
  assert.doesNotMatch(block, /commandStack/);
  assert.doesNotMatch(block, /modeling/);
  assert.doesNotMatch(block, /saveCoordinator/);
  assert.doesNotMatch(block, /runtime\.(load|onChange)/);
});

test("teardown: смена сессии — resetProvenanceSessionState (кэш + индекс)", () => {
  assert.match(block, /resetProvenanceSessionState\(\)/);
  assert.match(block, /cancelSchedule\(\)/);
});
