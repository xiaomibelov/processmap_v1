// FPC_STORAGE_MODULE_V1
(function () {
  'use strict';

  const PREFIX = 'fpc:';

  function _k(name) {
    return PREFIX + name;
  }

  function _getRaw(key, defVal) {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? defVal : v;
    } catch (e) {
      return defVal;
    }
  }

  function _setRaw(key, val) {
    try {
      window.localStorage.setItem(key, String(val));
    } catch (e) {
      // ignore
    }
  }

  function _delRaw(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      // ignore
    }
  }

  function getLastSessionId() {
    return _getRaw(_k('lastSessionId'), '');
  }

  function setLastSessionId(id) {
    const key = _k('lastSessionId');
    if (!id) {
      _delRaw(key);
      return;
    }
    _setRaw(key, id);
  }

  function getLlmStrictMode() {
    // values: 'strict' | 'lenient'
    return _getRaw(_k('llmStrictMode'), 'strict');
  }

  function setLlmStrictMode(mode) {
    const m = (mode === 'lenient') ? 'lenient' : 'strict';
    _setRaw(_k('llmStrictMode'), m);
  }

  function getMermaidUserScale() {
    const raw = _getRaw(_k('mermaidUserScale'), '1');
    const x = parseFloat(raw);
    if (!isFinite(x) || x <= 0) return 1;
    // clamp a bit to avoid pathological transforms
    return Math.max(0.1, Math.min(2.0, x));
  }

  function setMermaidUserScale(x) {
    const n = parseFloat(String(x));
    if (!isFinite(n) || n <= 0) return;
    const v = Math.max(0.1, Math.min(2.0, n));
    _setRaw(_k('mermaidUserScale'), v);
  }

  function sessionKey(sessionId, name) {
    const sid = (sessionId || '').trim();
    return _k('s:' + (sid || 'anon') + ':' + name);
  }

  // expose
  window.FPCStorage = window.FPCStorage || {};
  window.FPCStorage.getLastSessionId = getLastSessionId;
  window.FPCStorage.setLastSessionId = setLastSessionId;
  window.FPCStorage.getLlmStrictMode = getLlmStrictMode;
  window.FPCStorage.setLlmStrictMode = setLlmStrictMode;
  window.FPCStorage.getMermaidUserScale = getMermaidUserScale;
  window.FPCStorage.setMermaidUserScale = setMermaidUserScale;
  window.FPCStorage.sessionKey = sessionKey;
})();
