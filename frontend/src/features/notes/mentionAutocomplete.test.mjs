import test from "node:test";
import assert from "node:assert/strict";

import {
  detectMentionQuery,
  filterMentionSuggestions,
  insertMentionText,
  mentionUserIdsForSubmit,
  pruneSelectedMentions,
} from "./mentionAutocomplete.js";

const users = [
  { user_id: "u1", full_name: "Иван Петров", email: "ivan@example.test", job_title: "Технолог" },
  { user_id: "u2", full_name: "", label: "Мария", email: "maria@example.test" },
  { user_id: "u3", full_name: "Олег Сидоров", email: "oleg@example.test" },
];

test("mention query opens after @ and tracks the typed query", () => {
  assert.deepEqual(detectMentionQuery("Проверь @ив", 11), { startIndex: 8, query: "ив" });
  assert.equal(detectMentionQuery("email@test", 10), null);
  assert.equal(detectMentionQuery("Проверь @ив.", 12), null);
});

test("mention suggestions filter by full name and email", () => {
  assert.deepEqual(filterMentionSuggestions(users, "ив").map((item) => item.user_id), ["u1"]);
  assert.deepEqual(filterMentionSuggestions(users, "maria").map((item) => item.user_id), ["u2"]);
  assert.deepEqual(filterMentionSuggestions(users, "", [{ user_id: "u1" }]).map((item) => item.user_id), ["u2", "u3"]);
});

test("selecting a mention inserts visible @label text", () => {
  const active = detectMentionQuery("Жду @ив", 8);
  const result = insertMentionText("Жду @ив", active, users[0], 8);
  assert.equal(result.text, "Жду @Иван Петров ");
  assert.equal(result.mention.user_id, "u1");
  assert.equal(result.caretIndex, "Жду @Иван Петров ".length);
});

test("deleted mention text is dropped before submit and ids are deduped", () => {
  const selected = [
    { user_id: "u1", label: "Иван Петров", insertedText: "@Иван Петров" },
    { user_id: "u1", label: "Иван Петров", insertedText: "@Иван Петров" },
    { user_id: "u2", label: "Мария", insertedText: "@Мария" },
  ];
  assert.deepEqual(mentionUserIdsForSubmit("@Иван Петров посмотри", selected), ["u1"]);
  assert.deepEqual(pruneSelectedMentions("текст без токена", selected), []);
});
