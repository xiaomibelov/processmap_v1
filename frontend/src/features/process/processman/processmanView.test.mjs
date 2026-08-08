// LLM4 — unit-тесты чистой view-логики панели PROCESSMAN (processmanView.js).
// Запуск: node --test src/features/process/processman/processmanView.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  ANSWER_STATUS,
  answerCacheKey,
  buildAnswerMeta,
  contextBadgeKey,
  extractAnswerText,
  formatClock,
  isLlmNotConfigured,
  mapActionResponse,
  resolveLlmStatusView,
  resolvePanelContext,
} from "./processmanView.js";

// ------------------------------------------------------------- контекст (П.4)
test("resolvePanelContext: вкладка «Анализ процессов» (interview) → analysis", () => {
  assert.equal(resolvePanelContext({ tab: "interview", mode: "schema" }), "analysis");
  assert.equal(resolvePanelContext({ tab: "interview", mode: "tobe" }), "analysis");
});

test("resolvePanelContext: «Схема» — mode решает schema vs tobe", () => {
  assert.equal(resolvePanelContext({ tab: "diagram", mode: "schema" }), "schema");
  assert.equal(resolvePanelContext({ tab: "diagram", mode: "" }), "schema");
  assert.equal(resolvePanelContext({ tab: "diagram", mode: "tobe" }), "tobe");
});

test("resolvePanelContext: прочие вкладки (xml/doc/dod/analytics) → neutral", () => {
  for (const tab of ["xml", "doc", "dod", "analytics", ""]) {
    assert.equal(resolvePanelContext({ tab, mode: "schema" }), "neutral", `tab=${tab}`);
  }
});

test("contextBadgeKey: у каждого контекста есть i18n-ключ бейджа", () => {
  assert.equal(contextBadgeKey("schema"), "contextSchema");
  assert.equal(contextBadgeKey("tobe"), "contextTobe");
  assert.equal(contextBadgeKey("analysis"), "contextAnalysis");
  assert.equal(contextBadgeKey("neutral"), "contextNeutral");
  assert.equal(contextBadgeKey("unknown"), "contextNeutral");
});

// ------------------------------------------------------------- кэш/ответ
test("answerCacheKey: действие + шаг", () => {
  assert.equal(answerCacheKey("suggest", "Act_1"), "suggest:Act_1");
  assert.notEqual(answerCacheKey("suggest", "Act_1"), answerCacheKey("explain", "Act_1"));
  assert.notEqual(answerCacheKey("suggest", "Act_1"), answerCacheKey("suggest", "Act_2"));
});

test("extractAnswerText: suggest → список кандидатов + note", () => {
  const text = extractAnswerText("suggest", {
    suggestions: {
      candidates: [{ code: "op_cook", rationale: "нагрев" }, { code: "op_move", rationale: "перенос" }],
      note: "контекст: супы",
    },
  });
  assert.ok(text.includes("op_cook") && text.includes("перенос"), text);
  assert.ok(text.includes("контекст: супы"), text);
});

test("extractAnswerText: explain/qa → текст + note", () => {
  assert.equal(extractAnswerText("explain", { explanation: "потому что", note: "n" }), "потому что\n\nn");
  assert.equal(extractAnswerText("qa", { answer: "42" }), "42");
  assert.equal(extractAnswerText("qa", {}), "");
});

test("mapActionResponse: ok → OK + data; ok:false → ERROR с человекочитаемым текстом", () => {
  const ok = mapActionResponse({ ok: true, status: 200, result: { ok: true, status: "ok", answer: "a" } });
  assert.equal(ok.status, ANSWER_STATUS.OK);
  const noProvider = mapActionResponse({ ok: true, status: 200, result: { ok: false, status: "no_provider" } });
  assert.equal(noProvider.status, ANSWER_STATUS.ERROR);
  assert.equal(noProvider.errorStatus, "no_provider");
  assert.ok(noProvider.errorText.includes("провайдер не настроен"), "русский человекочитаемый текст");
  // domain-статус восстанавливается из data после конверсии okOrError (resp.ok=false)
  const viaOkOrError = mapActionResponse({ ok: false, status: 200, error: "no enabled LLM providers", data: { ok: false, status: "no_provider" } });
  assert.equal(viaOkOrError.errorStatus, "no_provider");
  assert.ok(viaOkOrError.errorText.includes("провайдер не настроен"));
  const httpErr = mapActionResponse({ ok: false, status: 500, error: "boom" });
  assert.equal(httpErr.status, ANSWER_STATUS.ERROR);
  assert.equal(httpErr.errorStatus, "error");
  assert.ok(httpErr.errorText.length > 0);
});

test("buildAnswerMeta: S8 fallback, confidence, open_questions, fromCache", () => {
  const meta = buildAnswerMeta(
    { fallback: true, cached: true, confidence: 0.55, open_questions: [{ question: "q1" }], usage: { prompt_tokens: 5, completion_tokens: 7 } },
    { fromCache: true },
  );
  assert.equal(meta.fallback, true);
  assert.equal(meta.cachedBackend, true);
  assert.equal(meta.fromCache, true);
  assert.equal(meta.confidence, 0.55);
  assert.equal(meta.openQuestions.length, 1);
  assert.equal(meta.promptTokens, 5);
  const noConf = buildAnswerMeta({}, {});
  assert.equal(noConf.confidence, null);
  assert.equal(noConf.fallback, false);
  assert.equal(noConf.fromCache, false);
});

// ------------------------------------------------------------- llmStatus
test("resolveLlmStatusView: idle/unknown/not_configured/configured/exhausted", () => {
  assert.deepEqual(resolveLlmStatusView(null), { kind: "idle" });
  assert.deepEqual(resolveLlmStatusView({ ok: false }), { kind: "unknown" });
  assert.deepEqual(resolveLlmStatusView({ ok: true, result: { configured: false } }), { kind: "not_configured" });
  assert.deepEqual(
    resolveLlmStatusView({ ok: true, result: { configured: true, quota: { used: 10, limit: 200 } } }),
    { kind: "configured", used: 10, limit: 200, exhausted: false },
  );
  assert.equal(
    resolveLlmStatusView({ ok: true, result: { configured: true, quota: { used: 200, limit: 200 } } }).exhausted,
    true,
  );
});

test("isLlmNotConfigured: только при известном configured=false (S1)", () => {
  assert.equal(isLlmNotConfigured(null), false);
  assert.equal(isLlmNotConfigured({ ok: false }), false);
  assert.equal(isLlmNotConfigured({ ok: true, result: { configured: false } }), true);
  assert.equal(isLlmNotConfigured({ ok: true, result: { configured: true } }), false);
});

test("formatClock: HH:MM, пусто при мусоре", () => {
  assert.equal(formatClock(0), "");
  assert.match(formatClock(Date.now()), /^\d{2}:\d{2}$/);
});
