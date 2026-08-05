// T2: единый guarded выход из TO BE.
// Решения владельца: origin не запоминаем; кнопки-дубли — alias на единый
// exit; confirm — styled-модал (TobeLeaveConfirmModal).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TOBE_LEAVE_CANCEL,
  TOBE_LEAVE_DISCARD,
  TOBE_LEAVE_SAVE,
  isTobeLeaveChoice,
  shouldConfirmTobeLeave,
} from "./tobeLeaveGuard.js";

// --- чистая модель ---
test("T2: confirm нужен только при активном TO BE и dirty", () => {
  assert.equal(shouldConfirmTobeLeave({ tobeActive: true, dirty: true }), true);
  assert.equal(shouldConfirmTobeLeave({ tobeActive: true, dirty: false }), false);
  assert.equal(shouldConfirmTobeLeave({ tobeActive: false, dirty: true }), false);
  assert.equal(shouldConfirmTobeLeave({}), false);
});

test("T2: выборы модала — save / discard / cancel", () => {
  assert.equal(isTobeLeaveChoice(TOBE_LEAVE_SAVE), true);
  assert.equal(isTobeLeaveChoice(TOBE_LEAVE_DISCARD), true);
  assert.equal(isTobeLeaveChoice(TOBE_LEAVE_CANCEL), true);
  assert.equal(isTobeLeaveChoice("hack"), false);
});

// --- wiring в App.jsx ---
test("T2: все выходы из TO BE — alias на единый requestTobeExit", () => {
  const source = readFileSync(new URL("../../../App.jsx", import.meta.url), "utf8");
  // сегмент «Схема»
  assert.match(source, /onExitTobe: \(\) => \{ void requestTobeExit\(\); \}/);
  // «← К схеме» в левой панели
  assert.match(source, /data-testid="tobe-left-back"[\s\S]{0,200}requestTobeExit|onClick=\{\(\) => \{ void requestTobeExit\(\); \}\}[\s\S]{0,200}tobe-left-back/);
  // «← Вернуться к сессии» в сайдбаре
  assert.match(source, /onCloseTobeWorkspace=\{\(\) => \{ void requestTobeExit\(\); \}\}/);
  // ws-close / ws-empty-back рабочего места
  assert.match(source, /onClose=\{\(\) => \{ void requestTobeExit\(\); \}\}/);
  // dirty проброшен из рабочего места
  assert.match(source, /onDirtyChange=\{handleTobeDirtyChange\}/);
  // «← К проекту» (returnToSessionList) gated тем же модалом
  assert.match(source, /shouldConfirmTobeLeave\(\{ tobeActive: !!tobeMode, dirty: tobeDirtyRef\.current \}\)/);
  // «Сохранить и выйти» — через T0 flush-механизм
  assert.match(source, /reason: "tobe_leave_save"/);
});

test("T2: styled-модал отрендерен в App и использует словари, не хардкод", () => {
  const app = readFileSync(new URL("../../../App.jsx", import.meta.url), "utf8");
  assert.match(app, /<TobeLeaveConfirmModal/);
  const modal = readFileSync(new URL("./TobeLeaveConfirmModal.jsx", import.meta.url), "utf8");
  assert.match(modal, /tobe\.leave\.save/);
  assert.match(modal, /tobe\.leave\.discard/);
  assert.match(modal, /tobe\.leave\.cancel/);
  assert.doesNotMatch(modal, /Сохранить и выйти|Выйти без сохранения/); // строки — только из словарей
});

test("T2: крошка «TO BE» в TopBar и транзит из AppShell", () => {
  const topbar = readFileSync(new URL("../../../components/TopBar.jsx", import.meta.url), "utf8");
  assert.match(topbar, /data-testid="topbar-crumb-tobe"/);
  const shell = readFileSync(new URL("../../../components/AppShell.jsx", import.meta.url), "utf8");
  assert.match(shell, /tobeActive=\{!!stageOverride\}/);
});

test("T2: рабочее место отдаёт dirty наружу (onDirtyChange)", () => {
  const ws = readFileSync(new URL("./Workspace.jsx", import.meta.url), "utf8");
  assert.match(ws, /onDirtyChange = null/);
  assert.match(ws, /onDirtyChange\?\.\(dirty\)/);
});

test("T2: все используемые константы tobeLeaveGuard импортированы в App.jsx", () => {
  // vite build НЕ ловит undefined-идентификаторы в JSX — проверяем источник.
  const source = readFileSync(new URL("../../../App.jsx", import.meta.url), "utf8");
  const importBlock = source.match(/import \{[^}]*\} from "\.\/features\/technologist\/workspace\/tobeLeaveGuard";/);
  assert.ok(importBlock, "App.jsx должен импортировать из tobeLeaveGuard");
  for (const name of ["TOBE_LEAVE_CANCEL", "TOBE_LEAVE_DISCARD", "TOBE_LEAVE_SAVE", "shouldConfirmTobeLeave"]) {
    const used = new RegExp(`[^a-zA-Z_]${name}[^a-zA-Z_]`).test(source);
    if (!used) continue;
    assert.ok(importBlock[0].includes(name), `${name} используется, но не импортирован`);
  }
});
