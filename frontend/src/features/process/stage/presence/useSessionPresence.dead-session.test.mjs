import test from "node:test";
import assert from "node:assert/strict";

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import useSessionPresence from "./useSessionPresence.js";
import { clearSessionNotFound, markSessionNotFound } from "../../../session/sessionLiveness.js";

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.Element = previous.Element;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.Event = previous.Event;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };
  return { dom, root, cleanup };
}

function Harness({ expose, hookProps }) {
  const value = useSessionPresence(...hookProps);
  useEffect(() => {
    expose(value);
  }, [expose, value]);
  return null;
}

async function wait(ms = 24) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

test.beforeEach(() => {
  clearSessionNotFound();
});

// NB: heartbeatMs в хуке клампится Math.max(5000, ...), поэтому «тики»
// таймера симулируем прямыми вызовами heartbeat("interval") — это тот же
// коллбек, который дергает setInterval в проде.

test("presence poller stops after the first terminal 404 (P-1 D1)", async () => {
  const env = setupDom();
  const calls = [];
  let latest = null;
  let cleaned = false;
  const apiTouch = async () => {
    calls.push(Date.now());
    return { ok: false, status: 404, error: "session not found" };
  };
  try {
    await act(async () => {
      env.root.render(React.createElement(Harness, {
        expose: (value) => {
          latest = value;
        },
        hookProps: [
          "sess_dead_p1",
          { id: "user_me" },
          { apiTouch, apiLeave: async () => ({ ok: true }), heartbeatMs: 40 },
        ],
      }));
    });
    await wait(30);
    // Первый heartbeat ушёл и получил терминальный 404.
    assert.equal(calls.length, 1);
    assert.equal(latest.sessionDead, true);
    assert.equal(latest.lastError, "session_not_found");

    // «Тики» таймера после 404 НЕ ходят в сеть (таймер снят dead-эффектом,
    // а heartbeat дополнительно защищён guard'ом).
    for (let i = 0; i < 3; i += 1) {
      const tick = await act(async () => latest.heartbeat("interval"));
      assert.equal(tick.ok, false);
      assert.equal(tick.reason, "session_deleted");
    }
    assert.equal(calls.length, 1, "после 404 ни один heartbeat не уходит в сеть");

    // foreground-события (focus/visibilitychange) — тоже без сети.
    await act(async () => {
      env.dom.window.dispatchEvent(new env.dom.window.Event("focus"));
      env.dom.window.document.dispatchEvent(new env.dom.window.Event("visibilitychange"));
    });
    await wait(30);
    assert.equal(calls.length, 1, "foreground-триггеры подавлены на мёртвой сессии");

    // leave на unmount по мёртвой сессии — без 404-шума.
    await env.cleanup();
    cleaned = true;
    assert.equal(calls.length, 1);
  } finally {
    if (!cleaned) await env.cleanup().catch(() => {});
  }
});

test("presence poller keeps polling on network failure (404 ≠ network error)", async () => {
  const env = setupDom();
  const calls = [];
  let latest = null;
  let cleaned = false;
  const apiTouch = async () => {
    calls.push(Date.now());
    return { ok: false, status: 0, error: "Failed to fetch" };
  };
  try {
    await act(async () => {
      env.root.render(React.createElement(Harness, {
        expose: (value) => {
          latest = value;
        },
        hookProps: [
          "sess_flaky_p1",
          { id: "user_me" },
          { apiTouch, apiLeave: async () => ({ ok: true }), heartbeatMs: 40 },
        ],
      }));
    });
    await wait(30);
    assert.equal(calls.length, 1);
    assert.equal(latest.sessionDead, false);

    // Сетевой сбой: каждый «тик» продолжает ходить в сеть.
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await latest.heartbeat("interval");
      });
    }
    assert.equal(calls.length, 4, "сетевой сбой — поллинг продолжается");
    assert.equal(latest.sessionDead, false);

    await env.cleanup();
    cleaned = true;
  } finally {
    if (!cleaned) await env.cleanup().catch(() => {});
  }
});

test("presence poller keeps polling on 5xx (server error is not terminal)", async () => {
  const env = setupDom();
  const calls = [];
  let latest = null;
  let cleaned = false;
  const apiTouch = async () => {
    calls.push(Date.now());
    return { ok: false, status: 500, error: "internal server error" };
  };
  try {
    await act(async () => {
      env.root.render(React.createElement(Harness, {
        expose: (value) => {
          latest = value;
        },
        hookProps: [
          "sess_5xx_p1",
          { id: "user_me" },
          { apiTouch, apiLeave: async () => ({ ok: true }), heartbeatMs: 40 },
        ],
      }));
    });
    await wait(30);
    assert.equal(latest.sessionDead, false);
    await act(async () => {
      await latest.heartbeat("interval");
    });
    assert.equal(calls.length, 2, "5xx — поллинг продолжается");
    assert.equal(latest.sessionDead, false);

    await env.cleanup();
    cleaned = true;
  } finally {
    if (!cleaned) await env.cleanup().catch(() => {});
  }
});

test("presence does not start when session is already marked dead elsewhere", async () => {
  const env = setupDom();
  const calls = [];
  let cleaned = false;
  markSessionNotFound("sess_dead_elsewhere", { source: "save:xml" });
  const apiTouch = async () => {
    calls.push(Date.now());
    return { ok: true, ttl_seconds: 60, active_users: [] };
  };
  try {
    await act(async () => {
      env.root.render(React.createElement(Harness, {
        expose: () => {},
        hookProps: [
          "sess_dead_elsewhere",
          { id: "user_me" },
          { apiTouch, apiLeave: async () => ({ ok: true }), heartbeatMs: 40 },
        ],
      }));
    });
    await wait(120);
    assert.equal(calls.length, 0, "ни одного heartbeat по мёртвой сессии");

    await env.cleanup();
    cleaned = true;
  } finally {
    if (!cleaned) await env.cleanup().catch(() => {});
  }
});

test("presence stops when another subsystem marks the session dead mid-flight", async () => {
  const env = setupDom();
  const calls = [];
  let latest = null;
  let cleaned = false;
  const apiTouch = async () => {
    calls.push(Date.now());
    return { ok: true, ttl_seconds: 60, active_users: [] };
  };
  try {
    await act(async () => {
      env.root.render(React.createElement(Harness, {
        expose: (value) => {
          latest = value;
        },
        hookProps: [
          "sess_dead_race_p1",
          { id: "user_me" },
          { apiTouch, apiLeave: async () => ({ ok: true }), heartbeatMs: 40 },
        ],
      }));
    });
    await wait(30);
    assert.equal(calls.length, 1);
    assert.equal(latest.sessionDead, false);

    // Другая подсистема (например save) получила 404 и пометила сессию.
    await act(async () => {
      markSessionNotFound("sess_dead_race_p1", { source: "save:xml" });
    });
    await wait(30);
    assert.equal(latest.sessionDead, true);

    const tick = await act(async () => latest.heartbeat("interval"));
    assert.equal(tick.reason, "session_deleted");
    assert.equal(calls.length, 1, "после внешней пометки сеть не дёргается");

    await env.cleanup();
    cleaned = true;
  } finally {
    if (!cleaned) await env.cleanup().catch(() => {});
  }
});
