#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

APP = ROOT / "backend/app/static/app.js"
CSS = ROOT / "backend/app/static/styles.css"
HTML = ROOT / "backend/app/static/index.html"
MOD_DIR = ROOT / "backend/app/static/mod"
ZOOM = MOD_DIR / "zoom.js"
NOTES = MOD_DIR / "notes_persist.js"

def die(msg: str) -> None:
    raise SystemExit(msg)

def read(p: Path) -> str:
    if not p.exists():
        die(f"missing: {p}")
    return p.read_text(encoding="utf-8")

def write(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8")

def patch_app_js(s: str) -> str:
    # Trim historically appended zoom/autofit blocks (they stack and cause scale drift/freezes)
    markers = [
        "// STEP18C3D_MERMAID_AUTOFIT",
        "// STEP18C3F_ZOOM_BEGIN",
        "// STEP19B_ZOOM_BEGIN",
        "// FPC_ZOOM_V3_START",
        "// STEP18C3G_LAYOUT_BEGIN",
        "// STEP18C3D:",
    ]
    cut = None
    for m in markers:
        i = s.find(m)
        if i != -1:
            cut = i if cut is None else min(cut, i)
    if cut is not None:
        s = s[:cut].rstrip() + "\n"

    # Hook zoom module after Mermaid finished rendering
    if "FPCZoom.afterRender" not in s and 'if (res && typeof res.then === "function") await res;' in s:
        s = s.replace(
            'if (res && typeof res.then === "function") await res;',
            'if (res && typeof res.then === "function") await res;\n    if (window.FPCZoom) window.FPCZoom.afterRender(sessionId);',
            1
        )

    # Hook notes persistence module on sessionId changes
    if "FPCNotesPersist.onSessionId" not in s and "function setSessionId(id)" in s:
        s = s.replace(
            "sessionId = id || null;",
            "sessionId = id || null;\n  if (window.FPCNotesPersist) window.FPCNotesPersist.onSessionId(sessionId);",
            1
        )

    # Restore notes on reload from backend session payload (and drafts from localStorage)
    if "FPCNotesPersist.onSessionLoaded" not in s and "sessionCache = s;" in s:
        s = s.replace(
            "sessionCache = s;",
            "sessionCache = s;\n  if (window.FPCNotesPersist) window.FPCNotesPersist.onSessionLoaded(sessionId, s);",
            1
        )

    return s

def patch_index_html(s: str) -> str:
    if "/static/mod/zoom.js" in s:
        return s

    insert = '  <script src="/static/mod/notes_persist.js"></script>\n  <script src="/static/mod/zoom.js"></script>\n'
    needle = '  <script src="/static/app.js"></script>'
    if needle not in s:
        die("index.html: cannot find app.js script tag")
    return s.replace(needle, insert + needle, 1)

def patch_styles_css(s: str) -> str:
    # Remove legacy zoomctl CSS block (.mermaid-zoomctl) if present
    s = re.sub(r'\n\.mermaid-zoomctl\s*\{.*?\n\}\n\n', '\n', s, flags=re.S)

    if "STEP20A: zoom+notes stabilization" not in s:
        s = s.rstrip() + "\n" + (
            "\n/* STEP20A: zoom+notes stabilization */\n"
            ".panelMermaid { position: relative; }\n"
            "#mermaid svg { max-width: none; }\n"
        )
    return s

ZOOM_JS = r"""(function(){
  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
  function key(sid){ return "fpc:zoomScale:" + (sid || ""); }
  function readScale(sid){
    try{
      var raw = localStorage.getItem(key(sid));
      var v = raw ? parseFloat(raw) : NaN;
      return isFinite(v) ? v : null;
    }catch(e){ return null; }
  }
  function writeScale(sid, v){
    try{ localStorage.setItem(key(sid), String(v)); }catch(e){}
  }

  function ensureBar(){
    var host = document.querySelector(".panelMermaid");
    if(!host) return null;
    var bar = document.getElementById("mzBar");
    if(bar) return bar;

    bar = document.createElement("div");
    bar.className = "mz-bar";
    bar.id = "mzBar";
    bar.innerHTML =
      '<button type="button" class="mz-btn" data-act="fit">Fit</button>' +
      '<button type="button" class="mz-btn" data-act="out">-</button>' +
      '<button type="button" class="mz-btn" data-act="in">+</button>' +
      '<button type="button" class="mz-btn" data-act="pct" data-pct="0.50">50%</button>' +
      '<button type="button" class="mz-btn" data-act="pct" data-pct="0.75">75%</button>' +
      '<button type="button" class="mz-btn" data-act="pct" data-pct="1.00">100%</button>' +
      '<span class="mz-label" id="mzLabel">100%</span>';

    bar.addEventListener("click", function(ev){
      var btn = ev.target && ev.target.closest ? ev.target.closest("button[data-act]") : null;
      if(!btn) return;
      var act = btn.getAttribute("data-act");
      if(!act) return;
      if(!window.FPCZoom) return;
      window.FPCZoom._handleAction(act, btn);
    });

    host.appendChild(bar);
    return bar;
  }

  function getSvg(){
    return document.querySelector("#mermaid svg");
  }

  function getBaseSize(svg){
    if(!svg) return null;
    var vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
    var bw = vb && vb.width ? vb.width : null;
    var bh = vb && vb.height ? vb.height : null;

    var aw = parseFloat(svg.getAttribute("width"));
    var ah = parseFloat(svg.getAttribute("height"));

    var w = (bw && isFinite(bw) ? bw : (isFinite(aw) ? aw : null));
    var h = (bh && isFinite(bh) ? bh : (isFinite(ah) ? ah : null));
    if(!w || !h) return null;
    return { w: w, h: h };
  }

  function viewportSize(){
    var body = document.querySelector(".panelMermaid .panelBody");
    if(!body) body = document.getElementById("mermaid");
    if(!body) return { w: 800, h: 500 };
    var r = body.getBoundingClientRect();
    return { w: Math.max(200, r.width), h: Math.max(200, r.height) };
  }

  function fitScale(base, viewport){
    var pad = 28;
    var sx = (viewport.w - pad) / base.w;
    var sy = (viewport.h - pad) / base.h;
    var s = Math.min(sx, sy);
    if(!isFinite(s) || s <= 0) s = 1;
    // Fit is intentionally capped to avoid "gigantic by default" behaviour
    return clamp(s, 0.20, 0.75);
  }

  function applyScale(svg, base, scale){
    svg.style.width = (base.w * scale) + "px";
    svg.style.height = (base.h * scale) + "px";
    svg.setAttribute("width", String(base.w * scale));
    svg.setAttribute("height", String(base.h * scale));
  }

  function setLabel(scale){
    var lab = document.getElementById("mzLabel");
    if(!lab) return;
    lab.textContent = Math.round(scale * 100) + "%";
  }

  var api = {
    _sid: null,
    _base: null,
    _scale: 1,

    afterRender: function(sessionId){
      this._sid = sessionId || this._sid;
      ensureBar();
      var svg = getSvg();
      if(!svg) return;

      var base = getBaseSize(svg);
      if(!base) return;
      this._base = base;

      var stored = readScale(this._sid);
      var scale = stored;
      if(scale === null){
        scale = fitScale(base, viewportSize());
        writeScale(this._sid, scale);
      }
      scale = clamp(scale, 0.20, 2.00);
      this._scale = scale;

      applyScale(svg, base, scale);
      setLabel(scale);
    },

    _setScale: function(scale){
      scale = clamp(scale, 0.20, 2.00);
      this._scale = scale;

      var svg = getSvg();
      if(!svg || !this._base) return;

      applyScale(svg, this._base, scale);
      setLabel(scale);
      if(this._sid) writeScale(this._sid, scale);
    },

    _handleAction: function(act, btn){
      if(act === "fit"){
        var svg = getSvg();
        if(!svg) return;
        var base = getBaseSize(svg);
        if(!base) return;
        this._base = base;
        this._setScale(fitScale(base, viewportSize()));
        return;
      }
      if(act === "in"){ this._setScale(this._scale * 1.20); return; }
      if(act === "out"){ this._setScale(this._scale / 1.20); return; }
      if(act === "pct"){
        var p = btn ? parseFloat(btn.getAttribute("data-pct")) : NaN;
        if(isFinite(p) && p > 0) this._setScale(p);
        return;
      }
    }
  };

  window.FPCZoom = api;
})();"""

NOTES_JS = r"""(function(){
  function keyDraft(sid){ return "fpc:notesDraft:" + (sid || ""); }
  function getNotesEl(){ return document.getElementById("notes"); }

  var installed = false;

  function installOnce(){
    if(installed) return;
    installed = true;
    var ta = getNotesEl();
    if(!ta) return;
    ta.addEventListener("input", function(){
      var sid = window.FPCNotesPersist ? window.FPCNotesPersist._sid : null;
      if(!sid) return;
      try{ localStorage.setItem(keyDraft(sid), ta.value); }catch(e){}
    });
  }

  var api = {
    _sid: null,

    onSessionId: function(sid){
      this._sid = sid;
      installOnce();
      var ta = getNotesEl();
      if(!ta) return;
      try{
        var draft = localStorage.getItem(keyDraft(sid));
        if(draft !== null && draft !== undefined){
          ta.value = draft;
        }
      }catch(e){}
    },

    onSessionLoaded: function(sid, session){
      this._sid = sid;
      installOnce();
      var ta = getNotesEl();
      if(!ta) return;

      var hasDraft = false;
      try{
        var draft = localStorage.getItem(keyDraft(sid));
        if(draft !== null && draft !== undefined){
          ta.value = draft;
          hasDraft = true;
        }
      }catch(e){}

      if(!hasDraft){
        if(session && typeof session.notes === "string"){
          ta.value = session.notes;
        }
      }
    }
  };

  window.FPCNotesPersist = api;
})();"""

def main() -> None:
    app = read(APP)
    css = read(CSS)
    html = read(HTML)

    app2 = patch_app_js(app)
    css2 = patch_styles_css(css)
    html2 = patch_index_html(html)

    write(APP, app2)
    write(CSS, css2)
    write(HTML, html2)

    MOD_DIR.mkdir(parents=True, exist_ok=True)
    write(ZOOM, ZOOM_JS)
    write(NOTES, NOTES_JS)

    print("OK: patched:")
    print(f" - {APP}")
    print(f" - {CSS}")
    print(f" - {HTML}")
    print(f" - {ZOOM}")
    print(f" - {NOTES}")

if __name__ == "__main__":
    main()

