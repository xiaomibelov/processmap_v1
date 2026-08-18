// PROCESSMAN-REDESIGN — unit-тесты chat store (reducer/history/typewriter).
import test from "node:test";

import assert from "node:assert/strict";

import {
  AGENT_STATUS,
  appendAgentPending,
  appendStreamingDelta,
  appendUserMessage,
  attachPendingEdit,
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
  updateAgentMessage,
  updatePendingEditStatus,
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

test("appendStreamingDelta: pending → streaming, delta накапливается", () => {
  const pending = appendAgentPending("s1", { action: "chat" });
  appendStreamingDelta("s1", pending.id, "первая ");
  assert.equal(lastAgentMessage("s1").status, AGENT_STATUS.STREAMING);
  assert.equal(lastAgentMessage("s1").text, "первая ");
  appendStreamingDelta("s1", pending.id, "вторая");
  assert.equal(lastAgentMessage("s1").text, "первая вторая");
});

test("appendStreamingDelta игнорирует delta после stop/error", () => {
  const pending = appendAgentPending("s1", { action: "chat" });
  stopAgentMessage("s1", pending.id, { visibleText: "обор" });
  appendStreamingDelta("s1", pending.id, "ван");
  assert.equal(lastAgentMessage("s1").text, "обор");
  assert.equal(lastAgentMessage("s1").status, AGENT_STATUS.STOPPED);
});

test("updateAgentMessage: текст/meta/статус", () => {
  const pending = appendAgentPending("s1", { action: "chat" });
  updateAgentMessage("s1", pending.id, { text: "action text", meta: { usage: { tokens: 1 } }, status: AGENT_STATUS.STREAMING });
  const msg = lastAgentMessage("s1");
  assert.equal(msg.text, "action text");
  assert.equal(msg.meta.usage.tokens, 1);
  assert.equal(msg.status, AGENT_STATUS.STREAMING);
});

test("AGENT-3 attachPendingEdit: карточка HITL прикрепляется к сообщению", () => {
  const pending = appendAgentPending("s1", { action: "edit_canvas" });
  resolveAgentMessage("s1", pending.id, { text: "предлагаю правку" });
  const updated = attachPendingEdit("s1", pending.id, {
    pendingEditId: "pe_1",
    editPlan: { note: "добавить шаг" },
    diff: [{ op: "add_node", node_id: "Task_1", title: "Новый шаг" }],
    timeoutSec: 900,
  });
  assert.equal(updated.status, AGENT_STATUS.EDIT_PENDING);
  assert.equal(updated.pendingEdit.pendingEditId, "pe_1");
  assert.equal(updated.pendingEdit.diff.length, 1);
  assert.equal(updated.pendingEdit.status, AGENT_STATUS.EDIT_PENDING);
});

test("AGENT-3 updatePendingEditStatus: applied/rejected/conflict", () => {
  const pending = appendAgentPending("s1", { action: "edit_canvas" });
  attachPendingEdit("s1", pending.id, { pendingEditId: "pe_2", diff: [] });
  updatePendingEditStatus("s1", pending.id, { status: AGENT_STATUS.EDIT_APPLIED, result: { operations_applied: 1 } });
  const msg = lastAgentMessage("s1");
  assert.equal(msg.status, AGENT_STATUS.EDIT_APPLIED);
  assert.equal(msg.pendingEdit.result.operations_applied, 1);
});
