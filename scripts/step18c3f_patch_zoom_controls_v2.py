from __future__ import annotations
from pathlib import Path

APP_JS = Path("backend/app/static/app.js")
CSS = Path("backend/app/static/styles.css")

JS_MARK = "STEP18C3F_ZOOM_CONTROLS"
CSS_MARK = "STEP18C3F_ZOOM_CONTROLS_CSS"

JS_ADDON = r"""
// STEP18C3F_ZOOM_CONTROLS
// Zoom controller for Mermaid: Fit / - / + / presets, implemented as a wrapper around window.fpcFitMermaid.
(function(){
  try {
    if (window.__fpcMermaidZoomCtlInstalled) return;
    window.__fpcMermaidZoomCtlInstalled = true;

    function qs(sel, root){ return (root||document).querySelector(sel); }

    function parseScale(transform){
      try {
        if (!transform) return null;
        var m = /scale\(([^)]+)\)/.exec(transform);
        if (!m) return null;
        var v = parseFloat(m[1]);
        return isFinite(v) && v > 0 ? v : null;
      } catch(e) { return null; }
    }

    function getWrap(){ return document.getElementById('mermaid'); }
    function getSvg(){ var w=getWrap(); return w ? w.querySelector('svg') : null; }

    function ensureCfg(){
      if (!window.fpcMermaidZoomCfg) {
        window.fpcMermaidZoomCfg = {
          zoom: 1.0,
          minZoom: 0.25,
          maxZoom: 2.50,
          step: 0.10
        };
      }
      return window.fpcMermaidZoomCfg;
    }

    function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

    function updateLabel(){
      var el = qs('.mermaid-zoomctl .mz-label');
      if (!el) return;
      var cfg = ensureCfg();
      var svg = getSvg();
      var current = svg ? (parseScale(svg.style.transform) || 1.0) : 1.0;
      el.textContent = Math.round(current * 100) + '%';
      var rel = qs('.mermaid-zoomctl .mz-rel');
      if (rel) rel.textContent = '×' + (cfg.zoom || 1).toFixed(2);
    }

    function applyZoom(){
      var cfg = ensureCfg();
      var svg = getSvg();
      if (!svg) return;

      var base = window.__fpcMermaidBaseScale;
      if (!(base > 0)) {
        base = parseScale(svg.style.transform) || 1.0;
        window.__fpcMermaidBaseScale = base;
      }

      var z = clamp(cfg.zoom || 1.0, cfg.minZoom || 0.25, cfg.maxZoom || 2.5);
      cfg.zoom = z;

      var finalScale = base * z;
      svg.style.transformOrigin = '0 0';
      svg.style.transform = 'scale(' + finalScale.toFixed(4) + ')';
      updateLabel();
    }

    function setZoomRel(z){
      var cfg = ensureCfg();
      cfg.zoom = z;
      applyZoom();
    }

    function stepZoom(dir){
      var cfg = ensureCfg();
      var step = cfg.step || 0.10;
      setZoomRel((cfg.zoom || 1.0) + (dir * step));
    }

    function setAbsPercent(pct){
      var svg = getSvg();
      if (!svg) return;

      var base = window.__fpcMermaidBaseScale;
      if (!(base > 0)) {
        base = parseScale(svg.style.transform) || 1.0;
        window.__fpcMermaidBaseScale = base;
      }

      var target = (pct/100.0);
      var z = target / base;
      setZoomRel(z);
    }

    function buildCtl(){
      var wrap = getWrap();
      if (!wrap) return null;
      if (qs('.mermaid-zoomctl', wrap)) return qs('.mermaid-zoomctl', wrap);

      wrap.classList.add('mermaid-wrap');

      var ctl = document.createElement('div');
      ctl.className = 'mermaid-zoomctl';
      ctl.innerHTML = `
        <button type="button" class="mz-btn" data-act="fit">Fit</button>
        <button type="button" class="mz-btn" data-act="minus">−</button>
        <button type="button" class="mz-btn" data-act="plus">+</button>
        <button type="button" class="mz-btn" data-act="p50">50%</button>
        <button type="button" class="mz-btn" data-act="p75">75%</button>
        <button type="button" class="mz-btn" data-act="p100">100%</button>
        <span class="mz-sep"></span>
        <span class="mz-label">—</span>
        <span class="mz-rel">×1.00</span>
      `;

      ctl.addEventListener('click', function(ev){
        var t = ev.target;
        if (!t || !t.getAttribute) return;
        var act = t.getAttribute('data-act');
        if (!act) return;

        ev.preventDefault();

        if (act === 'fit') {
          ensureCfg().zoom = 1.0;
          if (typeof window.fpcFitMermaid === 'function') {
            try { window.fpcFitMermaid(window.fpcMermaidFitCfg || undefined); } catch(e) {}
          }
          return;
        }
        if (act === 'minus') return stepZoom(-1);
        if (act === 'plus') return stepZoom(+1);
        if (act === 'p50') return setAbsPercent(50);
        if (act === 'p75') return setAbsPercent(75);
        if (act === 'p100') return setAbsPercent(100);
      });

      wrap.appendChild(ctl);
      updateLabel();
      return ctl;
    }

    function wrapFitMermaid(){
      if (typeof window.fpcFitMermaid !== 'function') return;
      if (window.__fpcFitMermaidOrig) return;

      window.__fpcFitMermaidOrig = window.fpcFitMermaid;
      window.fpcFitMermaid = function(cfg){
        try { window.__fpcFitMermaidOrig(cfg); } catch(e) {}

        try {
          var svg = getSvg();
          if (svg) {
            var base = parseScale(svg.style.transform) || 1.0;
            window.__fpcMermaidBaseScale = base;
          }
          buildCtl();
          applyZoom();
        } catch(e) {}
      };
    }

    function install(){
      ensureCfg();
      wrapFitMermaid();

      var wrap = getWrap();
      if (!wrap) return;

      var obs = new MutationObserver(function(){
        try { buildCtl(); applyZoom(); } catch(e) {}
      });
      obs.observe(wrap, { childList: true, subtree: true });

      buildCtl();
      setTimeout(function(){ try { applyZoom(); } catch(e) {} }, 120);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install);
    } else {
      install();
    }
  } catch(e) {}
})();
"""

CSS_ADDON = r"""
/* STEP18C3F_ZOOM_CONTROLS_CSS
   Minimal zoom controls overlay for Mermaid panel.
*/
.mermaid-wrap { position: relative; }
.mermaid-zoomctl {
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(10, 12, 16, 0.55);
  border: 1px solid rgba(255,255,255,0.12);
  backdrop-filter: blur(10px);
  z-index: 20;
  user-select: none;
}
.mermaid-zoomctl .mz-btn {
  appearance: none;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.92);
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 10px;
  cursor: pointer;
}
.mermaid-zoomctl .mz-btn:hover { background: rgba(255,255,255,0.10); }
.mermaid-zoomctl .mz-btn:active { transform: translateY(1px); }
.mermaid-zoomctl .mz-sep { width: 1px; height: 18px; background: rgba(255,255,255,0.12); margin: 0 4px; }
.mermaid-zoomctl .mz-label {
  font-size: 12px;
  color: rgba(255,255,255,0.92);
  padding-left: 2px;
}
.mermaid-zoomctl .mz-rel {
  font-size: 11px;
  color: rgba(255,255,255,0.70);
  padding-left: 2px;
}
"""

def append_once(path: Path, marker: str, addon: str) -> bool:
    s = path.read_text(encoding="utf-8", errors="replace")
    if marker in s:
        print(f"{path}: marker exists; skip")
        return False
    path.write_text(s.rstrip() + "

" + addon.strip() + "
", encoding="utf-8")
    print(f"{path}: appended {marker}")
    return True

def main():
    c1 = append_once(APP_JS, JS_MARK, JS_ADDON)
    c2 = append_once(CSS, CSS_MARK, CSS_ADDON)
    print("changed:", c1 or c2)

if __name__ == "__main__":
    main()
