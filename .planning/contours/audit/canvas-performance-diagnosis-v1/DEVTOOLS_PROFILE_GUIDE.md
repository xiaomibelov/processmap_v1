# DevTools Profile Guide

## Chrome DevTools Profiling via Playwright

This guide documents how to capture performance profiles using Playwright's CDP (Chrome DevTools Protocol) access.

---

## Option 1: Performance.getMetrics (Recommended for Automation)

```javascript
// Use browser_run_code_unsafe to access CDP
async function getPerformanceMetrics(page) {
  const client = await page.target().createCDPSession();
  await client.send('Performance.enable');
  const metrics = await client.send('Performance.getMetrics');
  return metrics;
}
```

Available metrics include:
- `JSHeapUsedSize` — JavaScript heap used
- `JSHeapTotalSize` — JavaScript heap total
- `FirstMeaningfulPaint` — paint timing
- `TaskDuration` — total task time
- `TaskOtherDuration` — non-JS task time

---

## Option 2: Tracing API (For Flame Charts)

```javascript
async function startTracing(page) {
  const client = await page.target().createCDPSession();
  await client.send('Tracing.start', {
    categories: [
      'devtools.timeline',
      'v8.execute',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
      'loading'
    ],
    options: 'sampling-frequency=10000'
  });
  return client;
}

async function stopTracing(client, outputPath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    client.on('Tracing.dataCollected', ({ value }) => {
      chunks.push(...value);
    });
    client.on('Tracing.tracingComplete', async () => {
      const fs = require('fs');
      fs.writeFileSync(outputPath, JSON.stringify(chunks));
      resolve(outputPath);
    });
    client.send('Tracing.end').catch(reject);
  });
}
```

---

## Option 3: Runtime Metrics via browser_evaluate

```javascript
// Get comprehensive runtime metrics
function getRuntimeMetrics() {
  const nav = performance.getEntriesByType('navigation')[0];
  const longTasks = performance.getEntriesByType('longtask');
  
  return {
    timing: {
      domComplete: nav?.domComplete,
      loadEventEnd: nav?.loadEventEnd,
      domInteractive: nav?.domInteractive
    },
    longTasks: {
      count: longTasks.length,
      totalDuration: longTasks.reduce((s, t) => s + t.duration, 0),
      top3: longTasks
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3)
        .map(t => ({ duration: t.duration, startTime: t.startTime }))
    },
    memory: performance.memory ? {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
    } : null,
    paint: performance.getEntriesByType('paint').map(p => ({
      name: p.name,
      startTime: p.startTime
    }))
  };
}
```

---

## Option 4: FPS Counter (Simplest)

```javascript
function measureFPS(durationMs = 3000) {
  return new Promise(resolve => {
    let frames = 0;
    const start = performance.now();
    
    function frame() {
      frames++;
      if (performance.now() - start < durationMs) {
        requestAnimationFrame(frame);
      } else {
        resolve({
          frames,
          fps: Math.round(frames / (durationMs / 1000) * 10) / 10
        });
      }
    }
    requestAnimationFrame(frame);
  });
}
```

---

## Recommended Measurement Sequence

### For Baseline (At Rest)

```javascript
// 1. Clear performance entries
performance.clearResourceTimings();
performance.clearMeasures();

// 2. Wait for diagram to settle
await new Promise(r => setTimeout(r, 2000));

// 3. Measure DOM counts
const domCounts = {
  total: document.querySelectorAll('*').length,
  svg: document.querySelectorAll('svg *').length,
  overlays: document.querySelectorAll('.djs-overlay').length
};

// 4. Measure FPS at rest
const fpsRest = await measureFPS(3000);

// 5. Measure heap
const heapRest = performance.memory ? {
  used: performance.memory.usedJSHeapSize,
  total: performance.memory.totalJSHeapSize
} : null;

// 6. Collect long tasks accumulated so far
const longTasksRest = performance.getEntriesByType('longtask');
```

### For Pan Interaction

```javascript
// 1. Start long task observer
const longTasks = [];
const observer = new PerformanceObserver(list => {
  longTasks.push(...list.getEntries());
});
observer.observe({ entryTypes: ['longtask'] });

// 2. Start FPS measurement (concurrent)
const fpsPromise = measureFPS(3000);

// 3. Simulate pan immediately
// (Use Playwright drag in parallel)

// 4. Wait for FPS measurement
const fpsPan = await fpsPromise;

// 5. Stop observer
observer.disconnect();

// 6. Get top long tasks
const topTasks = longTasks
  .sort((a, b) => b.duration - a.duration)
  .slice(0, 3);
```

---

## Console Access During Audit

If Playwright tools are limited, you can use browser_evaluate to run measurement code directly:

```javascript
// Example: Get all metrics in one call
const result = await browser_evaluate({
  function: `() => {
    const mem = performance.memory;
    return {
      dom: document.querySelectorAll('*').length,
      svg: document.querySelectorAll('svg *').length,
      overlays: document.querySelectorAll('.djs-overlay').length,
      heapUsed: mem ? mem.usedJSHeapSize : null,
      heapTotal: mem ? mem.totalJSHeapSize : null
    };
  }`
});
```

---

## Known Limitations

1. **CDP requires `browser_run_code_unsafe`** — This tool may not be available in all environments
2. **`performance.memory` is Chrome-only** — Firefox/Safari will return null
3. **`getEventListeners` is DevTools-only** — Not available in regular JS context
4. **Tracing produces large files** — A 3-second trace can be 5-20MB
5. **FPS measurement via rAF counts frames** — Not frame timing; actual FPS may differ slightly
