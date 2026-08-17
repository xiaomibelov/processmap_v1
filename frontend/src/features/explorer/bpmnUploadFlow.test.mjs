import test from "node:test";
import assert from "node:assert/strict";
import {
  stripBpmnExtension,
  validateBpmnUploadFile,
  reduceUploadStage,
  uploadStageLabel,
  BPMN_UPLOAD_MAX_BYTES,
} from "./bpmnUploadFlow.js";

// P6 [Г]: хелперы флоу «create session + bpmn upload».

test("stripBpmnExtension: срезает .bpmn/.xml, прочее не трогает", () => {
  assert.equal(stripBpmnExtension("Лагман.bpmn"), "Лагман");
  assert.equal(stripBpmnExtension("process.XML"), "process");
  assert.equal(stripBpmnExtension("archive.tar.gz"), "archive.tar.gz");
  assert.equal(stripBpmnExtension("noext"), "noext");
  assert.equal(stripBpmnExtension(".bpmn"), ".bpmn");
  assert.equal(stripBpmnExtension(""), "");
});

test("validateBpmnUploadFile: расширение, лимит 20МБ, пустой файл", () => {
  assert.equal(validateBpmnUploadFile({ name: "ok.bpmn", size: 100 }).ok, true);
  assert.equal(validateBpmnUploadFile({ name: "ok.xml", size: 100 }).ok, true);
  const wrongExt = validateBpmnUploadFile({ name: "bad.txt", size: 100 });
  assert.equal(wrongExt.ok, false);
  assert.match(wrongExt.error, /\.bpmn/);
  const noExt = validateBpmnUploadFile({ name: "noext", size: 100 });
  assert.equal(noExt.ok, false);
  const big = validateBpmnUploadFile({ name: "big.bpmn", size: BPMN_UPLOAD_MAX_BYTES + 1 });
  assert.equal(big.ok, false);
  assert.match(big.error, /20 МБ/);
  const exact = validateBpmnUploadFile({ name: "exact.bpmn", size: BPMN_UPLOAD_MAX_BYTES });
  assert.equal(exact.ok, true);
  const empty = validateBpmnUploadFile({ name: "e.bpmn", size: 0 });
  assert.equal(empty.ok, false);
  const missing = validateBpmnUploadFile(null);
  assert.equal(missing.ok, false);
});

test("reduceUploadStage: creating → uploading → processing → done", () => {
  let s = "idle";
  s = reduceUploadStage(s, "create_start");
  assert.equal(s, "creating");
  s = reduceUploadStage(s, "create_ok");
  assert.equal(s, "uploading");
  s = reduceUploadStage(s, "upload_ok");
  assert.equal(s, "processing");
  s = reduceUploadStage(s, "done");
  assert.equal(s, "done");
});

test("reduceUploadStage: fail → error, retry (create_start) из error → creating", () => {
  let s = reduceUploadStage("uploading", "fail");
  assert.equal(s, "error");
  assert.equal(uploadStageLabel("error"), "Ошибка");
  s = reduceUploadStage(s, "create_start");
  assert.equal(s, "creating");
  // done — терминален для create_ok (retry идёт отдельным upload-путём)
  assert.equal(reduceUploadStage("done", "create_ok"), "done");
  assert.equal(reduceUploadStage("done", "reset"), "idle");
  // левые события не ломают порядок
  assert.equal(reduceUploadStage("idle", "upload_ok"), "idle");
  assert.equal(reduceUploadStage("creating", "bogus"), "creating");
});

test("uploadStageLabel: только транзиентные стадии, done/idle — пусто", () => {
  assert.equal(uploadStageLabel("creating"), "Создание…");
  assert.equal(uploadStageLabel("uploading"), "Загрузка…");
  assert.equal(uploadStageLabel("processing"), "Обработка…");
  assert.equal(uploadStageLabel("done"), "");
  assert.equal(uploadStageLabel("idle"), "");
});
