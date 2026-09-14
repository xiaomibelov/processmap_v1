// agent-ui-completion-v1 — маппинг AgentTurnOut -> сообщения ленты.
// Фикстуры повторяют контракт backend/app/agent/chat.py (content-dict per role).
// Запуск: node --test src/features/process/processman/chat/historyMap.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { mapHistoryTurnToMessage, mapHistoryTurnsToMessages } from "./historyMap.js";
import { AGENT_STATUS, CHAT_ROLE, getChatHistory, hydrateChatHistory, isChatHistoryHydrated, resetChatHistories } from "./processmanChatStore.js";

const T0 = 1726200000000;

function userTurn(over = {}) {
  return {
    id: "t1",
    role: "user",
    content: { text: "Что дальше после шага 1?", selected_step_id: "Task_1" },
    action: null,
    action_payload: {},
    usage: {},
    created_at: T0,
    client_turn_id: "c1",
    ...over,
  };
}

function assistantTurn(over = {}) {
  return {
    id: "t2",
    role: "assistant",
    content: { text: "Добавьте шаг «Проверка качества»." },
    action: "suggest-next",
    action_payload: { message: "Добавьте шаг «Проверка качества»." },
    usage: { total_tokens: 42 },
    created_at: T0 + 1000,
    client_turn_id: "c1",
    ...over,
  };
}

test("user turn -> сообщение роли user (text из content.text)", () => {
  const msg = mapHistoryTurnToMessage(userTurn());
  assert.equal(msg.role, CHAT_ROLE.USER);
  assert.equal(msg.text, "Что дальше после шага 1?");
  assert.equal(msg.at, T0);
});

test("assistant turn -> done-сообщение агента с action и usage в meta", () => {
  const msg = mapHistoryTurnToMessage(assistantTurn());
  assert.equal(msg.role, CHAT_ROLE.AGENT);
  assert.equal(msg.status, AGENT_STATUS.DONE);
  assert.equal(msg.action, "suggest-next");
  assert.equal(msg.text, "Добавьте шаг «Проверка качества».");
  assert.equal(msg.meta.hydrated, true);
  assert.equal(msg.meta.usage.total_tokens, 42);
});

test("assistant turn с content.status != ok -> ERROR (честный LLM-фейл из chat.py)", () => {
  const msg = mapHistoryTurnToMessage(assistantTurn({ content: { text: "[no_provider] LLM-провайдер не настроен", status: "no_provider" } }));
  assert.equal(msg.status, AGENT_STATUS.ERROR);
  assert.equal(msg.errorStatus, "no_provider");
});

test("служебные/битые turn'ы пропускаются без исключений", () => {
  assert.equal(mapHistoryTurnToMessage(null), null);
  assert.equal(mapHistoryTurnToMessage({}), null);
  assert.equal(mapHistoryTurnToMessage({ role: "system", content: { text: "x" } }), null);
  assert.equal(mapHistoryTurnToMessage({ role: "user", content: { text: "   " } }), null);
  assert.equal(mapHistoryTurnToMessage({ role: "user", content: null }), null);
  assert.equal(mapHistoryTurnToMessage({ role: "assistant", content: {} }), null);
  assert.equal(mapHistoryTurnToMessage({ role: "user", content: "plain string text" }).text, "plain string text");
});

test("mapHistoryTurnsToMessages: порядок сохраняется, битые пропускаются", () => {
  const out = mapHistoryTurnsToMessages([
    userTurn(),
    { role: "system", content: { text: "сервисный" } },
    assistantTurn(),
    null,
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].role, CHAT_ROLE.USER);
  assert.equal(out[1].role, CHAT_ROLE.AGENT);
  assert.deepEqual(mapHistoryTurnsToMessages("не массив"), []);
});

test("hydrateChatHistory: сидирует пустую ленту, идемпотентна", () => {
  resetChatHistories();
  const first = hydrateChatHistory("s1", [userTurn(), assistantTurn()]);
  assert.deepEqual(first, { hydrated: true, count: 2 });
  assert.equal(getChatHistory("s1").length, 2);
  assert.equal(getChatHistory("s1")[1].status, AGENT_STATUS.DONE);
  // повторная гидрация — no-op (не дублирует)
  const second = hydrateChatHistory("s1", [userTurn(), assistantTurn()]);
  assert.deepEqual(second, { hydrated: false, count: 0 });
  assert.equal(getChatHistory("s1").length, 2);
});

test("hydrateChatHistory: НЕ трогает непустую ленту (защита живого диалога)", () => {
  resetChatHistories();
  getChatHistory("s2").push({ id: "live_1", role: CHAT_ROLE.USER, text: "уже написано", at: Date.now() });
  const res = hydrateChatHistory("s2", [userTurn()]);
  assert.deepEqual(res, { hydrated: false, count: 0 });
  assert.equal(getChatHistory("s2").length, 1);
  assert.equal(getChatHistory("s2")[0].id, "live_1");
});

test("hydrateChatHistory: пустые/битые turns -> hydrated=false, лента пустая", () => {
  resetChatHistories();
  assert.deepEqual(hydrateChatHistory("s3", []), { hydrated: false, count: 0 });
  assert.deepEqual(hydrateChatHistory("s3", null), { hydrated: false, count: 0 });
  assert.equal(getChatHistory("s3").length, 0);
});

test("isChatHistoryHydrated: флаг ставится даже при пустой гидрации; сброс в resetChatHistories", () => {
  resetChatHistories();
  assert.equal(isChatHistoryHydrated("s5"), false);
  hydrateChatHistory("s5", []);
  assert.equal(isChatHistoryHydrated("s5"), true, "пустая гидрация тоже фиксируется (0 повторных GET)");
  resetChatHistories("s5");
  assert.equal(isChatHistoryHydrated("s5"), false, "сброс по sid");
  hydrateChatHistory("s5", [userTurn()]);
  resetChatHistories();
  assert.equal(isChatHistoryHydrated("s5"), false, "полный сброс");
});
