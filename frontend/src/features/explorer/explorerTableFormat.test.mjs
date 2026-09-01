import test from "node:test";
import assert from "node:assert/strict";
import {
  avatarColorFromName,
  AVATAR_PALETTE,
  compositionProjectsText,
  formatAbsoluteDateTime,
  formatRelativeTime,
  initialsFromName,
  pluralizeRu,
  sessionsCounterText,
  sessionsProgressPercent,
  sessionsTooltipText,
  workspaceSectionCounterText,
} from "./explorerTableFormat.js";

test("pluralizeRu picks correct russian plural form", () => {
  const projectForms = ["проект", "проекта", "проектов"];
  assert.equal(pluralizeRu(1, projectForms), "проект");
  assert.equal(pluralizeRu(2, projectForms), "проекта");
  assert.equal(pluralizeRu(4, projectForms), "проекта");
  assert.equal(pluralizeRu(5, projectForms), "проектов");
  assert.equal(pluralizeRu(11, projectForms), "проектов");
  assert.equal(pluralizeRu(12, projectForms), "проектов");
  assert.equal(pluralizeRu(21, projectForms), "проект");
  assert.equal(pluralizeRu(22, projectForms), "проекта");
  assert.equal(pluralizeRu(25, projectForms), "проектов");
  assert.equal(pluralizeRu(101, projectForms), "проект");
  assert.equal(pluralizeRu(111, projectForms), "проектов");
  assert.equal(pluralizeRu(0, projectForms), "проектов");

  const sessionForms = ["сессия", "сессии", "сессий"];
  assert.equal(pluralizeRu(1, sessionForms), "сессия");
  assert.equal(pluralizeRu(3, sessionForms), "сессии");
  assert.equal(pluralizeRu(5, sessionForms), "сессий");
});

test("pluralizeRu guards invalid input", () => {
  assert.equal(pluralizeRu(Number.NaN, ["a", "b", "c"]), "c");
  assert.equal(pluralizeRu(-3, ["a", "b", "c"]), "c");
});

test("compositionProjectsText pluralizes project count", () => {
  assert.equal(compositionProjectsText(1), "1 проект");
  assert.equal(compositionProjectsText(2), "2 проекта");
  assert.equal(compositionProjectsText(7), "7 проектов");
  assert.equal(compositionProjectsText(0), "0 проектов");
});

test("workspaceSectionCounterText pluralizes section count", () => {
  assert.equal(workspaceSectionCounterText(1), "1 раздел");
  assert.equal(workspaceSectionCounterText(2), "2 раздела");
  assert.equal(workspaceSectionCounterText(4), "4 раздела");
  assert.equal(workspaceSectionCounterText(7), "7 разделов");
  assert.equal(workspaceSectionCounterText(11), "11 разделов");
  assert.equal(workspaceSectionCounterText(21), "21 раздел");
  assert.equal(workspaceSectionCounterText(0), "0 разделов");
});

test("sessionsCounterText renders done/total pair", () => {
  assert.equal(sessionsCounterText(12, 56), "12/56");
  assert.equal(sessionsCounterText(0, 0), "0/0");
  assert.equal(sessionsCounterText(undefined, 5), "0/5");
  assert.equal(sessionsCounterText(3, undefined), "3/0");
});

test("sessionsProgressPercent computes fill percent clamped 0..100", () => {
  assert.equal(sessionsProgressPercent(12, 56), 21);
  assert.equal(sessionsProgressPercent(0, 0), 0);
  assert.equal(sessionsProgressPercent(5, 0), 0);
  assert.equal(sessionsProgressPercent(9, 4), 100);
  assert.equal(sessionsProgressPercent(-1, 10), 0);
});

test("sessionsTooltipText includes percent", () => {
  assert.equal(sessionsTooltipText(12, 56), "Заполнено 12 из 56 узлов процесса (21%)");
  assert.equal(sessionsTooltipText(0, 0), "Заполнено 0 из 0 узлов процесса (0%)");
  assert.equal(sessionsTooltipText(5, 10), "Заполнено 5 из 10 узлов процесса (50%)");
});

test("formatRelativeTime matches legacy ts() ladder", () => {
  const now = Date.now();
  assert.equal(formatRelativeTime(0), "");
  assert.equal(formatRelativeTime(null), "");
  assert.equal(formatRelativeTime(Math.floor((now - 30_000) / 1000)), "только что");
  assert.equal(formatRelativeTime(Math.floor((now - 59_000) / 1000)), "только что");
  assert.equal(formatRelativeTime(Math.floor((now - 60_000) / 1000)), "1 мин назад");
  assert.equal(formatRelativeTime(Math.floor((now - 5 * 60_000) / 1000)), "5 мин назад");
  assert.equal(formatRelativeTime(Math.floor((now - 59 * 60_000) / 1000)), "59 мин назад");
  assert.equal(formatRelativeTime(Math.floor((now - 3_600_000) / 1000)), "1 ч назад");
  assert.equal(formatRelativeTime(Math.floor((now - 3 * 3_600_000) / 1000)), "3 ч назад");
  assert.equal(formatRelativeTime(Math.floor((now - 23 * 3_600_000) / 1000)), "23 ч назад");
  assert.equal(formatRelativeTime(Math.floor((now - 86_400_000) / 1000)), "1 д назад");
  assert.equal(formatRelativeTime(Math.floor((now - 6 * 86_400_000) / 1000)), "6 д назад");
  // >= 7 дней — абсолютная дата, проверяем только что не «назад»
  const old = formatRelativeTime(Math.floor((now - 30 * 86_400_000) / 1000));
  assert.ok(old.length > 0 && !old.includes("назад"));
});

test("formatAbsoluteDateTime renders ru-RU date with time", () => {
  const epoch = Math.floor(new Date(2026, 7, 12, 14, 32).getTime() / 1000);
  const out = formatAbsoluteDateTime(epoch);
  assert.match(out, /12/);
  assert.match(out, /2026/);
  assert.match(out, /14:32/);
  assert.equal(formatAbsoluteDateTime(0), "");
});

test("avatarColorFromName is deterministic and stays within palette", () => {
  const c1 = avatarColorFromName("Дмитрий Белов");
  const c2 = avatarColorFromName("Дмитрий Белов");
  assert.equal(c1, c2);
  assert.ok(AVATAR_PALETTE.includes(c1));
  for (const name of ["Анна Ким", "Игорь Соколов", "Мария Лебедева", "A", "", "  "]) {
    assert.ok(AVATAR_PALETTE.includes(avatarColorFromName(name)));
  }
  // разные люди — не обязаны, но в наборе дают разные цвета
  const colors = new Set(["Дмитрий Белов", "Анна Ким", "Игорь Соколов", "Мария Лебедева"].map(avatarColorFromName));
  assert.ok(colors.size >= 2);
});

test("initialsFromName takes first letters of first two words", () => {
  assert.equal(initialsFromName("Дмитрий Белов"), "ДБ");
  assert.equal(initialsFromName("Анна"), "А");
  assert.equal(initialsFromName("  Игорь   Соколов "), "ИС");
  assert.equal(initialsFromName("maria lebedeva"), "ML");
  assert.equal(initialsFromName(""), "?");
  assert.equal(initialsFromName(null), "?");
  assert.equal(initialsFromName("Иван Петров Сидоров"), "ИП");
});
