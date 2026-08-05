// fix(overlay): TO BE из сессии со схемой — шаг 1 «Импорт AS IS» читает слой AS IS,
// а не показывает заглушку «Сессия AS IS пуста».
// Корень: Workspace читал /bpmn с дефолтами (overlay-кэш) — тот мог вернуть
// пустое тело 200 (потеря org-контекста на backend). Чтение переведено на
// raw+noOverlay, как у основного канваса (sessionLoader).
// + empty-state UX: ОДНО сообщение (центр-карточка с честной причиной) и ОДИН
// набор действий; тулбар — disabled с title-причиной, без дублирующих CTA.
// Запуск: node --test src/features/technologist/workspace/asisSourceLoad.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ws = readFileSync(new URL("./Workspace.jsx", import.meta.url), "utf8");
const ru = readFileSync(new URL("../i18n/ru.js", import.meta.url), "utf8");
const en = readFileSync(new URL("../i18n/en.js", import.meta.url), "utf8");

test("AS IS читается raw + без overlay-кэша (как основной канвас)", () => {
  assert.ok(
    ws.includes('apiGetBpmnXml(asIsSource.sessionId, { raw: true, includeOverlay: false, cacheBust: true })'),
    "apiGetBpmnXml должен вызываться с raw:true/includeOverlay:false",
  );
});

test("причина пустого AS IS различается: empty/load_failed/no_nodes/import_failed", () => {
  assert.ok(ws.includes('setAsIsEmptyReason(r?.ok ? "empty" : "load_failed");'), "HTTP-ошибка ≠ «пустая сессия»");
  assert.ok(ws.includes('setAsIsEmptyReason(ir?.ok ? "no_nodes" : "import_failed");'), "нераспознанный XML ≠ «пустая сессия»");
});

test("успешный путь неизменен: xml → import-bpmn → AS IS-слой (split)", () => {
  assert.ok(ws.includes('apiRequest("/api/process-templates/import-bpmn"'), "парсинг xml в ui_model сохранён");
  assert.ok(ws.includes('setLayerMode("split");'), "AS IS-слой показывается в split-режиме");
});

test("empty-state: центр-карточка — единственный источник действий (выбрать сессию → первичная)", () => {
  const card = ws.slice(ws.indexOf('data-testid="ws-empty"'));
  assert.ok(card.includes('data-testid="ws-pick-session"'), "кнопка «Выбрать сессию» в карточке");
  assert.ok(card.indexOf('data-testid="ws-pick-session"') < card.indexOf('data-testid="ws-blank-start"'),
    "«Выбрать сессию» — первичная (первая), «с чистого листа» — вторичная");
  assert.ok(!card.slice(0, card.indexOf("</div>\n            ) :")).includes('data-testid="ws-empty-back"'),
    "старая дублирующая кнопка ws-empty-back удалена из карточки");
});

test("empty-state: тулбар — disabled с title-причиной, без активных дублей", () => {
  assert.ok(ws.includes('{ id: "transform_blocked", label: t("wf.nextTransform") }'), "заблокированное действие тулбара");
  assert.ok(ws.includes('disabled={busy || action.id === "transform_blocked"}'), "кнопка disabled");
  assert.ok(ws.includes('action.id === "transform_blocked" ? t("ws.transformDisabledEmpty") : undefined'), "title-причина");
  assert.ok(!ws.includes('data-testid="ws-transform-disabled"'), "отдельная дублирующая disabled-кнопка удалена");
});

test("empty-state: баннер не дублирует сообщение карточки", () => {
  assert.ok(!ws.includes('setNotice(t("ws.asIsEmpty"));'), "ws.asIsEmpty не уходит в баннер");
  assert.ok(!ws.includes('setNotice(ir?.ok ? t("ws.asIsImportNoNodes")'), "noNodes/importFailed не уходят в баннер");
});

test("новые строки есть в словарях ru/en", () => {
  for (const key of ['"ws.asIsLoadFailed"', '"ws.pickSession"', '"ws.asIsUnavailableTitle"']) {
    assert.ok(ru.includes(key), `ru: ${key}`);
    assert.ok(en.includes(key), `en: ${key}`);
  }
});
