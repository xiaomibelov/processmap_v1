import test from "node:test";
import assert from "node:assert/strict";

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import useSessionPresence, {
  getSessionPresenceClientId,
  normalizeSessionPresenceUsers,
} from "./useSessionPresence.js";

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

test("session presence client id is stable in per-tab sessionStorage", () => {
  const storage = new Map();
  const fakeStorage = {
    getItem: (key) => storage.get(key) || "",
    setItem: (key, value) => storage.set(key, value),
  };

  const first = getSessionPresenceClientId(fakeStorage);
  const second = getSessionPresenceClientId(fakeStorage);

  assert.ok(first);
  assert.equal(second, first);
});

test("normalizeSessionPresenceUsers maps backend shape to header model shape", () => {
  const users = normalizeSessionPresenceUsers([
    {
      user_id: "user_a",
      display_name: "Иван",
      email: "ivan@example.test",
      full_name: "Иван Петров",
      job_title: "Аналитик",
      last_seen_at: 123,
      is_current_user: true,
    },
  ]);

  assert.deepEqual(users, [
    {
      userId: "user_a",
      label: "Иван",
      email: "ivan@example.test",
      fullName: "Иван Петров",
      jobTitle: "Аналитик",
      lastSeenAt: 123000,
      isCurrentUser: true,
    },
  ]);
});

test("useSessionPresence heartbeats on mount and stops on unmount", async () => {
  const env = setupDom();
  const calls = [];
  let latest = null;
  let cleaned = false;
  const apiTouch = async (sessionId, payload) => {
    calls.push({ sessionId, payload });
    return {
      ok: true,
      ttl_seconds: 180,
      active_users: [
        { user_id: "user_me", display_name: "Я", last_seen_at: 100 },
        { user_id: "user_other", display_name: "Анна", last_seen_at: 100 },
      ],
    };
  };
  try {
    await act(async () => {
      env.root.render(React.createElement(Harness, {
        expose: (value) => {
          latest = value;
        },
        hookProps: [
          "sess_1",
          { id: "user_me", email: "me@example.test" },
          { apiTouch, heartbeatMs: 50 },
        ],
      }));
    });
    await wait(30);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].sessionId, "sess_1");
    assert.ok(calls[0].payload.clientId);
    assert.equal(calls[0].payload.surface, "process_stage");
    assert.equal(latest.activeUsers.length, 2);

    await env.cleanup();
    cleaned = true;
    await wait(80);
    assert.equal(calls.length, 1);
  } finally {
    if (!cleaned) {
      await env.cleanup().catch(() => {});
    }
  }
});

test("useSessionPresence keeps presence failure low-noise", async () => {
  const env = setupDom();
  let latest = null;
  const apiTouch = async () => ({ ok: false, error: "offline" });
  try {
    await act(async () => {
      env.root.render(React.createElement(Harness, {
        expose: (value) => {
          latest = value;
        },
        hookProps: [
          "sess_1",
          { id: "user_me" },
          { apiTouch, heartbeatMs: 5000 },
        ],
      }));
    });
    await wait(30);

    assert.deepEqual(latest.activeUsers, []);
    assert.equal(latest.lastError, "offline");
  } finally {
    await env.cleanup();
  }
});
