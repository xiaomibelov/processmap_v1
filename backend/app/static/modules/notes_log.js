/* Food Process Copilot — Notes log + draft persistence (STEP20P2)
   - Renders sessionCache.notes into a read-only log area above the notes textarea
   - Persists draft notes per-session in localStorage
   - Safe wrappers around refresh() and sendNotes()
*/
(function () {
  "use strict";

  const KEY_PREFIX = "fpc_notes_draft_v1:";
  const EMPTY_TEXT = "—";

  function safeSessionId() {
    try {
      return (window.sessionId || null);
    } catch (e) {
      return null;
    }
  }

  function keyDraft(sessionId) {
    return KEY_PREFIX + String(sessionId || "none");
  }

  function $(id) {
    return document.getElementById(id);
  }

  function ensureLogEl() {
    const ta = $("notes");
    if (!ta) return null;

    let log = $("notesLog");
    if (log) return log;

    log = document.createElement("div");
    log.id = "notesLog";
    log.className = "notes-log";
    log.setAttribute("role", "log");
    log.setAttribute("aria-label", "История заметок");

    // Insert before the textarea (above input)
    const parent = ta.parentElement;
    if (parent) parent.insertBefore(log, ta);

    return log;
  }

  let _lastRendered = null;

  function renderNotesText(text) {
    const log = ensureLogEl();
    if (!log) return;

    const t = (typeof text === "string" ? text : "");
    const trimmed = t.trim();

    if (_lastRendered === trimmed) return;
    _lastRendered = trimmed;

    log.textContent = trimmed ? trimmed : EMPTY_TEXT;

    // Keep the newest notes visible
    try {
      log.scrollTop = log.scrollHeight;
    } catch (e) {}
  }

  function renderFromSessionCache() {
    try {
      const s = window.sessionCache;
      if (!s) return;
      renderNotesText(s.notes || "");
    } catch (e) {}
  }

  function attachDraftPersistence() {
    const ta = $("notes");
    if (!ta) return;

    const sid = safeSessionId();
    if (!sid) return;

    try {
      const saved = localStorage.getItem(keyDraft(sid));
      if (saved && !ta.value) ta.value = saved;
    } catch (e) {}

    let t = null;
    ta.addEventListener("input", function () {
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        try {
          localStorage.setItem(keyDraft(sid), ta.value || "");
        } catch (e) {}
      }, 180);
    });
  }

  function clearDraft() {
    const sid = safeSessionId();
    if (!sid) return;

    try {
      localStorage.removeItem(keyDraft(sid));
    } catch (e) {}

    try {
      const ta = $("notes");
      if (ta) ta.value = "";
    } catch (e) {}
  }

  function wrapGlobalFn(fnName, wrapFn) {
    try {
      const orig = window[fnName];
      if (typeof orig !== "function") return false;
      if (orig && orig.__fpc_wrapped) return true;

      const wrapped = wrapFn(orig);
      wrapped.__fpc_wrapped = true;
      window[fnName] = wrapped;
      return true;
    } catch (e) {
      return false;
    }
  }

  function tryHook() {
    // Wrap refresh(): after it updates sessionCache, render notes log
    wrapGlobalFn("refresh", function (orig) {
      return async function () {
        const r = await orig.apply(this, arguments);
        renderFromSessionCache();
        return r;
      };
    });

    // Wrap sendNotes(): after successful send, clear draft (refresh wrapper will re-render)
    wrapGlobalFn("sendNotes", function (orig) {
      return async function () {
        const r = await orig.apply(this, arguments);
        // If sendNotes didn't throw — assume success path
        clearDraft();
        return r;
      };
    });

    // One-time DOM setup (idempotent)
    ensureLogEl();
    attachDraftPersistence();

    // If sessionCache already exists (hard refresh), render immediately
    renderFromSessionCache();
  }

  function boot() {
    if (window.__fpc_notes_log_booted) return;
    window.__fpc_notes_log_booted = true;

    // Try now, and keep retrying briefly until app.js defines functions
    tryHook();

    let n = 0;
    const timer = setInterval(function () {
      n += 1;
      tryHook();
      if (n >= 40) clearInterval(timer); // ~6s max
    }, 150);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
