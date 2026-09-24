import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// T4: lazy fetch-адаптер подложки в BpmnStage — source-guard по прецеденту
// BpmnStage.align-reset.test.mjs (монолитный компонент не монтируется в unit;
// runtime-доказательства — в e2e tobe-overlay-underlay.spec.mjs: fetch-count,
// lazy-гейт, whitelist URL).
const source = fs.readFileSync(new URL("./BpmnStage.jsx", import.meta.url), "utf8");

const blockMatch = source.match(
  /\/\/ TO BE overlay underlay \(feature\/tobe-overlay-underlay-v1\)[\s\S]*?const v2PropertyPreviewMapRef/,
);
assert.ok(blockMatch, "underlay-блок адаптера найден в BpmnStage");
// Комментарии вырезаем: guard проверяет код, а не собственные пояснения.
const block = blockMatch[0].split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");

test("адаптер под фичатоглом tobe_overlay_underlay и store-гейтом", () => {
  assert.match(source, /useFeatureFlag\("tobe_overlay_underlay"\)/);
  assert.match(block, /setTobeOverlayUnderlayActive\(enabled\)/);
});

test("lazy-гейт: fetch не стартует до diagramReady; планирование — requestIdleCallback", () => {
  assert.match(block, /if \(!diagramReady\) return undefined;/);
  assert.match(block, /window\.requestIdleCallback\(runFetch, \{ timeout: 2000 \}\)/);
});

test("fetch-контракт: raw=true, includeOverlay=false, cacheBust=true (аудит Q2.3)", () => {
  assert.match(block, /apiGetBpmnXml\(sidKey, \{ raw: true, includeOverlay: false, cacheBust: true \}\)/);
});

test("кэш XML per underlayAsisSid — ровно один fetch на источник", () => {
  assert.match(block, /underlayXmlCacheRef = useRef\(new Map\(\)\)/);
  assert.match(block, /underlayXmlCacheRef\.current\.get\(sidKey\)/);
  assert.match(block, /underlayXmlCacheRef\.current\.set\(sidKey, xml\)/);
});

test("mid-flight: смена sid — destroy прежнего ghost ДО нового fetch", () => {
  assert.match(block, /if \(underlayControllerSidRef\.current !== sidKey\)/);
  assert.match(block, /underlayControllerRef\.current = null;\n\s+underlayControllerSidRef\.current = null;/);
});

test("mount передаёт { container, xml, editor } в контроллер (инъекция editor)", () => {
  assert.match(block, /createTobeOverlayUnderlayController\(\)/);
  assert.match(block, /mount\(\{ container: host, xml, editor \}\)/);
});

test("read-only границы адаптера: ни одной записи на сессионные инстансы", () => {
  assert.doesNotMatch(block, /viewerRef\.current\??\.(importXML|on|off|saveXML|get\("commandStack"\))/);
  assert.doesNotMatch(block, /modelerRef\.current\??\.(importXML|on|off|saveXML|get\("commandStack"\))/);
  assert.doesNotMatch(block, /commandStack/);
  assert.doesNotMatch(block, /runtime\.(load|onChange)/);
  assert.doesNotMatch(block, /saveCoordinator/);
  assert.doesNotMatch(block, /gatewayLane/);
});

test("404/ошибка связанной сессии → store unavailable (disabled-кнопка, UI.md)", () => {
  assert.match(block, /setTobeOverlayUnderlayAvailable\(false\)/);
  assert.match(block, /setTobeOverlayUnderlayAvailable\(true\)/);
});
