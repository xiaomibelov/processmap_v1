# RUNTIME_NAVIGATION — stage3/test-heartbeat-1781302150

## Runtime context
This contour is a **unit-test** contour for the React hook `useSessionPresence`. It does not require a live browser or the ProcessMap dev server. The "runtime" is the Node test runner + JSDOM environment used by `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs`.

## Entry point
```bash
cd /opt/processmap-test/frontend
npm test -- src/features/process/stage/presence/useSessionPresence.test.mjs
```

## Environment expectations
- Node.js test runner (`node --test`).
- `jsdom` provides `window`, `document`, `sessionStorage`, and event dispatch.
- `react-dom/test-utils` `act()` is used for renders and timers.

## Runtime assertions to verify
1. Tests run in an isolated jsdom per `setupDom()` call.
2. `sessionStorage` is reset per jsdom instance, making client-id stability tests meaningful.
3. `window.setInterval` / `window.clearInterval` are the jsdom implementations.
4. `document.visibilityState` can be mutated and `visibilitychange` dispatched.

## No live server required
Because this is a pure unit-test contour, Agent 3 does **not** need to curl `http://clearvestnic.ru:5180`. Runtime proof is the passing test output.
