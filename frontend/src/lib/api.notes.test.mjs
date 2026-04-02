import test from "node:test";
import assert from "node:assert/strict";

import { apiPostNote } from "./api.js";

test("apiPostNote: normalizes successful response notes without runtime ReferenceError", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({
          id: "sess_1",
          notes: "Готово к выдаче",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const out = await apiPostNote("sess_1", { notes: "Готово к выдаче" });
    assert.equal(out.ok, true);
    assert.match(String(calls[0]?.url || ""), /\/api\/sessions\/sess_1\/notes$/);
    assert.equal(Array.isArray(out?.session?.notes), true);
    assert.equal(String(out?.session?.notes?.[0]?.text || ""), "Готово к выдаче");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

