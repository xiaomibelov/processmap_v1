(function () {
  if (window.__fpc_mermaid_zoom_v1_installed) return;
  window.__fpc_mermaid_zoom_v1_installed = true;

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  var KEY_PREFIX = "fpc_zoom_v4:";

  function getSessionIdSafe() {
    try {
      if (typeof window.getSessionId === "function") return window.getSessionId() || "default";
    } catch (e) {}
    try {
      if (window.sessionId) return String(window.sessionId);
    } catch (e) {}
    try {
      var p = new URLSearchParams(window.location.search);
      return p.get("sid") || "default";
    } catch (e) {}
    return "default";
  }

  function key() {
    return KEY_PREFIX + getSessionIdSafe();
  }

  function readState() {
    try {
      var raw = localStorage.getItem(key());
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeState(st) {
    try {
      localStorage.setItem(key(), JSON.stringify(st));
    } catch (e) {}
  }

  function getSvg() {
    return qs("#graph svg");
  }

  function getWrap() {
    return qs("#graph");
  }

  function ensureBar() {
    var host = qs("#graphWrap") || document.body;
    var bar = qs("#mermaidZoomBar", host);
    if (bar) return bar;

    bar = document.createElement("div");
    bar.id = "mermaidZoomBar";
    bar.className = "mz-bar";

    function btn(label, act) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mz-btn";
      b.dataset.act = act;
      b.textContent = label;
      return b;
    }

    bar.appendChild(btn("Fit", "fit"));
    bar.appendChild(btn("-", "out"));
    bar.appendChild(btn("+", "in"));

    var b50 = btn("50%", "s50");
    var b75 = btn("75%", "s75");
    var b100 = btn("100%", "s100");
    bar.appendChild(b50);
    bar.appendChild(b75);
    bar.appendChild(b100);

    var lab = document.createElement("span");
    lab.className = "mz-label";
    lab.textContent = "100%";
    bar.appendChild(lab);

    host.appendChild(bar);

    bar.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.dataset) return;
      var act = t.dataset.act;
      if (!act) return;

      if (act === "fit") fit();
      else if (act === "out") nudge(0.85);
      else if (act === "in") nudge(1.15);
      else if (act === "s50") setScale(0.5);
      else if (act === "s75") setScale(0.75);
      else if (act === "s100") setScale(1.0);
    });

    return bar;
  }

  function updateLabel(scale) {
    var bar = ensureBar();
    var lab = qs(".mz-label", bar);
    if (!lab) return;
    var pct = Math.round((scale || 1) * 100);
    lab.textContent = String(pct) + "%";
  }

  function applyTransform(svg, st) {
    if (!svg) return;
    var scale = clamp(st.scale || 1, 0.1, 3.0);
    var x = st.x || 0;
    var y = st.y || 0;
    svg.style.transformOrigin = "0 0";
    svg.style.transform = "translate(" + x + "px, " + y + "px) scale(" + scale + ")";
    updateLabel(scale);
  }

  function measure(svg) {
    // IMPORTANT: measure without current transforms to avoid compounding.
    var prev = svg.style.transform;
    svg.style.transform = "";

    var w = 0;
    var h = 0;

    try {
      var vb = svg.viewBox && svg.viewBox.baseVal;
      if (vb && vb.width && vb.height) {
        w = vb.width;
        h = vb.height;
      }
    } catch (e) {}

    if (!w || !h) {
      try {
        var g = svg.querySelector("g") || svg;
        var bb = g.getBBox();
        w = bb.width;
        h = bb.height;
      } catch (e) {}
    }

    svg.style.transform = prev;
    return { w: w || 1, h: h || 1 };
  }

  function fit() {
    var svg = getSvg();
    var wrap = getWrap();
    if (!svg || !wrap) return;

    var cw = wrap.clientWidth || 1;
    var ch = wrap.clientHeight || 1;

    var dim = measure(svg);

    var sx = cw / dim.w;
    var sy = ch / dim.h;

    var scale = Math.min(sx, sy) * 0.92;
    if (!isFinite(scale) || scale <= 0) scale = 1;

    // Fit can become absurdly small when bbox is wrong; clamp to keep UX usable.
    scale = clamp(scale, 0.18, 1.25);

    var x = Math.round((cw - dim.w * scale) / 2);
    var y = Math.round((ch - dim.h * scale) / 2);

    var st = { mode: "fit", scale: scale, x: x, y: y, ts: Date.now() };
    writeState(st);
    applyTransform(svg, st);
  }

  function setScale(scale) {
    var svg = getSvg();
    var wrap = getWrap();
    if (!svg || !wrap) return;

    var cw = wrap.clientWidth || 1;
    var ch = wrap.clientHeight || 1;

    var dim = measure(svg);
    var s = clamp(scale, 0.1, 3.0);

    var x = Math.round((cw - dim.w * s) / 2);
    var y = Math.round((ch - dim.h * s) / 2);

    var st = { mode: "manual", scale: s, x: x, y: y, ts: Date.now() };
    writeState(st);
    applyTransform(svg, st);
  }

  function nudge(mult) {
    var svg = getSvg();
    if (!svg) return;

    var st = readState() || { mode: "manual", scale: 1, x: 0, y: 0 };
    var next = clamp((st.scale || 1) * mult, 0.1, 3.0);

    // keep current x/y; this preserves user's framing
    st.mode = "manual";
    st.scale = next;
    st.ts = Date.now();
    writeState(st);
    applyTransform(svg, st);
  }

  function afterRender() {
    ensureBar();
    var svg = getSvg();
    if (!svg) return;

    var st = readState();
    if (st && st.mode === "manual") {
      applyTransform(svg, st);
      return;
    }

    // default = fit
    fit();
  }

  function wrapRenderMermaid() {
    if (window.__fpc_zoom_wrapped) return;
    if (typeof window.renderMermaid !== "function") return;

    var orig = window.renderMermaid;
    window.renderMermaid = async function (code) {
      var res = await orig.call(this, code);
      // wait for DOM updates
      requestAnimationFrame(function () {
        requestAnimationFrame(afterRender);
      });
      return res;
    };

    window.__fpc_zoom_wrapped = true;
  }

  function init() {
    wrapRenderMermaid();

    // in case SVG already exists (hard refresh)
    requestAnimationFrame(function () {
      requestAnimationFrame(afterRender);
    });

    window.addEventListener(
      "resize",
      function () {
        var st = readState();
        if (!st || st.mode === "fit") fit();
      },
      { passive: true }
    );
  }

  // public debug helpers
  window.FPC = window.FPC || {};
  window.FPC.Zoom = window.FPC.Zoom || {};
  window.FPC.Zoom.fit = fit;
  window.FPC.Zoom.setScale = setScale;
  window.FPC.Zoom.nudge = nudge;

  init();
})();
