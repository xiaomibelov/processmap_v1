import test from "node:test";
import assert from "node:assert/strict";

import { okOrError } from "./apiCore.js";

test("okOrError normalizes structured detail object into readable error text", () => {
  const out = okOrError({
    ok: true,
    status: 409,
    data: {
      detail: {
        code: "DIAGRAM_STATE_CONFLICT",
        message: "Сервер отклонил сохранение: версия сессии изменилась.",
        server_current_version: 5,
      },
    },
  });

  assert.equal(out.ok, false);
  assert.equal(out.status, 409);
  assert.equal(out.error.includes("[object Object]"), false);
  assert.match(out.error, /версия сессии изменилась/i);
});

test("okOrError falls back to detail code when message is absent", () => {
  const out = okOrError({
    ok: true,
    status: 409,
    data: {
      detail: {
        code: "DIAGRAM_STATE_BASE_VERSION_REQUIRED",
      },
    },
  });

  assert.equal(out.ok, false);
  assert.equal(out.error, "DIAGRAM_STATE_BASE_VERSION_REQUIRED");
});

