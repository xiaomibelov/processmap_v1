import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./BpmnStage.jsx", import.meta.url), "utf8");

// loadFromBackend с forceRemote (resetBackend после overwrite/refresh/clear)
// обязан обходить App-level bpmnXmlCache: иначе reload после разрешения
// конфликта подменяет свежую серверную версию stale-cached XML и канвас
// откатывается к пре-правочному состоянию (правки «исчезают» с экрана,
// хотя durable-запись на сервере корректна).
test("BpmnStage forceRemote load bypasses App-level bpmnXmlCache", () => {
  assert.equal(
    source.includes(
      'const cachedXml = options?.forceRemote === true ? "" : bpmnXmlCacheRef?.current?.get(s);',
    ),
    true,
  );
});
