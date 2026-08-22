# Measurement Methodology

## Overview

This document defines the exact procedures for each measurement type. Follow these procedures precisely to ensure reproducible results.

---

## M1: DOM/SVG/Overlay Counting

### Procedure

```javascript
// Execute in browser console or via browser_evaluate
function countNodes() {
  return {
    timestamp: new Date().toISOString(),
    totalDOM: document.querySelectorAll('*').length,
    svgNodes: document.querySelectorAll('svg *').length,
    overlays: document.querySelectorAll('.djs-overlay').length,
    djsElements: document.querySelectorAll('.djs-element').length,
    djsShapes: document.querySelectorAll('.djs-shape').length,
    djsConnections: document.querySelectorAll('.djs-connection').length,
    bpmnElements: (() => {
      try {
        // Try to access bpmn-js element registry
        const container = document.querySelector('.djs-container');
        if (!container) return null;
        // The bpmn-js instance may be accessible via container
        return null; // Fallback if not accessible
      } catch { return null; }
    })()
  };
}
```

### When to Measure
- After diagram is fully loaded and stable (wait 2 seconds after load complete)
- Before any user interaction

### Recording Format
```json
{
  "diagramSize": "small|large",
  "bpmnElementCount": 8,
  "counts": {
    "totalDOM": 450,
    "svgNodes": 320,
    "overlays": 5,
    "djsElements": 15,
    "djsShapes": 8,
    "djsConnections": 4
  },
  "ratio": {
    "domPerElement": 56.25,
    "svgPerElement": 40.0,
    "overlaysPerElement": 0.625
  },
  "timestamp": "2026-05-28T10:00:00Z"
}
```

---

## M2: FPS Measurement

### Procedure

```javascript
// Execute in browser console or via browser_evaluate
function measureFPS(durationMs = 3000) {
  return new Promise(resolve => {
    let frames = 0;
    const start = performance.now();
    
    function frame() {
      frames++;
      const elapsed = performance.now() - start;
      if (elapsed < durationMs) {
        requestAnimationFrame(frame);
      } else {
        const actualDuration = elapsed / 1000;
        resolve({
          frames: frames,
          durationMs: Math.round(elapsed),
          fps: Math.round(frames / actualDuration * 10) / 10,
          timestamp: new Date().toISOString()
        });
      }
    }
    requestAnimationFrame(frame);
  });
}
```

### Pan Simulation

```javascript
// Simulate continuous pan via Playwright
// Use browser_drag or evaluate mouse events
async function panCanvas(page) {
  const canvas = await page.$('.djs-canvas, .djs-container, svg');
  const box = await canvas.boundingBox();
  
  // Drag from center to bottom-right
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 30 });
  await page.mouse.up();
}
```

### Recording Format
```json
{
  "diagramSize": "small|large",
  "state": "at_rest|during_pan",
  "measurement": {
    "frames": 180,
    "durationMs": 3002,
    "fps": 59.9
  },
  "timestamp": "2026-05-28T10:00:00Z"
}
```

---

## M3: Long Task Capture

### Procedure

```javascript
// Execute before interaction
const observer = new PerformanceObserver(list => {
  const entries = list.getEntries();
  entries.forEach(entry => {
    longTasks.push({
      duration: entry.duration,
      startTime: entry.startTime,
      name: entry.name
    });
  });
});
observer.observe({ entryTypes: ['longtask'] });

// After interaction, collect:
const longTasks = performance.getEntriesByType('longtask');
const top3 = longTasks
  .sort((a, b) => b.duration - a.duration)
  .slice(0, 3)
  .map(t => ({
    duration: Math.round(t.duration * 10) / 10,
    startTime: Math.round(t.startTime)
  }));
```

### Recording Format
```json
{
  "diagramSize": "small|large",
  "interaction": "pan",
  "top3LongTasks": [
    { "duration": 145.2, "startTime": 1200 },
    { "duration": 89.5, "startTime": 3400 },
    { "duration": 67.1, "startTime": 5600 }
  ],
  "totalLongTasks": 12,
  "totalLongTaskTime": 842.3,
  "timestamp": "2026-05-28T10:00:00Z"
}
```

---

## M4: Heap Measurement

### Procedure

```javascript
function measureHeap() {
  const mem = performance.memory;
  if (!mem) return { error: "performance.memory unavailable" };
  return {
    usedJSHeapSize: mem.usedJSHeapSize,
    totalJSHeapSize: mem.totalJSHeapSize,
    jsHeapSizeLimit: mem.jsHeapSizeLimit,
    usedMB: Math.round(mem.usedJSHeapSize / 1024 / 1024 * 100) / 100,
    timestamp: new Date().toISOString()
  };
}
```

### Sequence
1. Load diagram, wait 3 seconds, measure (T0)
2. Perform 5 pan cycles (drag across, release, repeat)
3. Measure immediately (T1)
4. Wait 10 seconds without interaction
5. Measure again (T2)

### Leak Criteria
- Delta T1-T0 > 5MB = potential leak
- Recovery (T0 + (T1-T0)*0.5) > T2 = leak confirmed (less than 50% recovered)

### Recording Format
```json
{
  "diagramSize": "small|large",
  "measurements": [
    { "timepoint": "T0_rest", "usedMB": 42.5, "timestamp": "..." },
    { "timepoint": "T1_after_pans", "usedMB": 58.2, "timestamp": "..." },
    { "timepoint": "T2_after_wait", "usedMB": 55.1, "timestamp": "..." }
  ],
  "deltaT1T0": 15.7,
  "recovery": 3.1,
  "recoveryPercent": 19.7,
  "leakConfirmed": true,
  "timestamp": "2026-05-28T10:00:00Z"
}
```

---

## M5: Event Listener Count

### Procedure

```javascript
function estimateListeners() {
  const all = document.querySelectorAll('*');
  let count = 0;
  all.forEach(el => {
    // Check for inline event handlers
    const attrs = el.getAttributeNames();
    attrs.forEach(attr => {
      if (attr.startsWith('on')) count++;
    });
  });
  return {
    estimatedListeners: count,
    totalElements: all.length,
    listenersPerElement: Math.round(count / all.length * 100) / 100,
    timestamp: new Date().toISOString()
  };
}
```

### States
1. At rest (diagram loaded, no interaction)
2. During drag (mouse held down)
3. After release (mouse up, 1 second wait)

### Recording Format
```json
{
  "diagramSize": "small|large",
  "counts": [
    { "state": "at_rest", "estimatedListeners": 45, "totalElements": 450 },
    { "state": "during_drag", "estimatedListeners": 52, "totalElements": 450 },
    { "state": "after_release", "estimatedListeners": 48, "totalElements": 450 }
  ],
  "leak": {
    "delta": 3,
    "percent": 6.7,
    "confirmed": false
  },
  "timestamp": "2026-05-28T10:00:00Z"
}
```

---

## M6: Backend Latency

### Procedure

```bash
# For BPMN XML
sessionId="YOUR_SESSION_ID"
curl -w "\nDNS:%{time_namelookup}\nConnect:%{time_connect}\nSSL:%{time_appconnect}\nTTFB:%{time_starttransfer}\nTotal:%{time_total}\nSize:%{size_download}\nHTTP:%{http_code}\n" \
     -o /tmp/bpmn_xml.xml \
     -s \
     "http://localhost:8088/api/sessions/${sessionId}/bpmn"

# For BPMN meta
curl -w "\nDNS:%{time_namelookup}\nConnect:%{time_connect}\nSSL:%{time_appconnect}\nTTFB:%{time_starttransfer}\nTotal:%{time_total}\nSize:%{size_download}\nHTTP:%{http_code}\n" \
     -o /tmp/bpmn_meta.json \
     -s \
     "http://localhost:8088/api/sessions/${sessionId}/bpmn_meta"
```

### Backend Factor Criteria
- TTFB > 200ms = backend contributes to perceived slowness
- Total > 500ms for <100KB = backend is a factor
- XML size > 500KB = transfer time may be significant

### Recording Format
```json
{
  "endpoints": [
    {
      "name": "bpmn_xml",
      "url": "/api/sessions/{id}/bpmn",
      "dns_ms": 1.2,
      "connect_ms": 2.5,
      "ttfb_ms": 45.3,
      "total_ms": 120.7,
      "size_bytes": 24580,
      "http_code": 200
    }
  ],
  "backendIsFactor": false,
  "timestamp": "2026-05-28T10:00:00Z"
}
```

---

## M7: Screenshot Evidence

### Procedure

Use `browser_take_screenshot` at key moments:
1. Diagram fully loaded (baseline state)
2. During pan operation
3. DevTools Performance tab (if accessible)
4. DevTools Memory tab (if accessible)

Store in `evidence/screenshots/` with descriptive filenames.
