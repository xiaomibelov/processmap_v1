import assert from "node:assert/strict";
import test from "node:test";

import { resolveSessionNavNoticeCopy } from "./sessionNavNoticeUi.js";

test("LEAVE_FLUSH_FAILED uses save/leave specific notice copy", () => {
  const copy = resolveSessionNavNoticeCopy({
    code: "LEAVE_FLUSH_FAILED",
  });

  assert.equal(copy.title, "Сохранение не завершено");
  assert.match(copy.fallbackMessage, /Не удалось сохранить изменения перед выходом/);
});

test("generic nav notice keeps session unavailable copy", () => {
  const copy = resolveSessionNavNoticeCopy({
    code: "SESSION_NAV_FAILED",
  });

  assert.equal(copy.title, "Сессия недоступна");
  assert.match(copy.fallbackMessage, /Не удалось открыть текущую сессию/);
});
