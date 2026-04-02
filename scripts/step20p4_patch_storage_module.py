from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

INDEX = ROOT / "backend/app/static/index.html"
APPJS = ROOT / "backend/app/static/app.js"
MODDIR = ROOT / "backend/app/static/modules"
STORAGE = MODDIR / "storage.js"


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def _write(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8")


def write_storage_module() -> None:
    marker = "// FPC_STORAGE_MODULE_V1"
    if STORAGE.exists() and marker in _read(STORAGE):
        return

    s = f"""{marker}
(function () {{
  'use strict';

  const PREFIX = 'fpc:';

  function _k(name) {{
    return PREFIX + name;
  }}

  function _getRaw(key, defVal) {{
    try {{
      const v = window.localStorage.getItem(key);
      return v === null ? defVal : v;
    }} catch (e) {{
      return defVal;
    }}
  }}

  function _setRaw(key, val) {{
    try {{
      window.localStorage.setItem(key, String(val));
    }} catch (e) {{
      // ignore
    }}
  }}

  function _delRaw(key) {{
    try {{
      window.localStorage.removeItem(key);
    }} catch (e) {{
      // ignore
    }}
  }}

  function getLastSessionId() {{
    return _getRaw(_k('lastSessionId'), '');
  }}

  function setLastSessionId(id) {{
    const key = _k('lastSessionId');
    if (!id) {{
      _delRaw(key);
      return;
    }}
    _setRaw(key, id);
  }}

  function getLlmStrictMode() {{
    // values: 'strict' | 'lenient'
    return _getRaw(_k('llmStrictMode'), 'strict');
  }}

  function setLlmStrictMode(mode) {{
    const m = (mode === 'lenient') ? 'lenient' : 'strict';
    _setRaw(_k('llmStrictMode'), m);
  }}

  function getMermaidUserScale() {{
    const raw = _getRaw(_k('mermaidUserScale'), '1');
    const x = parseFloat(raw);
    if (!isFinite(x) || x <= 0) return 1;
    // clamp a bit to avoid pathological transforms
    return Math.max(0.1, Math.min(2.0, x));
  }}

  function setMermaidUserScale(x) {{
    const n = parseFloat(String(x));
    if (!isFinite(n) || n <= 0) return;
    const v = Math.max(0.1, Math.min(2.0, n));
    _setRaw(_k('mermaidUserScale'), v);
  }}

  function sessionKey(sessionId, name) {{
    const sid = (sessionId || '').trim();
    return _k('s:' + (sid || 'anon') + ':' + name);
  }}

  // expose
  window.FPCStorage = window.FPCStorage || {{}};
  window.FPCStorage.getLastSessionId = getLastSessionId;
  window.FPCStorage.setLastSessionId = setLastSessionId;
  window.FPCStorage.getLlmStrictMode = getLlmStrictMode;
  window.FPCStorage.setLlmStrictMode = setLlmStrictMode;
  window.FPCStorage.getMermaidUserScale = getMermaidUserScale;
  window.FPCStorage.setMermaidUserScale = setMermaidUserScale;
  window.FPCStorage.sessionKey = sessionKey;
}})();
"""

    _write(STORAGE, s)


def patch_index_html() -> None:
    s = _read(INDEX)
    if "/static/modules/storage.js" in s:
        return

    # insert before app.js include
    m = re.search(r"(<script\s+src=\"/static/app\.js\?v=[^\"]+\"\s*></script>)", s)
    if not m:
        raise RuntimeError("index.html: cannot find app.js script include")

    inject = "\n    <script src=\"/static/modules/storage.js?v=step20p4\"></script>\n"
    s2 = s[: m.start()] + inject + s[m.start() :]
    _write(INDEX, s2)


def _find_function_span(js: str, name: str) -> tuple[int, int] | None:
    # find 'function name(' and then match braces safely
    m = re.search(r"\bfunction\s+" + re.escape(name) + r"\s*\(", js)
    if not m:
        return None

    i = m.start()
    # find opening brace
    brace = js.find("{", m.end())
    if brace == -1:
        return None

    # simple JS brace matcher with string/comment skipping
    depth = 0
    in_s = None  # quote char
    in_line = False
    in_block = False
    esc = False

    j = brace
    while j < len(js):
        ch = js[j]
        nxt = js[j + 1] if j + 1 < len(js) else ""

        if in_line:
            if ch == "\n":
                in_line = False
            j += 1
            continue

        if in_block:
            if ch == "*" and nxt == "/":
                in_block = False
                j += 2
                continue
            j += 1
            continue

        if in_s:
            if esc:
                esc = False
                j += 1
                continue
            if ch == "\\":
                esc = True
                j += 1
                continue
            if ch == in_s:
                in_s = None
                j += 1
                continue
            j += 1
            continue

        # not in string/comment
        if ch == "/" and nxt == "/":
            in_line = True
            j += 2
            continue
        if ch == "/" and nxt == "*":
            in_block = True
            j += 2
            continue
        if ch in ("'", '"', "`"):
            in_s = ch
            j += 1
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i, j + 1
        j += 1

    return None


def _replace_function(js: str, name: str, replacement: str) -> str:
    span = _find_function_span(js, name)
    if not span:
        return js
    a, b = span
    return js[:a] + replacement + js[b:]


def patch_app_js_bridge() -> None:
    js = _read(APPJS)

    # If there are existing implementations, turn them into thin wrappers
    # so future modules can own the storage logic.
    wrappers = {
        "getLastSessionId": "function getLastSessionId() {\n  if (window.FPCStorage && window.FPCStorage.getLastSessionId) return window.FPCStorage.getLastSessionId();\n  try { return window.localStorage.getItem('fpc:lastSessionId') || ''; } catch (e) { return ''; }\n}\n",
        "setLastSessionId": "function setLastSessionId(id) {\n  if (window.FPCStorage && window.FPCStorage.setLastSessionId) return window.FPCStorage.setLastSessionId(id);\n  try { if (!id) { window.localStorage.removeItem('fpc:lastSessionId'); return; } window.localStorage.setItem('fpc:lastSessionId', id); } catch (e) {}\n}\n",
        "getLlmStrictMode": "function getLlmStrictMode() {\n  if (window.FPCStorage && window.FPCStorage.getLlmStrictMode) return window.FPCStorage.getLlmStrictMode();\n  try { return window.localStorage.getItem('fpc:llmStrictMode') || 'strict'; } catch (e) { return 'strict'; }\n}\n",
        "setLlmStrictMode": "function setLlmStrictMode(mode) {\n  if (window.FPCStorage && window.FPCStorage.setLlmStrictMode) return window.FPCStorage.setLlmStrictMode(mode);\n  try { window.localStorage.setItem('fpc:llmStrictMode', (mode === 'lenient') ? 'lenient' : 'strict'); } catch (e) {}\n}\n",
    }

    changed = False
    for fn, rep in wrappers.items():
        before = js
        js = _replace_function(js, fn, rep)
        if js != before:
            changed = True

    # Add a small comment marker so it's obvious this file expects storage module.
    marker = "// ==== Storage (modules/storage.js) ===="
    if marker not in js:
        # insert after first 'use strict' if present, else at top
        m = re.search(r"\"use strict\";\s*\n", js)
        if m:
            pos = m.end()
            js = js[:pos] + "\n" + marker + "\n" + js[pos:]
        else:
            js = marker + "\n" + js
        changed = True

    if changed:
        _write(APPJS, js)


def main() -> None:
    write_storage_module()
    patch_index_html()
    patch_app_js_bridge()
    print("step20p4: storage module written + index/app bridged")


if __name__ == "__main__":
    main()
