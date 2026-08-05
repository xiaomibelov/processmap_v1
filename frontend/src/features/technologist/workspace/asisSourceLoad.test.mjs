// fix(overlay): TO BE из сессии со схемой — шаг 1 «Импорт AS IS» читает слой AS IS,
// а не показывает заглушку «Сессия AS IS пуста».
// Корень: Workspace читал /bpmn с дефолтами (overlay-кэш) — тот мог вернуть
// пустое тело 200 (потеря org-контекста на backend). Чтение переведено на
// raw+noOverlay, как у основного канваса (sessionLoader); ошибки HTTP больше
// не маскируются под «пустую сессию».
// Запуск: node --test src/features/technologist/workspace/asisSourceLoad.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ws = readFileSync(new URL("./Workspace.jsx", import.meta.url), "utf8");

test("AS IS читается raw + без overlay-кэша (как основной канвас)", () => {
  assert.ok(
    ws.includes('apiGetBpmnXml(asIsSource.sessionId, { raw: true, includeOverlay: false, cacheBust: true })'),
    "apiGetBpmnXml должен вызываться с raw:true/includeOverlay:false",
  );
});

test("HTTP-ошибка загрузки НЕ маскируется под «сессия пуста»", () => {
  assert.ok(ws.includes('t("ws.asIsLoadFailed")'), "есть отдельное сообщение об ошибке загрузки");
  assert.ok(
    ws.includes('setNotice(r?.ok ? t("ws.asIsEmpty") : t("ws.asIsLoadFailed"));'),
    "asIsEmpty — только при ok && пустом xml",
  );
});

test("строка ws.asIsLoadFailed есть в словарях ru/en", () => {
  const ru = readFileSync(new URL("../i18n/ru.js", import.meta.url), "utf8");
  const en = readFileSync(new URL("../i18n/en.js", import.meta.url), "utf8");
  assert.ok(ru.includes('"ws.asIsLoadFailed"'));
  assert.ok(en.includes('"ws.asIsLoadFailed"'));
});

test("успешный путь неизменен: xml → import-bpmn → AS IS-слой (split)", () => {
  assert.ok(ws.includes('apiRequest("/api/process-templates/import-bpmn"'), "парсинг xml в ui_model сохранён");
  assert.ok(ws.includes('setLayerMode("split");'), "AS IS-слой показывается в split-режиме");
});
