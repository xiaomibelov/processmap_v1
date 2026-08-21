// UXF/B4: классификация источников TO BE.
// T1: сабпроцессы — по формальному признаку, исключаются из пикера полностью;
// regex — fallback для старых данных (логируется); orphan-сабпроцессы
// (родитель удалён) исключаются — осознанное решение, см.
// docs/spec/T1_TOBE_SOURCE_PICKER_DATA_AUDIT.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildDerivedSet,
  classifySourceSessions,
  isServiceSession,
  isSubprocessSession,
  pickTobeSourceCandidates,
} from "./tobeSources.js";

test("B4: человеческие имена — в основном списке", () => {
  const { main, other } = classifySourceSessions([
    { id: "1", title: "Лагман с говядиной (v0.3)" },
    { id: "2", title: "Разогрев супа" },
  ]);
  assert.equal(main.length, 2);
  assert.equal(other.length, 0);
});

test("T1: сабпроцесс по формальному флагу — даже с «человеческим» именем", () => {
  // Реальный кейс со stage: «Хранение шпильки в Холодильной камере» —
  // regex по имени НЕ ловит, но это дочерняя сессия.
  assert.equal(isSubprocessSession({
    id: "4c610b9098",
    title: "Хранение шпильки в Холодильной камере",
    is_subprocess: true,
    parent_session_id: "1e4e833505",
  }), true);
  // Полный dump модели: is_subprocess нет, но parent_session_id присутствует.
  assert.equal(isSubprocessSession({
    id: "e1999d6bee",
    title: "Проверить закрытие емкости",
    parent_session_id: "1e4e833505",
  }), true);
});

test("T1: формальный флаг важнее regex — ложные срабатывания regex исправлены", () => {
  // Реальный кейс со stage: «subprocess-rt-check-…» — обычная сессия,
  // regex ловил ложно; с флагом is_subprocess=false — НЕ сабпроцесс.
  assert.equal(isSubprocessSession({
    id: "d54dc356d4",
    title: "subprocess-rt-check-1785844400",
    is_subprocess: false,
    parent_session_id: "",
  }), false);
});

test("T1: orphan-сабпроцесс (родитель удалён) — исключён из пикера", () => {
  // Осознанное решение: живость родителя не проверяем — сабпроцесс
  // не самостоятельный источник TO BE.
  const orphan = {
    id: "orphan1",
    title: "Мойка оборудования",
    is_subprocess: true,
    parent_session_id: "deleted_parent",
  };
  assert.equal(isSubprocessSession(orphan), true);
  assert.deepEqual(pickTobeSourceCandidates([orphan]), []);
});

test("T1: regex-fallback для старых данных без формального признака", () => {
  const warns = [];
  const origWarn = console.warn;
  console.warn = (msg) => warns.push(String(msg));
  try {
    // Нет ни is_subprocess, ни parent_session_id — старые данные.
    assert.equal(isSubprocessSession({ id: "old1", title: "Подпроцесс: Activity_1k9t4a7" }), true);
    assert.equal(isSubprocessSession({ id: "old2", title: "Лагман с говядиной" }), false);
  } finally {
    console.warn = origWarn;
  }
  // Fallback залогирован ровно один раз на сессию (антиспам по id).
  assert.equal(warns.length, 1);
  assert.match(warns[0], /T1 regex-fallback/);
  assert.match(warns[0], /old1/);
});

test("T1: pickTobeSourceCandidates исключает сабпроцессы, оставляет обычные", () => {
  const sessions = [
    { id: "m1", title: "Мойка поверхностей", is_subprocess: false, parent_session_id: "" },
    { id: "s1", title: "Хранение шпильки", is_subprocess: true, parent_session_id: "p1" },
    { id: "m2", title: "Разогрев супа", is_subprocess: false, parent_session_id: "" },
  ];
  const out = pickTobeSourceCandidates(sessions);
  assert.deepEqual(out.map((s) => s.id), ["m1", "m2"]);
});

test("B4: подпроцессы по имени (старые данные) — служебные", () => {
  assert.equal(isServiceSession({ title: "Подпроцесс: Activity_1k9t4a7" }), true);
  assert.equal(isServiceSession({ title: "Подпроцесс B" }), true);
  assert.equal(isServiceSession({ title: "Subprocess: payment" }), true);
});

test("B4: клавиатурный мусор и безымянные — служебные", () => {
  assert.equal(isServiceSession({ title: "fsefw" }), true);
  assert.equal(isServiceSession({ title: "" }), true);
  assert.equal(isServiceSession({ title: "   " }), true);
  assert.equal(isServiceSession({}), true);
  // но нормальные короткие/английские названия — не мусор
  assert.equal(isServiceSession({ title: "Суп" }), false);
  assert.equal(isServiceSession({ title: "Packaging" }), false);
});

test("B4: derived-set помечает источники с существующим TO BE", () => {
  const set = buildDerivedSet([
    { derived_from_session_id: "a1" },
    { derived_from_session_id: "a2" },
    {},
    { derived_from_session_id: "" },
  ]);
  assert.equal(set.has("a1"), true);
  assert.equal(set.has("a2"), true);
  assert.equal(set.has("a3"), false);
});

test("T1: wiring — пикер в NotesPanel исключает сабпроцессы и берёт подпись из словарей", () => {
  const source = readFileSync(new URL("../components/NotesPanel.jsx", import.meta.url), "utf8");
  assert.match(source, /pickTobeSourceCandidates/);
  assert.match(source, /tobe\.source\.noBpmn/);
});
