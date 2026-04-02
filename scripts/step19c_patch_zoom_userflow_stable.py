from __future__ import annotations

from pathlib import Path
import re

APP = Path("backend/app/static/app.js")
CSS = Path("backend/app/static/styles.css")

JS_START = "// FPC_ZOOM_V3_START"
JS_END = "// FPC_ZOOM_V3_END"
CSS_START = "/* FPC_ZOOM_V3_START */"
CSS_END = "/* FPC_ZOOM_V3_END */"

JS_BLOCK = r'''
(function () {
  if (window.__fpcZoomV3Installed) return;
  window.__fpcZoomV3Installed = true;

  var ZOOM_STEP = 0.10;
  var ZOOM_MIN = 0.10;
  var ZOOM_MAX = 2.00;
  var FIT_PAD = 56;

  function _getSessionIdSafe() {
    try {
      return (typeof sessionId !== "undefined" && sessionId) ? sessionId : null;
    } catch (e) {
      return null;
    }
  }

  function _getSessionCacheSafe() {
    try {
      return (typeof sessionCache !== "undefined") ? sessionCache : null;
    } catch (e) {
      return null;
    }
  }

  function _rolesReady(s) {
    return !!(s && Array.isArray(s.roles) && s.roles.length > 0);
  }

  function _zoomKey() {
    var sid = _getSessionIdSafe();
    return sid ? ("fpc_zoom:" + sid) : null;
  }

  function _loadZoomState() {
    var key = _zoomKey();
    if (!key) return { mode: "fit", scale: 1.0 };
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return { mode: "fit", scale: 1.0 };
      var obj = JSON.parse(raw);
      var mode = (obj && obj.mode) ? String(obj.mode) : "fit";
      var scale = (obj && typeof obj.scale === "number") ? obj.scale : 1.0;
      if (!isFinite(scale)) scale = 1.0;
      scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));
      if (mode !== "fit" && mode !== "manual") mode = "fit";
      return { mode: mode, scale: scale };
    } catch (e) {
      return { mode: "fit", scale: 1.0 };
    }
  }

  function _saveZoomState(state) {
    var key = _zoomKey();
    if (!key) return;
    try {
      sessionStorage.setItem(key, JSON.stringify({ mode: state.mode, scale: state.scale }));
    } catch (e) {
      // ignore
    }
  }

  function _getGraphElsSafe() {
    try {
      if (typeof _graphEls === "function") return _graphEls();
    } catch (e) {
      // ignore
    }
    return {
      wrap: document.getElementById("graphWrap"),
      inner: document.getElementById("graphInner"),
      pre: document.getElementById("mermaid"),
    };
  }

  function _stageEl() {
    var ge = _getGraphElsSafe();
    return ge.pre || document.getElementById("mermaid") || document.querySelector(".mermaid") || null;
  }

  function _svgEl() {
    var st = _stageEl();
    if (!st) return null;
    return st.querySelector("svg");
  }

  function _setScale(scale) {
    var st = _stageEl();
    if (!st) return;

    scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));

    // prefer CSS zoom for correct scroll extents (Chrome)
    try {
      st.style.zoom = String(scale);
      st.style.transform = "";
      st.style.transformOrigin = "";
    } catch (e) {
      st.style.transformOrigin = "0 0";
      st.style.transform = "scale(" + scale + ")";
    }

    var lbl = document.getElementById("fpcZoomLabel");
    if (lbl) lbl.textContent = String(Math.round(scale * 100)) + "%";

    window.__fpcZoomState = { mode: "manual", scale: scale };
    _saveZoomState(window.__fpcZoomState);
  }

  function _measureSvgNatural(svg) {
    if (!svg) return null;

    try {
      if (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width && svg.viewBox.baseVal.height) {
        return { w: svg.viewBox.baseVal.width, h: svg.viewBox.baseVal.height };
      }
    } catch (e) {
      // ignore
    }

    try {
      var wAttr = parseFloat(svg.getAttribute("width") || "");
      var hAttr = parseFloat(svg.getAttribute("height") || "");
      if (isFinite(wAttr) && isFinite(hAttr) && wAttr > 0 && hAttr > 0) {
        return { w: wAttr, h: hAttr };
      }
    } catch (e) {
      // ignore
    }

    try {
      var bb = svg.getBBox();
      if (bb && bb.width > 0 && bb.height > 0) {
        return { w: bb.width, h: bb.height };
      }
    } catch (e) {
      // ignore
    }

    return null;
  }

  function _fitScale() {
    var ge = _getGraphElsSafe();
    var inner = ge.inner || (ge.wrap ? ge.wrap : null);
    var svg = _svgEl();
    if (!inner || !svg) return 1.0;

    var dims = _measureSvgNatural(svg);
    if (!dims) return 1.0;

    var rect = inner.getBoundingClientRect();
    var cw = rect.width;
    var ch = rect.height;
    if (!isFinite(cw) || !isFinite(ch) || cw <= 0 || ch <= 0) return 1.0;

    var sw = Math.max(1, dims.w);
    var sh = Math.max(1, dims.h);

    var s1 = (cw - FIT_PAD) / sw;
    var s2 = (ch - FIT_PAD) / sh;
    var s = Math.min(s1, s2);

    // IMPORTANT: do not auto-enlarge (prevents "giant" titles)
    s = Math.min(1.0, s);
    s = Math.max(ZOOM_MIN, Math.min(1.0, s));

    if (!isFinite(s) || s <= 0) s = 1.0;
    return s;
  }

  function _applyFit(persist) {
    var s = _fitScale();
    var st = _stageEl();
    if (!st) return;

    try {
      st.style.zoom = String(s);
      st.style.transform = "";
      st.style.transformOrigin = "";
    } catch (e) {
      st.style.transformOrigin = "0 0";
      st.style.transform = "scale(" + s + ")";
    }

    var lbl = document.getElementById("fpcZoomLabel");
    if (lbl) lbl.textContent = String(Math.round(s * 100)) + "%";

    window.__fpcZoomState = { mode: "fit", scale: s };
    if (persist !== false) _saveZoomState(window.__fpcZoomState);
  }

  function _ensureToolbar() {
    var ge = _getGraphElsSafe();
    var wrap = ge.wrap;
    if (!wrap) return;

    if (!wrap.classList.contains("fpc-zoom-host")) wrap.classList.add("fpc-zoom-host");

    var bar = document.getElementById("fpcZoomBar");
    if (bar) return;

    bar = document.createElement("div");
    bar.id = "fpcZoomBar";
    bar.className = "fpc-zoom-bar";

    bar.innerHTML =
      '<button type="button" class="fpc-zoom-btn" data-act="fit">Fit</button>' +
      '<button type="button" class="fpc-zoom-btn" data-act="out">−</button>' +
      '<button type="button" class="fpc-zoom-btn" data-act="in">+</button>' +
      '<button type="button" class="fpc-zoom-btn" data-act="p50">50%</button>' +
      '<button type="button" class="fpc-zoom-btn" data-act="p75">75%</button>' +
      '<button type="button" class="fpc-zoom-btn" data-act="p100">100%</button>' +
      '<span class="fpc-zoom-label" id="fpcZoomLabel">100%</span>';

    wrap.appendChild(bar);

    bar.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("button") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act") || "";

      var st = window.__fpcZoomState || _loadZoomState();
      var cur = (st && typeof st.scale === "number") ? st.scale : 1.0;

      if (act === "fit") {
        _applyFit(true);
        return;
      }

      if (act === "out") {
        _setScale(cur - ZOOM_STEP);
        return;
      }

      if (act === "in") {
        _setScale(cur + ZOOM_STEP);
        return;
      }

      if (act === "p50") return _setScale(0.50);
      if (act === "p75") return _setScale(0.75);
      if (act === "p100") return _setScale(1.00);
    });
  }

  function _openActorsIfPossible() {
    // Prefer explicit button from topbar
    var btn = document.getElementById("btnActors") || document.querySelector("[data-act='actors']") || null;
    if (btn && typeof btn.click === "function") {
      try { btn.click(); } catch (e) {}
      return true;
    }
    return false;
  }

  function _ensureUserflowGuards() {
    try {
      if (typeof sendNotes === "function" && !sendNotes.__fpcRolesGuard) {
        var _origSend = sendNotes;
        sendNotes = async function () {
          var s = _getSessionCacheSafe();
          if (s && !_rolesReady(s)) {
            _openActorsIfPossible();
            return;
          }
          return _origSend.apply(this, arguments);
        };
        sendNotes.__fpcRolesGuard = true;
      }
    } catch (e) {
      // ignore
    }

    try {
      if (typeof refresh === "function" && !refresh.__fpcUserflowWrap) {
        var _origRefresh = refresh;
        refresh = async function () {
          var r = await _origRefresh.apply(this, arguments);
          var s = _getSessionCacheSafe();
          if (s && !_rolesReady(s)) {
            _openActorsIfPossible();
          }
          return r;
        };
        refresh.__fpcUserflowWrap = true;
      }
    } catch (e) {
      // ignore
    }
  }

  function _afterMermaidRendered() {
    _ensureToolbar();

    var sid = _getSessionIdSafe();
    if (sid && window.__fpcZoomLastSid !== sid) {
      window.__fpcZoomLastSid = sid;
      window.__fpcZoomState = _loadZoomState();
    }

    var st = window.__fpcZoomState || _loadZoomState();

    // Apply *after* SVG appears; retry a couple of times for fonts/layout.
    function applyNow() {
      var svg = _svgEl();
      if (!svg) return false;
      if (st.mode === "manual") {
        _setScale(st.scale);
      } else {
        _applyFit(false);
      }
      return true;
    }

    if (!applyNow()) {
      setTimeout(applyNow, 60);
      setTimeout(applyNow, 220);
    } else {
      setTimeout(applyNow, 120);
    }
  }

  // wrap renderMermaid (works even if implementation changes)
  try {
    if (typeof renderMermaid === "function" && !renderMermaid.__fpcZoomWrapped) {
      var _origRM = renderMermaid;
      renderMermaid = async function () {
        var r = await _origRM.apply(this, arguments);
        _afterMermaidRendered();
        return r;
      };
      renderMermaid.__fpcZoomWrapped = true;
    }
  } catch (e) {
    // ignore
  }

  // resize -> re-fit when in fit mode
  var _rzT = null;
  window.addEventListener("resize", function () {
    if (_rzT) clearTimeout(_rzT);
    _rzT = setTimeout(function () {
      var st = window.__fpcZoomState || _loadZoomState();
      if (st.mode === "fit") _applyFit(false);
    }, 180);
  });

  _ensureUserflowGuards();
  _ensureToolbar();
})();
'''.strip() + "\n"

CSS_BLOCK = r'''
.fpc-zoom-host { position: relative; }

.fpc-zoom-bar {
  position: absolute;
  top: 14px;
  right: 18px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(20,24,32,0.72);
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.35);
  z-index: 20;
}

.fpc-zoom-btn {
  appearance: none;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  color: rgba(255,255,255,0.92);
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.fpc-zoom-btn:hover { background: rgba(255,255,255,0.10); }

.fpc-zoom-label {
  margin-left: 6px;
  font-size: 12px;
  color: rgba(255,255,255,0.72);
  min-width: 44px;
  text-align: right;
}
'''.strip() + "\n"


def _replace_or_append(text: str, start: str, end: str, body: str) -> str:
    pat = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    block = start + "\n" + body + end
    if pat.search(text):
        return pat.sub(block, text)
    return text.rstrip() + "\n\n" + block + "\n"


def main() -> None:
    if not APP.exists():
        raise SystemExit(f"missing: {APP}")
    if not CSS.exists():
        raise SystemExit(f"missing: {CSS}")

    app = APP.read_text(encoding="utf-8", errors="replace")
    css = CSS.read_text(encoding="utf-8", errors="replace")

    # Remove older known markers if present (best-effort, avoids duplicates)
    for a, b in [
        ("// STEP19B_ZOOM_START", "// STEP19B_ZOOM_END"),
        ("// STEP19C_ZOOM_START", "// STEP19C_ZOOM_END"),
    ]:
        pat = re.compile(re.escape(a) + r".*?" + re.escape(b), re.S)
        app = pat.sub("", app)

    app2 = _replace_or_append(app, JS_START, JS_END, JS_BLOCK)
    css2 = _replace_or_append(css, CSS_START, CSS_END, CSS_BLOCK)

    APP.write_text(app2, encoding="utf-8")
    CSS.write_text(css2, encoding="utf-8")

    print("patched:", str(APP))
    print("patched:", str(CSS))


if __name__ == "__main__":
    main()
