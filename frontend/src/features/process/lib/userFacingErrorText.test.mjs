import test from "node:test";
import assert from "node:assert/strict";

import { shortUserFacingError, toUserFacingErrorText } from "./userFacingErrorText.js";

test("toUserFacingErrorText extracts structured backend detail and never returns [object Object]", () => {
  const text = toUserFacingErrorText({
    detail: {
      code: "DIAGRAM_STATE_BASE_VERSION_REQUIRED",
      message: "Сохранение отклонено: отсутствует базовая версия диаграммы.",
    },
  });

  assert.equal(typeof text, "string");
  assert.equal(text.includes("[object Object]"), false);
  assert.match(text, /базовая версия диаграммы/i);
});

test("shortUserFacingError gracefully falls back to code for code-only structured payload", () => {
  const text = shortUserFacingError({
    detail: {
      code: "DIAGRAM_STATE_CONFLICT",
      server_current_version: 5,
      client_base_version: 4,
    },
  });

  assert.equal(text.includes("[object Object]"), false);
  assert.equal(text, "DIAGRAM_STATE_CONFLICT");
});

