import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = jsdom.window.DOMParser;
globalThis.XMLSerializer = jsdom.window.XMLSerializer;

import { sessionLoader } from "../sessionLoader.js";
import { sessionCache } from "../sessionCache.js";
import { clearSession } from "../../../lib/casVersionTracker.js";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:task id="Activity_1" />
  </bpmn:process>
</bpmn:definitions>`;

// Minimal React mock for node:test (mirrors actual hook implementation)
let hookState = new Map();
let hookIndex = 0;
let effectQueue = [];
let cleanupQueue = [];
let effectDeps = new Map();
let currentComponent = null;

function resetHooks() {
  hookState = new Map();
  hookIndex = 0;
  effectQueue = [];
  cleanupQueue = [];
  effectDeps = new Map();
  currentComponent = null;
}

function useState(initial) {
  const key = `${currentComponent}_${hookIndex++}`;
  if (!hookState.has(key)) {
    hookState.set(key, typeof initial === "function" ? initial() : initial);
  }
  const value = hookState.get(key);
  const setValue = (next) => {
    const resolved = typeof next === "function" ? next(hookState.get(key)) : next;
    hookState.set(key, resolved);
  };
  return [value, setValue];
}

function useRef(initial) {
  const key = `${currentComponent}_${hookIndex++}`;
  if (!hookState.has(key)) {
    hookState.set(key, { current: initial });
  }
  return hookState.get(key);
}

function useCallback(fn, deps) {
  const key = `${currentComponent}_${hookIndex++}`;
  hookState.set(key, { fn, deps });
  return fn;
}

function depsChanged(prev, next) {
  if (!prev) return true;
  if (!Array.isArray(next)) return true;
  if (prev.length !== next.length) return true;
  return next.some((val, idx) => val !== prev[idx]);
}

function useEffect(fn, deps) {
  effectQueue.push({ fn, deps });
}

function asText(value) {
  return String(value || "").trim();
}

function useSessionLoader(sessionId) {
  const sid = asText(sessionId);
  const [data, setData] = useState(() => (sid ? sessionCache.get(sid) : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const activeSidRef = useRef(sid);

  useEffect(() => {
    activeSidRef.current = sid;
  }, [sid]);

  const load = useCallback(
    async ({ force = false } = {}) => {
      const currentSid = activeSidRef.current;
      if (!currentSid) {
        setData(null);
        setError(null);
        return { ok: false, error: "missing session id" };
      }
      setLoading(true);
      setError(null);
      try {
        const result = await sessionLoader.load(currentSid, { force });
        if (activeSidRef.current === currentSid) {
          if (result.ok) {
            setData(result.data);
            setError(null);
          } else {
            setError(result.error || "load failed");
          }
        }
        return result;
      } catch (err) {
        const message = err?.message || String(err);
        if (activeSidRef.current === currentSid) {
          setError(message);
        }
        return { ok: false, error: message };
      } finally {
        if (activeSidRef.current === currentSid) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const reload = useCallback(() => load({ force: true }), [load]);

  useEffect(() => {
    if (!sid) {
      setData(null);
      setError(null);
      setLoading(false);
      return () => {};
    }
    const cached = sessionCache.get(sid);
    if (cached && cached !== data) {
      setData(cached);
    }
    setLoading(true);
    let cancelled = false;
    sessionLoader.load(sid).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error || "load failed");
      }
    });
    const unsubscribe = sessionCache.subscribe(sid, (event) => {
      if (cancelled) return;
      if (event.type === "set" || event.type === "update") {
        setData(event.data);
      } else if (event.type === "invalidate" || event.type === "delete" || event.type === "evict") {
        setData(null);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sid]);

  return { data, loading, error, load, reload, sessionId: sid };
}

function runEffects() {
  for (const cleanup of cleanupQueue) {
    try { cleanup(); } catch { /* ignore */ }
  }
  cleanupQueue = [];
  for (let i = 0; i < effectQueue.length; i++) {
    const { fn, deps } = effectQueue[i];
    const key = `${currentComponent}_${i}`;
    if (depsChanged(effectDeps.get(key), deps)) {
      effectDeps.set(key, deps ? [...deps] : undefined);
      const cleanup = fn();
      if (typeof cleanup === "function") cleanupQueue.push(cleanup);
    }
  }
  effectQueue = [];
}

function renderHookWithRerun(fn, props) {
  hookIndex = 0;
  effectQueue = [];
  currentComponent = "test";
  let result = fn(props);
  const stateBefore = new Map(hookState);
  runEffects();
  const stateChanged = Array.from(hookState.keys()).some(
    (key) => hookState.get(key) !== stateBefore.get(key),
  );
  if (stateChanged) {
    hookIndex = 0;
    effectQueue = [];
    result = fn(props);
  }
  return { result };
}

function renderHook(fn, props) {
  return renderHookWithRerun(fn, props);
}

function rerenderHook(fn, props) {
  return renderHookWithRerun(fn, props);
}

function resetState() {
  sessionCache.clear();
  clearSession("use-loader-1");
}

function installMockFetch() {
  const prevFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const u = String(url);
    if (u.includes("/api/sessions/") && u.includes("/bpmn")) {
      return new Response(SAMPLE_XML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }
    if (u.includes("/api/sessions/")) {
      return new Response(JSON.stringify({
        ok: true,
        id: "use-loader-1",
        session_id: "use-loader-1",
        title: "Hook Test Session",
        diagram_state_version: 3,
        bpmn_meta: { version: 1 },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  };
  return { calls, restore: () => { globalThis.fetch = prevFetch; } };
}

test("returns loading initially then data after load", async () => {
  resetState();
  resetHooks();
  const { calls, restore } = installMockFetch();
  try {
    const { result } = renderHook(useSessionLoader, "use-loader-1");
    assert.equal(result.loading, true);
    assert.equal(result.sessionId, "use-loader-1");

    await new Promise((resolve) => setTimeout(resolve, 20));
    const { result: result2 } = rerenderHook(useSessionLoader, "use-loader-1");
    assert.equal(result2.loading, false);
    assert.equal(result2.data?.sessionId, "use-loader-1");
    assert.equal(result2.data?.session.title, "Hook Test Session");
  } finally {
    restore();
  }
});

test("reacts to cache update", async () => {
  resetState();
  resetHooks();
  const { restore } = installMockFetch();
  try {
    renderHook(useSessionLoader, "use-loader-1");
    await new Promise((resolve) => setTimeout(resolve, 20));

    sessionCache.update("use-loader-1", { diagramStateVersion: 99 });
    const { result } = rerenderHook(useSessionLoader, "use-loader-1");
    assert.equal(result.data?.diagramStateVersion, 99);
  } finally {
    restore();
  }
});

test("reload returns fresh data", async () => {
  resetState();
  resetHooks();
  const { calls, restore } = installMockFetch();
  try {
    const { result } = renderHook(useSessionLoader, "use-loader-1");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await result.reload();
    const { result: result2 } = rerenderHook(useSessionLoader, "use-loader-1");
    assert.equal(result2.data?.sessionId, "use-loader-1");
    assert.ok(calls.filter((u) => u.includes("/api/sessions/")).length >= 4);
  } finally {
    restore();
  }
});

test("clears data when sessionId becomes empty", async () => {
  resetState();
  resetHooks();
  const { restore } = installMockFetch();
  try {
    const { result } = renderHook(useSessionLoader, "use-loader-1");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const { result: result2 } = rerenderHook(useSessionLoader, "");
    assert.equal(result2.data, null);
    assert.equal(result2.loading, false);
  } finally {
    restore();
  }
});
