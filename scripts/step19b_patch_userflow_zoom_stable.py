from __future__ import annotations
from pathlib import Path
import re

APP_JS = Path("backend/app/static/app.js")
CSS = Path("backend/app/static/styles.css")

BEGIN = "// STEP19B_ZOOM_BEGIN"
END = "// STEP19B_ZOOM_END"

JS_BLOCK = r"""
// STEP19B_ZOOM_BEGIN
(function(){
  const KEY_PREFIX = "fpc_mz_v2:";
  const didAuto = new Set();

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function byId(id){ return document.getElementById(id); }

  function getWrap(){ return byId("graphWrap"); }
  function getInner(){ return byId("graphInner"); }
  function getSvg(){
    const inner = getInner();
    return inner ? inner.querySelector("svg") : null;
  }

  function getSessionIdSafe(){
    try { return (typeof getSessionId === "function") ? getSessionId() : null; } catch { return null; }
  }

  function loadState(sid){
    if (!sid) return null;
    try {
      const raw = localStorage.getItem(KEY_PREFIX + sid);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o.scale !== "number") return null;
      return {
        scale: clamp(o.scale, 0.25, 2.0),
        tx: (typeof o.tx === "number") ? o.tx : 0,
        ty: (typeof o.ty === "number") ? o.ty : 0,
      };
    } catch { return null; }
  }

  function saveState(sid, st){
    if (!sid) return;
    try { localStorage.setItem(KEY_PREFIX + sid, JSON.stringify(st)); } catch {}
  }

  function ensureBar(){
    const wrap = getWrap();
    if (!wrap) return;
    if (byId("mermaidZoomBar")) return;

    const bar = document.createElement("div");
    bar.id = "mermaidZoomBar";
    bar.className = "mz-bar";
    bar.innerHTML =
      '<button type="button" class="mz-btn" data-act="fit">Fit</button>' +
      '<button type="button" class="mz-btn" data-act="out">−</button>' +
      '<button type="button" class="mz-btn" data-act="in">+</button>' +
      '<button type="button" class="mz-btn" data-scale="0.5">50%</button>' +
      '<button type="button" class="mz-btn" data-scale="0.75">75%</button>' +
      '<button type="button" class="mz-btn" data-scale="1">100%</button>' +
      '<span class="mz-label" id="mzLabel">100%</span>';

    bar.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const act = t.getAttribute("data-act");
      const sc = t.getAttribute("data-scale");
      const sid = getSessionIdSafe();
      if (!sid) return;

      if (act === "fit") { fitAndApply(sid, true); return; }
      if (act === "in") { bumpScale(sid, 1.15); return; }
      if (act === "out") { bumpScale(sid, 1/1.15); return; }
      if (sc) {
        const v = parseFloat(sc);
        if (!Number.isNaN(v)) setScale(sid, v, true, true);
      }
    });

    wrap.appendChild(bar);
  }

  function setLabel(scale){
    const lab = byId("mzLabel");
    if (!lab) return;
    lab.textContent = `${Math.round(scale * 100)}%`;
  }

  function measure(svg){
    try {
      const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
      if (vb && vb.width && vb.height) return { w: vb.width, h: vb.height };
    } catch {}
    try {
      const b = svg.getBBox();
      if (b && b.width && b.height) return { w: b.width, h: b.height };
    } catch {}
    const r = svg.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  }

  function applyTransform(svg, st){
    svg.style.transformOrigin = "0 0";
    svg.style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.scale})`;
    setLabel(st.scale);
  }

  function center(wrap, dim, st){
    const cw = Math.max(1, wrap.clientWidth);
    const ch = Math.max(1, wrap.clientHeight);
    st.tx = Math.max(0, (cw - dim.w * st.scale) / 2);
    st.ty = Math.max(0, (ch - dim.h * st.scale) / 2);
  }

  function setScale(sid, v, recenter, persist){
    ensureBar();
    const svg = getSvg();
    const wrap = getWrap();
    if (!svg || !wrap) return;

    const st = loadState(sid) || { scale: 1.0, tx: 0, ty: 0 };
    st.scale = clamp(v, 0.25, 2.0);
    const dim = measure(svg);
    if (recenter) center(wrap, dim, st);

    applyTransform(svg, st);
    if (persist) saveState(sid, st);
  }

  function bumpScale(sid, k){
    const st = loadState(sid) || { scale: 1.0, tx: 0, ty: 0 };
    setScale(sid, st.scale * k, true, true);
  }

  function fitAndApply(sid, persist){
    ensureBar();
    const svg = getSvg();
    const wrap = getWrap();
    if (!svg || !wrap) return;

    const dim = measure(svg);
    const cw = Math.max(1, wrap.clientWidth);
    const ch = Math.max(1, wrap.clientHeight);

    let k = Math.min(cw / dim.w, ch / dim.h) * 0.95;
    k = clamp(k, 0.35, 1.25);

    const st = { scale: k, tx: 0, ty: 0 };
    center(wrap, dim, st);
    applyTransform(svg, st);
    if (persist) saveState(sid, st);
  }

  function afterRender(){
    const sid = getSessionIdSafe();
    if (!sid) return;

    ensureBar();

    const svg = getSvg();
    if (!svg) return;

    const restored = loadState(sid);
    if (restored) {
      applyTransform(svg, restored);
      return;
    }

    if (didAuto.has(sid)) return;
    didAuto.add(sid);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitAndApply(sid, true);
      });
    });
  }

  window.step19b_afterMermaidRender = afterRender;
})();
// STEP19B_ZOOM_END
"""

def read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")

def write(p: Path, s: str) -> None:
    p.write_text(s, encoding="utf-8")

def ensure_css():
    if not CSS.exists():
        print("styles.css: not found, skip")
        return
    s = read(CSS)
    if "/* STEP19B_MERMAID_ZOOM */" in s:
        print("styles.css: step19b css already present")
        return
    s2 = s.rstrip() + "\n\n/* STEP19B_MERMAID_ZOOM */\n" + """
#graphWrap{ position:relative; }
#graphWrap{ height: clamp(380px, 62vh, 740px); }

.mz-bar{
  position:absolute;
  top:12px;
  right:16px;
  display:flex;
  gap:8px;
  align-items:center;
  padding:8px 10px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.10);
  background: rgba(20,22,28,.55);
  backdrop-filter: blur(10px);
  z-index: 30;
}
.mz-btn{
  border:1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  color: rgba(255,255,255,.90);
  padding:6px 10px;
  border-radius:10px;
  cursor:pointer;
  font-size:12px;
  line-height:1;
}
.mz-btn:hover{ background: rgba(255,255,255,.10); }
.mz-label{
  margin-left:6px;
  font-size:12px;
  color: rgba(255,255,255,.75);
  white-space:nowrap;
}
""" + "\n"
    write(CSS, s2)
    print("styles.css: appended step19b zoom css")

def upsert_zoom_block(s: str) -> str:
    if BEGIN in s and END in s:
        s2 = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), JS_BLOCK.strip("\n"), s, flags=re.S)
        print("app.js: replaced step19b zoom block")
        return s2
    print("app.js: appended step19b zoom block")
    return s.rstrip() + "\n\n" + JS_BLOCK.strip("\n") + "\n"

def hook_after_render(s: str) -> str:
    if "step19b_afterMermaidRender();" in s or "step19b_afterMermaidRender(" in s:
        print("app.js: afterRender already hooked")
        return s

    target_line = None
    for i, line in enumerate(s.splitlines()):
        if "await mermaid.run" in line:
            target_line = i
            break

    if target_line is not None:
        lines = s.splitlines()
        lines.insert(target_line + 1, "    try { if (window.step19b_afterMermaidRender) window.step19b_afterMermaidRender(); } catch (e) { console.warn(e); }")
        print("app.js: hooked afterRender right after await mermaid.run(...)")
        return "\n".join(lines) + ("\n" if s.endswith("\n") else "")

    print("app.js: WARNING: cannot find 'await mermaid.run' to hook afterRender")
    return s

def patch_userflow_refresh(s: str) -> str:
    if "STEP19B_USERFLOW_REFRESH" in s:
        print("app.js: userflow refresh already patched")
        return s

    pat = r'(sessionCache\s*=\s*await\s*api\([^\)]*\);\s*)'
    m = re.search(pat, s)
    if not m:
        print("app.js: WARNING: cannot find sessionCache=await api(...) for refresh patch")
        return s

    inject = """
  // STEP19B_USERFLOW_REFRESH
  try {
    if (sessionCache && (!sessionCache.roles || !sessionCache.roles.length)) {
      if (typeof step18b1_openActorsModal === "function") step18b1_openActorsModal();
    }
  } catch (e) { console.warn(e); }
"""
    s2 = s[:m.end(1)] + inject + s[m.end(1):]
    print("app.js: injected userflow refresh guard (open actors if roles missing)")
    return s2

def patch_send_notes_guard(s: str) -> str:
    if "STEP19B_SENDNOTES_GUARD" in s:
        print("app.js: sendNotes guard already patched")
        return s

    m = re.search(r'(async function\s+sendNotes\s*\([^)]*\)\s*\{\s*)', s)
    if not m:
        m = re.search(r'(function\s+sendNotes\s*\([^)]*\)\s*\{\s*)', s)
    if not m:
        print("app.js: WARNING: cannot find sendNotes() to guard")
        return s

    inject = """
  // STEP19B_SENDNOTES_GUARD
  try {
    if (!sessionCache || !sessionCache.roles || !sessionCache.roles.length) {
      if (typeof step18b1_openActorsModal === "function") step18b1_openActorsModal();
      return;
    }
  } catch (e) { console.warn(e); }
"""
    s2 = s[:m.end(1)] + inject + s[m.end(1):]
    print("app.js: injected sendNotes guard (require roles)")
    return s2

def main():
    if not APP_JS.exists():
        raise SystemExit("app.js not found: backend/app/static/app.js")

    s = read(APP_JS)
    s = upsert_zoom_block(s)
    s = hook_after_render(s)
    s = patch_userflow_refresh(s)
    s = patch_send_notes_guard(s)

    write(APP_JS, s)
    ensure_css()

if __name__ == "__main__":
    main()
