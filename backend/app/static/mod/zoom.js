(function(){
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
})();