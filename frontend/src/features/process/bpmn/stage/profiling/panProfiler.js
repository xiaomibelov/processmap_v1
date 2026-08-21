/**
 * Deep panning profiler — injects runtime instrumentation to find the
 * true bottleneck when FPS drops below 5 during canvas pan.
 *
 * Activated automatically if URL contains ?profilePan=1
 * Results are logged to console and stored in window.__fpcPanProfile
 */

function noop() {}

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function captureStack(maxLines = 6) {
  try {
    const stack = new Error().stack || "";
    return stack.split("\n").slice(2, 2 + maxLines).join(" | ");
  } catch {
    return "";
  }
}

class PanProfiler {
  constructor() {
    this.active = false;
    this.frames = [];
    this.longTasks = [];
    this.forcedReflows = [];
    this.funcTimes = {};
    this.diagramMetrics = {};
    this.reactRenders = [];
    this.panEvents = [];
    this._rafId = 0;
    this._lastRaf = 0;
    this._obs = null;
    this._patches = [];
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.frames = [];
    this.longTasks = [];
    this.forcedReflows = [];
    this.funcTimes = {};
    this.diagramMetrics = {};
    this.reactRenders = [];
    this.panEvents = [];
    this._lastRaf = now();
    this._scheduleFrame();
    this._installLongTaskObserver();
    this._installReflowDetection();
    console.log("[PanProfiler] started — pan the canvas for 5s, then call __fpcPanProfile.stop()");
  }

  stop() {
    this.active = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    if (this._obs) { try { this._obs.disconnect(); } catch {} this._obs = null; }
    this._unpatch();
    this._printSummary();
  }

  _scheduleFrame() {
    if (!this.active) return;
    this._rafId = requestAnimationFrame((t) => {
      const n = now();
      const dur = n - this._lastRaf;
      this._lastRaf = n;
      if (dur > 0) {
        this.frames.push({ ts: n, dur, fps: 1000 / dur });
        if (this.frames.length > 3000) this.frames.shift();
      }
      this._scheduleFrame();
    });
  }

  _installLongTaskObserver() {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks.push({
            ts: entry.startTime,
            dur: entry.duration,
            name: entry.name,
          });
        }
      });
      obs.observe({ entryTypes: ["longtask"] });
      this._obs = obs;
    } catch {
      // longtask not supported
    }
  }

  _installReflowDetection() {
    const props = ["offsetWidth", "offsetHeight", "clientWidth", "clientHeight", "scrollWidth", "scrollHeight"];
    for (const prop of props) {
      const proto = HTMLElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || !desc.get) continue;
      const orig = desc.get;
      const self = this;
      Object.defineProperty(proto, prop, {
        configurable: true,
        get: function () {
          self._recordForcedReflow(prop, captureStack(5));
          return orig.call(this);
        },
      });
      this._patches.push({ proto, prop, orig });
    }

    // getBoundingClientRect
    const origGBCR = Element.prototype.getBoundingClientRect;
    const self = this;
    Element.prototype.getBoundingClientRect = function () {
      self._recordForcedReflow("getBoundingClientRect", captureStack(5));
      return origGBCR.call(this);
    };
    this._patches.push({ proto: Element.prototype, prop: "getBoundingClientRect", orig: origGBCR });

    // getComputedStyle
    const origGCS = window.getComputedStyle;
    window.getComputedStyle = function (...args) {
      self._recordForcedReflow("getComputedStyle", captureStack(5));
      return origGCS.apply(window, args);
    };
    this._patches.push({ proto: window, prop: "getComputedStyle", orig: origGCS });

    // SVG getCTM
    if (SVGElement.prototype.getCTM) {
      const origCTM = SVGElement.prototype.getCTM;
      SVGElement.prototype.getCTM = function () {
        self._recordForcedReflow("getCTM", captureStack(5));
        return origCTM.call(this);
      };
      this._patches.push({ proto: SVGElement.prototype, prop: "getCTM", orig: origCTM });
    }
  }

  _recordForcedReflow(prop, stack) {
    if (!this.active) return;
    const last = this.forcedReflows[this.forcedReflows.length - 1];
    if (last && last.prop === prop && last.stack === stack) {
      last.count += 1;
      return;
    }
    this.forcedReflows.push({ ts: now(), prop, stack, count: 1 });
    if (this.forcedReflows.length > 5000) this.forcedReflows.shift();
  }

  _unpatch() {
    for (const { proto, prop, orig } of this._patches) {
      if (prop === "getBoundingClientRect" || prop === "getCTM") {
        proto[prop] = orig;
      } else if (prop === "getComputedStyle") {
        window.getComputedStyle = orig;
      } else {
        Object.defineProperty(proto, prop, { configurable: true, get: orig });
      }
    }
    this._patches = [];
  }

  // Instrument a specific function on an object
  instrument(obj, name, key) {
    if (!obj || typeof obj[key] !== "function") return;
    const orig = obj[key].bind(obj);
    const self = this;
    obj[key] = function (...args) {
      const s = now();
      const r = orig.apply(this, args);
      const e = now();
      self._recordFuncTime(name, e - s);
      return r;
    };
  }

  _recordFuncTime(name, dur) {
    if (!this.active) return;
    const bucket = this.funcTimes[name] || (this.funcTimes[name] = { count: 0, total: 0, max: 0 });
    bucket.count += 1;
    bucket.total += dur;
    if (dur > bucket.max) bucket.max = dur;
  }

  // Capture static diagram metrics
  captureDiagramMetrics(inst) {
    if (!inst) return;
    try {
      const canvas = inst.get("canvas");
      const registry = inst.get("elementRegistry");
      const container = canvas?._container;
      const svg = container?.querySelector("svg");
      const layers = container?.querySelectorAll(".djs-layer")?.length || 0;
      const shapes = container?.querySelectorAll(".djs-shape")?.length || 0;
      const overlays = inst.get("overlays")?._overlays || {};
      const overlayCount = Object.keys(overlays).length;

      this.diagramMetrics = {
        elementRegistryCount: Array.isArray(registry?.getAll?.()) ? registry.getAll().length : 0,
        domShapes: shapes,
        domLayers: layers,
        overlayCount,
        svgWidth: svg?.getAttribute("width"),
        svgHeight: svg?.getAttribute("height"),
        containerWidth: container?.clientWidth,
        containerHeight: container?.clientHeight,
        dpr: typeof window !== "undefined" ? window.devicePixelRatio : null,
        willChange: container ? window.getComputedStyle(container).willChange : null,
      };
    } catch {
      // no-op
    }
  }

  onPanEvent(type, inst) {
    if (!this.active) return;
    this.panEvents.push({ ts: now(), type });
    if (type === "changing") {
      this.captureDiagramMetrics(inst);
    }
  }

  _printSummary() {
    const f = this.frames;
    const panWindow = this._derivePanWindow();
    const panFrames = panWindow ? f.filter((x) => x.ts >= panWindow.start && x.ts <= panWindow.end) : f;

    const avgFps = panFrames.length ? panFrames.reduce((a, b) => a + b.fps, 0) / panFrames.length : 0;
    const minFps = panFrames.length ? Math.min(...panFrames.map((x) => x.fps)) : 0;
    const framesUnder10 = panFrames.filter((x) => x.fps < 10).length;
    const framesUnder30 = panFrames.filter((x) => x.fps < 30).length;
    const longTaskDuringPan = panWindow
      ? this.longTasks.filter((t) => t.ts >= panWindow.start && t.ts <= panWindow.end)
      : [];
    const reflowDuringPan = panWindow
      ? this.forcedReflows.filter((r) => r.ts >= panWindow.start && r.ts <= panWindow.end)
      : [];

    // Aggregate reflows by prop
    const reflowAgg = {};
    for (const r of reflowDuringPan) {
      reflowAgg[r.prop] = (reflowAgg[r.prop] || 0) + r.count;
    }

    // Top functions by total time
    const funcRanking = Object.entries(this.funcTimes)
      .map(([k, v]) => ({ name: k, count: v.count, total: v.total, avg: v.total / v.count, max: v.max }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const summary = {
      panWindow: panWindow ? { duration: panWindow.end - panWindow.start } : null,
      framesTotal: panFrames.length,
      avgFps: Math.round(avgFps * 10) / 10,
      minFps: Math.round(minFps * 10) / 10,
      framesUnder10,
      framesUnder30,
      longTasks: longTaskDuringPan.length,
      forcedReflowsTotal: Object.values(reflowAgg).reduce((a, b) => a + b, 0),
      forcedReflowsByProp: reflowAgg,
      funcRanking: funcRanking.map((x) => ({ ...x, total: Math.round(x.total * 100) / 100, avg: Math.round(x.avg * 100) / 100, max: Math.round(x.max * 100) / 100 })),
      diagramMetrics: this.diagramMetrics,
    };

    console.log("[PanProfiler] SUMMARY —— copy the object below ——");
    console.log(JSON.stringify(summary, null, 2));
    console.log("[PanProfiler] raw data available at window.__fpcPanProfile");
    window.__fpcPanProfileSummary = summary;
  }

  _derivePanWindow() {
    if (this.panEvents.length < 2) return null;
    const first = this.panEvents[0].ts;
    const last = this.panEvents[this.panEvents.length - 1].ts;
    return { start: first, end: last };
  }
}

// Global singleton
const profiler = new PanProfiler();
if (typeof window !== "undefined") {
  window.__fpcPanProfile = profiler;
}

export function maybeStartPanProfilerFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("profilePan") === "1") {
      profiler.start();
    }
  } catch {
    // no-op
  }
}

export function getPanProfiler() {
  return profiler;
}

export function wrapWithProfiler(name, fn) {
  if (typeof fn !== "function") return fn;
  const p = getPanProfiler();
  return function (...args) {
    const s = now();
    const r = fn.apply(this, args);
    const e = now();
    p._recordFuncTime(name, e - s);
    return r;
  };
}

export function instrumentBpmnInst(inst, mode) {
  if (!inst) return;
  const p = getPanProfiler();
  try {
    const overlays = inst.get("overlays");
    if (overlays) {
      p.instrument(overlays, "Overlays._updateRoot", "_updateRoot");
      p.instrument(overlays, "Overlays._updateOverlaysVisibilty", "_updateOverlaysVisibilty");
    }
    const canvas = inst.get("canvas");
    if (canvas?._container) {
      // no-op, just for future expansion
    }
  } catch {
    // no-op
  }

  // Wire pan events
  try {
    const eventBus = inst.get("eventBus");
    eventBus.on("canvas.viewbox.changing", () => p.onPanEvent("changing", inst));
    eventBus.on("canvas.viewbox.changed", () => p.onPanEvent("changed", inst));
  } catch {
    // no-op
  }
}
