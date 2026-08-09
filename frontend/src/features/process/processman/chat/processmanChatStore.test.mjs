// PROCESSMAN-REDESIGN — unit-тесты chat store (reducer/history/typewriter).
import test from "node:test";

import assert from "node:assert/strict";

import {
  AGENT_STATUS,
  appendAgentPending,
  appendUserMessage,
  failAgentMessage,
  finishAgentMessage,
  getChatHistory,
  hasPendingAgent,
  lastAgentMessage,
  resetChatHistories,
  resolveAgentMessage,
  stopAgentMessage,
  typewriterDone,
  typewriterProgress,
  TYPEWRITER_CHARS_PER_TICK,
} from "./processmanChatStore.js";

test.beforeEach(() => resetChatHistories());

test("history per sessionId: append user/agent, изоляция сессий", () => {
  appendUserMessage("s1", "привет");
  const pending = appendAgentPending("s1", { action: "qa", stepId: "Task_1" });
  appendUserMessage("s2", "другая сессия");
  assert.equal(getChatHistory("s1").length, 2);
  assert.equal(getChatHistory("s2").length, 1);
  assert.equal(pending.status, AGENT_STATUS.PENDING);
  assert.equal(hasPendingAgent("s1"), true);
  assert.equal(lastAgentMessage("s1").id, pending.id);
});

test("pending → streaming (resolve) → done (finish)", () => {
  const pending = appendAgentPending("s1", { action: "explain" });
  const resolved = resolveAgentMessage("s1", pending.id, { text: "ответ", meta: { fromCache: false } });
  assert.equal(resolved.status, AGENT_STATUS.STREAMING);
  assert.equal(resolved.text, "ответ");
  const finished = finishAgentMessage("s1", pending.id);
  assert.equal(finished.status, AGENT_STATUS.DONE);
  assert.equal(hasPendingAgent("s1"), false);
});

test("стоп во время pending: resolve после stop игнорируется (запоздалый ответ)", () => {
  const pending = appendAgentPending("s1", { action: "qa" });
  stopAgentMessage("s1", pending.id);
  const late = resolveAgentMessage("s1", pending.id, { text: "поздний ответ" });
  assert.equal(late.status, AGENT_STATUS.STOPPED, "ответ после Стоп не воскрешает сообщение");
  assert.equal(late.text, "");
  assert.equal(hasPendingAgent("s1"), false);
});

test("стоп во время streaming фиксирует видимый текст", () => {
  const pending = appendAgentPending("s1", { action: "qa" });
  resolveAgentMessage("s1", pending.id, { text: "полный текст ответа" });
  const stopped = stopAgentMessage("s1", pending.id, { visibleText: "полный те" });
  assert.equal(stopped.status, AGENT_STATUS.STOPPED);
  assert.equal(stopped.text, "полный те");
});

test("fail: error не перезаписывается поздним resolve", () => {
  const pending = appendAgentPending("s1", { action: "suggest" });
  failAgentMessage("s1", pending.id, { errorText: "LLM-провайдер не настроен", errorStatus: "no_provider" });
  const late = resolveAgentMessage("s1", pending.id, { text: "x" });
  assert.equal(late.status, AGENT_STATUS.ERROR);
  assert.equal(late.errorStatus, "no_provider");
});

test("typewriter: монотонный прогресс порциями + done", () => {
  const text = "x".repeat(TYPEWRITER_CHARS_PER_TICK * 3 + 5);
  assert.equal(typewriterProgress(text, 0), 0);
  assert.equal(typewriterProgress(text, 1), TYPEWRITER_CHARS_PER_TICK);
  assert.equal(typewriterDone(text, 3), false);
  assert.equal(typewriterDone(text, 4), true);
  assert.equal(typewriterProgress(text, 100), text.length, "кап = длина текста");
});
