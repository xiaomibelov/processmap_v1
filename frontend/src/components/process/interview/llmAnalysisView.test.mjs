// LLM1 — тесты view-логики блока «Анализ LLM» (node:test, стандарт репо).
// Запуск: node --test src/components/process/interview/llmAnalysisView.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LLM_ANALYSIS_STATUS,
  buildOperationLabels,
  buildStepLabels,
  errorTextForStatus,
  mapLlmAnalysisResponse,
} from "./llmAnalysisView.js";

const ANALYSIS = {
  bottlenecks: [{ step_id: "n2", reason: "долго", severity: "high" }],
  robotization_candidates: [{ step_id: "n1", operation_code: "move", rationale: "ручной перенос" }],
  risks: [{ text: "нет контроля", severity: "medium" }],
  open_questions: [{ text: "кто отвечает?" }],
};

function okResp(data) {
  return { ok: true, status: 200, result: data };
}

test("ok-ответ: статус ok, секции проносятся", () => {
  const v = mapLlmAnalysisResponse(okResp({
    ok: true, status: "ok", analysis: ANALYSIS, dropped: 2, cached: false,
  }));
  assert.equal(v.status, LLM_ANALYSIS_STATUS.OK);
  assert.deepEqual(v.analysis, ANALYSIS);
  assert.equal(v.dropped, 2);
});

test("cached-ответ: статус cached (0 токенов)", () => {
  const v = mapLlmAnalysisResponse(okResp({
    ok: true, status: "ok", analysis: ANALYSIS, cached: true,
  }));
  assert.equal(v.status, LLM_ANALYSIS_STATUS.CACHED);
  assert.equal(v.cached, true);
});

test("partial: кривой ответ LLM — честный статус, UI не падает", () => {
  const v = mapLlmAnalysisResponse(okResp({
    ok: true, status: "partial",
    analysis: { bottlenecks: [], robotization_candidates: [], risks: [], open_questions: [] },
    raw_excerpt: "обрыв ответа…",
  }));
  assert.equal(v.status, LLM_ANALYSIS_STATUS.PARTIAL);
  assert.equal(v.analysis.bottlenecks.length, 0);
  assert.equal(v.rawExcerpt, "обрыв ответа…");
});

test("гейтвей-ошибки: no_provider / rate_limited / disabled проносятся с текстом", () => {
  for (const st of ["no_provider", "rate_limited", "disabled", "error"]) {
    const v = mapLlmAnalysisResponse(okResp({ ok: false, status: st, error: "" }));
    assert.equal(v.status, st);
    assert.ok(v.errorText.length > 0, `пустой errorText для ${st}`);
  }
});

test("транспортная ошибка (fetch fail) → error", () => {
  const v = mapLlmAnalysisResponse({ ok: false, status: 500, error: "boom" });
  assert.equal(v.status, LLM_ANALYSIS_STATUS.ERROR);
  assert.equal(v.errorText, "boom");
  assert.equal(mapLlmAnalysisResponse(null).status, LLM_ANALYSIS_STATUS.ERROR);
});

test("кривые секции анализа → пустые массивы, не падение", () => {
  const v = mapLlmAnalysisResponse(okResp({ ok: true, status: "ok", analysis: { bottlenecks: "junk" } }));
  assert.equal(v.status, LLM_ANALYSIS_STATUS.OK);
  assert.deepEqual(v.analysis.bottlenecks, []);
});

test("расшифровка кодов операций из каталога", () => {
  const labels = buildOperationLabels([
    { code: "move", name_ru: "Перемещение" },
    { code: "hold", name_ru: "Выдержка" },
    { code: "", name_ru: "мусор" },
    null,
  ]);
  assert.deepEqual(labels, { move: "Перемещение", hold: "Выдержка" });
});

test("подписи шагов: name_ru/title, fallback на id", () => {
  const labels = buildStepLabels([
    { id: "n1", name_ru: "Мойка" },
    { id: "n2", title: "Резка" },
    { id: "n3" },
  ]);
  assert.deepEqual(labels, { n1: "Мойка", n2: "Резка", n3: "n3" });
});

test("тексты ошибок по статусам", () => {
  assert.match(errorTextForStatus("no_provider"), /провайдер/i);
  assert.match(errorTextForStatus("rate_limited"), /лимит/i);
  assert.match(errorTextForStatus("unknown"), /не удалось/i);
});
