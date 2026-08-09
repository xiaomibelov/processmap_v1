// Org-drift fix: presence-404 НЕ всегда «сессия удалена» — confirm GET
// различает удаление (confirm 404 → dead-modal) и смену org-контекста
// (confirm 200 → dead-флаг НЕ ставится, мягкое уведомление orgDrift).
// Запуск: node --test src/features/process/stage/presence/useSessionPresence.org-drift.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import useSessionPresence from "./useSessionPresence.js";
import { clearSessionNotFound, isSessionNotFound } from "../../../session/sessionLiveness.js";

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

test("presence-404 + confirm 200 → org-drift: dead-флаг НЕ ставится, orgDrift=true", async () => {
  const env = setupDom();
  const touchCalls = [];
  const confirmCalls = [];
  let latest = null;
  let cleaned = false;
  const apiTouch = async () => {
    touchCalls.push(Date.now());
    return { ok: false, status: 404, error: "session not found" };
  };
  const apiGetSession = async () => {
    confirmCalls.push(Date.now());
    return { ok: true, status: 200, session: { id: "sess_drift", title: "Живая сессия" } };
  };
  try {
    await act(async () => {
      env.root.render(React.createElement(Harness, {
        expose: (value) => { latest = value; },
        hookProps: [
          "sess_drift",
          { id: "user_me" },
          { apiTouch, apiGetSession, apiLeave: async () => ({ ok: true }), heartbeatMs: 40 },
        ],
      }));
    });
    await wait(60); // mount-heartbeat + confirm

    assert.ok(touchCalls.length >= 1, "presence-heartbeat был");
    assert.equal(confirmCalls.length, 1, "ровно один confirm GET (не на каждом тике)");
    assert.equal(latest.sessionDead, false, "dead-флаг НЕ установлен");
    assert.equal(isSessionNotFound("sess_drift"), false, "реестр dead НЕ помечен");
    assert.equal(latest.orgDrift, true, "orgDrift-уведомление показано");
    assert.equal(latest.lastError, "org_drift");

    // повторные heartbeat-404 в том же эпизоде: без новых confirm и без dead
    const touchesBefore = touchCalls.length;
    await act(async () => { await latest.heartbeat("interval"); });
    await act(async () => { await latest.heartbeat("interval"); });
    await wait(30);
    assert.ok(touchCalls.length > touchesBefore, "heartbeat продолжается (не остановлен)");
    assert.equal(confirmCalls.length, 1, "confirm не плодится на каждом тике");
    assert.equal(latest.sessionDead, false);
    assert.equal(latest.orgDrift, true);

    // presence-200 завершает эпизод org-drift
    const okTouch = async () => ({ ok: true, status: 200, active_users: [], ttl_seconds: 60 });
    await act(async () => {
      env.root.render(React.createElement(Harness, {
        expose: (value) => { latest = value; },
        hookProps: [
          "sess_drift_2",
          { id: "user_me" },
          { apiTouch: okTouch, apiGetSession, apiLeave: async () => ({ ok: true }), heartbeatMs: 40 },
        ],
      }));
    });
    await wait(40);
    assert.equal(latest.orgDrift, false, "presence-200 сбрасывает эпизод");

    await env.cleanup();
    cleaned = true;
  } finally {
    if (!cleaned) await env.cleanup().catch(() => {});
  }
});

test("presence-404 + confirm 404 → реальное удаление: dead-modal как раньше", async () => {
  const env = setupDom();
  const confirmCalls = [];
  let latest = null;
  let cleaned = false;
  const apiTouch = async () => ({ ok: false, status: 404, error: "session not found" });
  const apiGetSession = async () => {
    confirmCalls.push(Date.now());
    return { ok: false, status: 404, error: "session not found" };
  };
  try {
    await act(async () => {
      env.root.render(React.createElement(Harness, {
        expose: (value) => { latest = value; },
        hookProps: [
          "sess_really_dead",
          { id: "user_me" },
          { apiTouch, apiGetSession, apiLeave: async () => ({ ok: true }), heartbeatMs: 40 },
        ],
      }));
    });
    await wait(60);

    assert.equal(confirmCalls.length, 1, "один confirm на эпизод 404");
    assert.equal(latest.sessionDead, true, "dead-флаг установлен");
    assert.equal(latest.lastError, "session_not_found");
    assert.equal(isSessionNotFound("sess_really_dead"), true, "реестр помечен терминально");
    assert.equal(latest.orgDrift, false, "orgDrift не показывается при реальном удалении");

    // дальнейшие heartbeat не уходят в сеть (dead-эффект снял таймер)
    const tick = await act(async () => latest.heartbeat("interval"));
    assert.equal(tick.reason, "session_deleted");

    await env.cleanup();
    cleaned = true;
  } finally {
    if (!cleaned) await env.cleanup().catch(() => {});
  }
});

test("guard: повторные heartbeat-404 во время pending confirm не плодят запросы", async () => {
  const env = setupDom();
  const touchCalls = [];
  const confirmCalls = [];
  let latest = null;
  let cleaned = false;
  let resolveConfirm = null;
  const apiTouch = async () => {
    touchCalls.push(Date.now());
    return { ok: false, status: 404, error: "session not found" };
  };
  const apiGetSession = async () => {
    confirmCalls.push(Date.now());
    return new Promise((resolve) => { resolveConfirm = resolve; }); // confirm «висит»
  };
  try {
    await act(async () => {
      env.root.render(React.createElement(Harness, {
        expose: (value) => { latest = value; },
        hookProps: [
          "sess_pending",
          { id: "user_me" },
          { apiTouch, apiGetSession, apiLeave: async () => ({ ok: true }), heartbeatMs: 40 },
        ],
      }));
    });
    await wait(40);
    assert.equal(confirmCalls.length, 1, "confirm стартовал один раз");
    assert.equal(latest.confirmPending, true, "confirm pending");

    // heartbeat во время confirm — приостановлен, без сети и без новых confirm
    for (let i = 0; i < 3; i += 1) {
      const tick = await act(async () => latest.heartbeat("interval"));
      assert.equal(tick.reason, "confirm_pending");
    }
    assert.equal(touchCalls.length, 1, "presence-запросы во время confirm не уходят");
    assert.equal(confirmCalls.length, 1, "confirm не дублируется");
    assert.equal(latest.sessionDead, false, "dead не ставится до результата confirm");
    assert.equal(isSessionNotFound("sess_pending"), false);

    // confirm резолвится 404 → dead
    await act(async () => {
      resolveConfirm({ ok: false, status: 404, error: "session not found" });
    });
    await wait(30);
    assert.equal(latest.sessionDead, true);
    assert.equal(latest.confirmPending, false);

    await env.cleanup();
    cleaned = true;
  } finally {
    if (!cleaned) await env.cleanup().catch(() => {});
  }
});

test("отсев саб-ресурсов не тронут: presence-404 «node not found» → ни confirm, ни dead", async () => {
  const env = setupDom();
  const confirmCalls = [];
  let latest = null;
  let cleaned = false;
  const apiTouch = async () => ({ ok: false, status: 404, error: "node not found" });
  const apiGetSession = async () => {
    confirmCalls.push(Date.now());
    return { ok: true, status: 200, session: { id: "sess_sub" } };
  };
  try {
    await act(async () => {
      env.root.render(React.createElement(Harness, {
        expose: (value) => { latest = value; },
        hookProps: [
          "sess_sub",
          { id: "user_me" },
          { apiTouch, apiGetSession, apiLeave: async () => ({ ok: true }), heartbeatMs: 40 },
        ],
      }));
    });
    await wait(50);
    assert.equal(confirmCalls.length, 0, "саб-ресурс 404 не запускает confirm");
    assert.equal(latest.sessionDead, false);
    assert.equal(latest.orgDrift, false);
    assert.equal(isSessionNotFound("sess_sub"), false);
    assert.equal(latest.lastError, "node not found", "обычная ошибка, как раньше");

    await env.cleanup();
    cleaned = true;
  } finally {
    if (!cleaned) await env.cleanup().catch(() => {});
  }
});
