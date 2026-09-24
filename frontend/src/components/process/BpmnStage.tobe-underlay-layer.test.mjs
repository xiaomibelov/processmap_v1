import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// T6: слой .bpmnLayer--underlayAsis + read-only source-guard (TESTS.md §5).
// Подложка — ПЕРВЫМ в DOM внутри .bpmnStack; display-логика сессионных слоёв
// неизменна (инвариант: session layers НЕ скрываются, в отличие от mock).
const source = fs.readFileSync(new URL("./BpmnStage.jsx", import.meta.url), "utf8");

test("underlay-слой: гейт flag && active && underlayAsisSid, класс и testid", () => {
  assert.match(source, /tobeOverlayUnderlayFlag && underlayActive && underlayAsisSid \? \(/);
  assert.match(source, /className="bpmnLayer bpmnLayer--underlayAsis"/);
  assert.match(source, /data-testid="bpmn-layer-underlay-asis"/);
  assert.match(source, /<div className="bpmnCanvas" ref=\{underlayHostRef\}/);
});

test("underlay-слой ПЕРВЫМ в .bpmnStack (до session-слоёв — editor рисуется поверх)", () => {
  const stackIdx = source.indexOf('"bpmnStack"');
  const underlayIdx = source.indexOf('className="bpmnLayer bpmnLayer--underlayAsis"');
  const diagramIdx = source.indexOf('"bpmnLayer bpmnLayer--diagram "');
  assert.ok(stackIdx > -1 && underlayIdx > -1 && diagramIdx > -1);
  assert.ok(underlayIdx > stackIdx, "underlay-слой внутри .bpmnStack");
  assert.ok(underlayIdx < diagramIdx, "underlay-слой раньше .bpmnLayer--diagram в DOM");
});

test("ИНВАРИАНТ: display-логика сессионных слоёв не тронута (ключится только на tobeMockActive)", () => {
  assert.match(
    source,
    /display: tobeMockActive \? "none" : \(view === "viewer" \? "block" : "none"\)/,
  );
  assert.match(
    source,
    /display: tobeMockActive \? "none" : \(\(view === "editor" \|\| view === "diagram"\) \? "block" : "none"\)/,
  );
  // Подложка не добавляет display-условий на session layers.
  assert.doesNotMatch(
    source,
    /display:[^}]*underlay/i,
  );
});

test("read-only source-guard underlay-блока: разрешено только eventBus/viewbox/apiGetBpmnXml", () => {
  const blockMatch = source.match(
    /\/\/ TO BE overlay underlay \(feature\/tobe-overlay-underlay-v1\)[\s\S]*?const v2PropertyPreviewMapRef/,
  );
  assert.ok(blockMatch, "underlay-блок найден");
  // Комментарии вырезаем: guard проверяет код, а не собственные пояснения.
  const block = blockMatch[0].split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");

  // ЗАПРЕЩЕНО: записи на сессионные инстансы и save-контур.
  assert.doesNotMatch(block, /commandStack/);
  assert.doesNotMatch(block, /\bonChange\b/);
  assert.doesNotMatch(block, /viewerRef\.current\??\.(importXML|on|off|saveXML)/);
  assert.doesNotMatch(block, /modelerRef\.current\??\.(importXML|on|off|saveXML)/);
  assert.doesNotMatch(block, /saveCoordinator/);
  assert.doesNotMatch(block, /gatewayLane/);
  assert.doesNotMatch(block, /createBpmnRuntime/);
  assert.doesNotMatch(block, /apiPutBpmnXml|apiDeleteBpmnXml/);
  assert.doesNotMatch(block, /\.get\("modeling"\)|\.get\("selection"\)/);

  // РАЗРЕШЕНО и присутствует: чтение XML подложки + mount с инъекцией editor.
  assert.match(block, /apiGetBpmnXml\(sidKey, \{ raw: true, includeOverlay: false, cacheBust: true \}\)/);
  assert.match(block, /mount\(\{ container: host, xml, editor \}\)/);
});

test("underlay CSS подключён в BpmnStage (ghost-стилистика префикса underlay*)", () => {
  assert.match(source, /import "\.\.\/\.\.\/features\/process\/bpmn\/stage\/tobeOverlayUnderlay\/tobeOverlayUnderlay\.css"/);
});
