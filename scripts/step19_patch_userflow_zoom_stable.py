from __future__ import annotations
import re
from pathlib import Path

APP_JS = Path("backend/app/static/app.js")
CSS = Path("backend/app/static/styles.css")
MAIN_PY = Path("backend/app/main.py")

MARK_JS_BEGIN = "// STEP19_ZOOM_UI_BEGIN"
MARK_JS_END = "// STEP19_ZOOM_UI_END"

JS_BLOCK = r"""
// STEP19_ZOOM_UI_BEGIN
// Stable mermaid zoom (per-session) + safe autofit + no-freeze behavior.
const step19Zoom = (() => {
  const KEY_PREFIX = "fpc_mz_v1:";
  let currentSessionId = null;
  let scale = 1.0;
  let tx = 0;
  let ty = 0;
  const didAuto = new Set();

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function getWrap() { return el("graphWrap"); }
  function getInner() { return el("graphInner"); }
  function getSvg() {
    const inner = getInner();
    return inner ? inner.querySelector("svg") : null;
  }

  function ensureBar() {
    const wrap = getWrap();
    if (!wrap) return;
    if (document.getElementById("mermaidZoomBar")) return;

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
      if (!t || !(t instanceof HTMLElement)) return;
      const act = t.getAttribute("data-act");
      const sc = t.getAttribute("data-scale");
      if (act === "fit") { fit(true); return; }
      if (act === "in") { setScale(scale * 1.15, true, true); return; }
      if (act === "out") { setScale(scale / 1.15, true, true); return; }
      if (sc) {
        const v = parseFloat(sc);
        if (!Number.isNaN(v)) setScale(v, true, true);
      }
    });

    wrap.appendChild(bar);
    updateLabel();
  }

  function updateLabel() {
    const lab = document.getElementById("mzLabel");
    if (!lab) return;
    lab.textContent = `${Math.round(scale * 100)}%`;
  }

  function load(sessionId) {
    currentSessionId = sessionId;
    const raw = localStorage.getItem(KEY_PREFIX + sessionId);
    if (!raw) return False();
    try {
      const o = JSON.parse(raw);
      if (typeof o.scale === "number") scale = clamp(o.scale, 0.15, 2.0);
      if (typeof o.tx === "number") tx = o.tx;
      if (typeof o.ty === "number") ty = o.ty;
      updateLabel();
      return True();
    } catch {
      return False();
    }
  }

  function True() { return true; }
  function False() { return false; }

  function save() {
    if (!currentSessionId) return;
    const o = { scale, tx, ty };
    try { localStorage.setItem(KEY_PREFIX + currentSessionId, JSON.stringify(o)); } catch {}
  }

  function apply() {
    const svg = getSvg();
    const inner = getInner();
    if (!svg || !inner) return;

    // Ensure origin is stable.
    svg.style.transformOrigin = "0 0";
    svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    updateLabel();
  }

  function center(svgW, svgH) {
    const wrap = getWrap();
    if (!wrap) return;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    tx = Math.max(0, (cw - svgW * scale) / 2);
    ty = Math.max(0, (ch - svgH * scale) / 2);
  }

  function measure(svg) {
    // Prefer viewBox if available.
    try {
      const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
      if (vb && vb.width && vb.height) return { w: vb.width, h: vb.height };
    } catch {}
    // Fallback to bbox.
    try {
      const b = svg.getBBox();
      if (b && b.width && b.height) return { w: b.width, h: b.height };
    } catch {}
    // Last resort: client rect.
    const r = svg.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  }

  function fit(persist) {
    ensureBar();
    const svg = getSvg();
    const wrap = getWrap();
    if (!svg || !wrap) return;

    const dim = measure(svg);
    const cw = Math.max(1, wrap.clientWidth);
    const ch = Math.max(1, wrap.clientHeight);

    let k = Math.min(cw / dim.w, ch / dim.h) * 0.95;
    // Critical: do not shrink into unreadable tiny scale by default.
    k = clamp(k, 0.35, 1.25);

    scale = k;
    center(dim.w, dim.h);
    apply();
    if (persist) save();
  }

  function setScale(v, persist, recenter) {
    ensureBar();
    const svg = getSvg();
    if (!svg) return;

    const dim = measure(svg);
    scale = clamp(v, 0.15, 2.0);
    if (recenter) center(dim.w, dim.h);
    apply();
    if (persist) save();
  }

  function afterRender(sessionId, sessionObj) {
    ensureBar();

    // Try restore saved state first.
    const restored = load(sessionId);
    if (restored) {
      apply();
      return;
    }

    // First render for this session:
    // - if only lanes/no nodes => start from readable default
    // - else => fit
    const nodes = sessionObj && Array.isArray(sessionObj.nodes) ? sessionObj.nodes : [];
    if (!didAuto.has(sessionId)) {
      didAuto.add(sessionId);
      if (!nodes.length) {
        setScale(0.75, true, true);
      } else {
        fit(true);
      }
    } else {
      // fallback
      fit(true);
    }
  }

  return { afterRender, fit, setScale };
})();

function step19_afterMermaidRender(sessionId) {
  try { step19Zoom.afterRender(sessionId, sessionCache); } catch (e) { console.warn("step19 zoom afterRender failed", e); }
}
// STEP19_ZOOM_UI_END
"""

def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")

def write(p: Path, s: str) -> None:
    p.write_text(s, encoding="utf-8")

def ensure_css() -> None:
    if not CSS.exists():
        print("styles.css: not found, skip")
        return
    s = read(CSS)
    if "/* STEP19_MERMAID_ZOOM */" in s:
        print("styles.css: step19 css already present")
        return
    s2 = s.rstrip() + "\n\n/* STEP19_MERMAID_ZOOM */\n" + """
#graphWrap { position: relative; }
/* Limit graph height so bottom panels remain reachable */
#graphWrap { height: clamp(360px, 62vh, 720px); }

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
    print("styles.css: appended step19 zoom css")

def patch_app_js() -> None:
    if not APP_JS.exists():
        raise SystemExit("app.js not found at backend/app/static/app.js")

    s = read(APP_JS)

    # 1) Replace/insert STEP19 zoom block near mermaid section.
    if MARK_JS_BEGIN in s and MARK_JS_END in s:
        s = re.sub(
            re.escape(MARK_JS_BEGIN) + r".*?" + re.escape(MARK_JS_END),
            JS_BLOCK.strip("\n"),
            s,
            flags=re.S,
        )
        print("app.js: replaced step19 zoom block")
    else:
        anchor = "// ==== Mermaid ====="
        i = s.find(anchor)
        if i == -1:
            raise SystemExit("app.js: anchor '// ==== Mermaid =====' not found")
        ins_at = i + len(anchor)
        s = s[:ins_at] + "\n" + JS_BLOCK.strip("\n") + "\n" + s[ins_at:]
        print("app.js: inserted step19 zoom block")

    # 2) Ensure renderMermaid calls step19_afterMermaidRender after mermaid.run
    if "step19_afterMermaidRender(sessionId);" not in s:
        s = s.replace(
            "    await mermaid.run({ nodes: [mermaidEl] });",
            "    await mermaid.run({ nodes: [mermaidEl] });\n    step19_afterMermaidRender(sessionId);",
            1,
        )
        print("app.js: hooked step19_afterMermaidRender into renderMermaid()")

    # 3) Persist start_role to backend on actor save (PATCH/POST)
    s, n1 = re.subn(
        r'await api\(`\/api\/sessions\/\$\{sid\}`,\s*"PATCH",\s*\{\s*title\s*,\s*roles\s*:\s*rs\s*\}\s*\);',
        'await api(`/api/sessions/${sid}`, "PATCH", { title, roles: rs, start_role: sr });',
        s,
        count=1,
    )
    if n1:
        print("app.js: PATCH /api/sessions/{sid} now includes start_role")

    s, n2 = re.subn(
        r'await api\("\/api\/sessions",\s*"POST",\s*\{\s*title\s*,\s*roles\s*:\s*rs\s*\}\s*\);',
        'await api("/api/sessions", "POST", { title, roles: rs, start_role: sr });',
        s,
        count=1,
    )
    if n2:
        print("app.js: POST /api/sessions now includes start_role")

    # 4) Use session.start_role (server) in mermaidCodeForSession (fallback to localStorage)
    s, n3 = re.subn(
        r'const\s+sr\s*=\s*step18b1_getStartRole\(sessionId\)\s*\|\|\s*\(roles\[0\]\s*\|\|\s*"Оператор"\);',
        'const sr = (s && s.start_role) || step18b1_getStartRole(sessionId) || (roles[0] || "Оператор");',
        s,
        count=1,
    )
    if n3:
        print("app.js: mermaidCodeForSession prefers session.start_role")

    # 5) On refresh(), if session has start_role from server -> sync localStorage (for existing logic)
    if "step18b1_setStartRole(sessionId, sessionCache.start_role);" not in s:
        s = s.replace(
            "  sessionCache = await api(`/api/sessions/${sessionId}`);",
            "  sessionCache = await api(`/api/sessions/${sessionId}`);\n"
            "  if (sessionCache && sessionCache.start_role) {\n"
            "    step18b1_setStartRole(sessionId, sessionCache.start_role);\n"
            "  }\n"
            "  if (!sessionCache.roles || !sessionCache.roles.length) {\n"
            "    step18b1_openActorsModal();\n"
            "  }",
            1,
        )
        print("app.js: refresh() now syncs start_role + forces actors modal if missing roles")

    # 6) Block sendNotes until actors exist (userflow)
    if "step18b1_openActorsModal();" in s:
        # Add a stricter guard inside sendNotes if not present.
        if "if (!sessionCache.roles || !sessionCache.roles.length) {" not in s:
            s = s.replace(
                "  const sessionId = getSessionId();",
                "  const sessionId = getSessionId();\n"
                "  if (!sessionCache || !sessionCache.roles || !sessionCache.roles.length) {\n"
                "    step18b1_openActorsModal();\n"
                "    return;\n"
                "  }",
                1,
            )
            print("app.js: sendNotes() guard added (require actors)")
    else:
        print("app.js: warning: step18b1_openActorsModal not found; sendNotes guard not added")

    write(APP_JS, s)

def patch_backend_patch_endpoint() -> None:
    if not MAIN_PY.exists():
        print("main.py: not found, skip")
        return
    s = read(MAIN_PY)

    if "/api/sessions/{session_id}" not in s or "@app.patch" not in s:
        print("main.py: PATCH /api/sessions/{session_id} not found, skip backend patch")
        return

    changed = False

    # Try to locate Update/Patch input model with roles/title.
    m = re.search(r"class\s+([A-Za-z0-9_]*Session[A-Za-z0-9_]*In)\(BaseModel\):\n(?P<body>(?:\s+.*\n)+?)\n", s)
    if m:
        body = m.group("body")
        if ("roles" in body or "title" in body) and "start_role" not in body:
            # Insert after roles if present, else append.
            if re.search(r"\s+roles\s*:\s*Optional\[List\[str\]\]", body):
                body2 = re.sub(
                    r"(\s+roles\s*:\s*Optional\[List\[str\]\].*\n)",
                    r"\1    start_role: Optional[str] = None\n",
                    body,
                    count=1,
                )
            else:
                body2 = body + "    start_role: Optional[str] = None\n"
            s = s[: m.start("body")] + body2 + s[m.end("body") :]
            changed = True
            print(f"main.py: added start_role to {m.group(1)}")

    # Add handler logic: if inp.start_role is not None -> s.start_role = inp.start_role
    if "inp.start_role" not in s:
        # naive injection inside patch handler
        # Find the patch handler function block and insert after roles assignment or before save.
        ph = re.search(r'@app\.patch\(\"/api/sessions/\{session_id\}\"\)\nasync def [^\n]+\n', s)
        if ph:
            # find a reasonable insertion point: after "if inp.roles is not None:" block
            ins = "\n    if getattr(inp, \"start_role\", None) is not None:\n        s.start_role = inp.start_role\n"
            # try after roles assignment
            s2, n = re.subn(
                r"(\n\s+if\s+inp\.roles\s+is\s+not\s+None\s*:\n(?:\s+.*\n){1,6})",
                r"\1" + ins,
                s,
                count=1,
            )
            if n:
                s = s2
                changed = True
                print("main.py: patch handler now applies start_role")
            else:
                # fallback: insert before save_session(s)
                s2, n2 = re.subn(
                    r"(\n\s+save_session\(s\)\n)",
                    ins + r"\1",
                    s,
                    count=1,
                )
                if n2:
                    s = s2
                    changed = True
                    print("main.py: applied start_role before save_session(s)")

    if changed:
        write(MAIN_PY, s)
    else:
        print("main.py: no backend changes needed")

def main() -> None:
    patch_app_js()
    ensure_css()
    patch_backend_patch_endpoint()

if __name__ == "__main__":
    main()
