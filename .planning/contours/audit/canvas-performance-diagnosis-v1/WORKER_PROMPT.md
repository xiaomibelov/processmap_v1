# WORKER_PROMPT — Agent 2 / Executor

## Identity

You are **Agent 2 / Worker** executing the `audit/canvas-performance-diagnosis-v1` contour.

**Scope:** Data-driven performance audit of the ProcessMap BPMN canvas.
**Constraint:** Audit-only. No code changes. No fixes. Collect evidence and write report.

---

## Pre-flight Checklist

Before starting any measurements, verify and record:

1. [ ] `pwd` — confirm `/opt/processmap-test`
2. [ ] `git branch --show-current` — record branch name
3. [ ] `git rev-parse HEAD` — record commit SHA
4. [ ] `git status -sb` — confirm clean working tree
5. [ ] Frontend dev server running on `:5177` (`curl -s http://localhost:5177 | head -n 1`)
6. [ ] Backend API healthy on `:8088` (`curl -s http://localhost:8088/health`)
7. [ ] Chrome/Chromium available (`which google-chrome || which chromium-browser || which chromium`)
8. [ ] No console errors on initial load (check browser console before profiling)

If any check fails, **STOP** and report the failure. Do not proceed with a broken baseline.

---

## Measurement Toolkit

You have access to the following tools:
- **Playwright MCP** (`browser_*` tools) — navigate, interact, evaluate JavaScript, take screenshots
- **Shell** — run `curl`, `node`, Python scripts, Chrome DevTools CLI
- **ReadFile/WriteFile** — read source code, write evidence files

### Chrome DevTools Profiling via Playwright

Use Playwright's CDP (Chrome DevTools Protocol) for profiling:

```javascript
// Start performance tracing
await browser_run_code_unsafe({
  code: `async (page) => {
    const client = await page.target().createCDPSession();
    await client.send('Performance.enable');
    await client.send('Tracing.start', {
      categories: ['devtools.timeline', 'v8.execute', 'disabled-by-default-devtools.timeline'],
      options: 'sampling-frequency=10000'
    });
    return 'tracing_started';
  }`
});
```

For simpler profiling, use `window.performance` API via `browser_evaluate`:

```javascript
// Get performance metrics
const metrics = await browser_evaluate({
  function: `() => {
    const entries = performance.getEntriesByType('longtask');
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      longTaskCount: entries.length,
      longTasks: entries.slice(-5).map(e => ({
        duration: e.duration,
        startTime: e.startTime
      })),
      domComplete: nav?.domComplete,
      loadEventEnd: nav?.loadEventEnd
    };
  }`
});
```

### DOM/SVG/Overlay Counters

Use `browser_evaluate` to count nodes:

```javascript
const counts = await browser_evaluate({
  function: `() => ({
    totalNodes: document.querySelectorAll('*').length,
    svgNodes: document.querySelectorAll('svg *').length,
    overlayNodes: document.querySelectorAll('.djs-overlay').length,
    djsElements: document.querySelectorAll('.djs-element').length,
    djsShapes: document.querySelectorAll('.djs-shape').length,
    djsConnections: document.querySelectorAll('.djs-connection').length,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  })`
});
```

### bpmn-js Element Registry Count

```javascript
const bpmnCounts = await browser_evaluate({
  function: `() => {
    // Access the bpmn-js instance through React devtools or global
    // The modeler/viewer may be attached to a global or accessible via DOM
    const djsContainer = document.querySelector('.djs-container');
    if (!djsContainer) return { error: 'No djs-container found' };
    
    // Try to find the bpmn-js instance
    const keys = Object.keys(window).filter(k => k.toLowerCase().includes('bpmn') || k.toLowerCase().includes('modeler'));
    return { djsContainerFound: true, windowKeys: keys };
  }`
});
```

### FPS Measurement

```javascript
// Simple FPS counter via requestAnimationFrame
const fpsResult = await browser_evaluate({
  function: `() => new Promise(resolve => {
    let frames = 0;
    const start = performance.now();
    const duration = 3000; // 3 seconds
    
    function count() {
      frames++;
      if (performance.now() - start < duration) {
        requestAnimationFrame(count);
      } else {
        const elapsed = (performance.now() - start) / 1000;
        resolve({ fps: Math.round(frames / elapsed), totalFrames: frames, elapsedMs: Math.round(performance.now() - start) });
      }
    }
    requestAnimationFrame(count);
  })`
});
```

### Backend Latency

```bash
curl -w "\nDNS:%{time_namelookup}\nConnect:%{time_connect}\nTTFB:%{time_starttransfer}\nTotal:%{time_total}\n" \
     -o /dev/null -s \
     http://localhost:8088/api/sessions/{sessionId}/bpmn
```

---

## Audit Phases

### Phase 1: Navigate and Prepare

1. Navigate to `:5177` using Playwright
2. Take initial screenshot (`browser_take_screenshot`)
3. Check console for errors (`browser_console_messages` with level `error`)
4. Log in if required (check if login page appears)
5. Navigate to a process with a BPMN diagram
6. Wait for diagram to fully load (`browser_wait_for` with text indicating readiness)

### Phase 2: Small Diagram Baseline

Use a diagram with ≤10 elements. If no small diagram exists, create a minimal test by:
- Finding an existing small process in the workspace
- Or noting that only large diagrams are available

Record:
1. DOM counts (total, SVG, overlays, djs-elements)
2. FPS at rest (3-second measurement)
3. Heap size (via `performance.memory` if available)
4. API timing for BPMN XML fetch

Save to: `evidence/small_diagram_baseline.json`

### Phase 3: Small Diagram Pan Profile

1. Start FPS measurement (runs for 3 seconds)
2. Immediately start dragging the canvas (simulate continuous pan)
3. Wait for FPS measurement to complete
4. Take screenshot of canvas during/after pan
5. Record long task entries from `performance.getEntriesByType('longtask')`

Save to: `evidence/small_diagram_pan_profile.json`

### Phase 4: Large Diagram Baseline

Find or load a diagram with ≥50 elements. Record the same metrics as Phase 2.

Save to: `evidence/large_diagram_baseline.json`

### Phase 5: Large Diagram Pan Profile

Repeat Phase 3 on the large diagram.

Save to: `evidence/large_diagram_pan_profile.json`

### Phase 6: Memory Leak Detection

**Heap measurement via `performance.memory` (Chrome-only):**

```javascript
const heapMeasurement = await browser_evaluate({
  function: `() => ({
    usedJSHeapSize: performance.memory?.usedJSHeapSize,
    totalJSHeapSize: performance.memory?.totalJSHeapSize,
    jsHeapSizeLimit: performance.memory?.jsHeapSizeLimit
  })`
});
```

Sequence:
1. Measure heap at rest (small diagram)
2. Perform 5 complete pan cycles (drag, release, repeat)
3. Measure heap immediately after pan cycles
4. Wait 10 seconds
5. Measure heap again
6. Compare deltas

Save to: `evidence/heap_measurements.json`

### Phase 7: Event Listener Count

```javascript
const listenerCount = await browser_evaluate({
  function: `() => {
    // Count listeners via getEventListeners if available in DevTools
    // Fallback: count DOM nodes with event attributes
    const allElements = document.querySelectorAll('*');
    let listenerCount = 0;
    allElements.forEach(el => {
      // Count onclick, onpointerdown, etc.
      for (const key of Object.keys(el)) {
        if (key.startsWith('on')) listenerCount++;
      }
    });
    return { estimatedListenerCount: listenerCount, totalElements: allElements.length };
  }`
});
```

Record at three states:
1. At rest
2. During mouse down (holding drag)
3. After mouse up (released)

Save to: `evidence/event_listener_counts.json`

### Phase 8: Backend Latency Isolation

1. Find a valid session ID from the running app
2. Time the BPMN XML endpoint:
   ```bash
   curl -w "\nDNS:%{time_namelookup}\nConnect:%{time_connect}\nTTFB:%{time_starttransfer}\nTotal:%{time_total}\nSize:%{size_download}\n" \
        -o /tmp/bpmn_xml_response.xml -s \
        http://localhost:8088/api/sessions/{sessionId}/bpmn
   ```
3. Time the BPMN meta endpoint
4. Record response sizes

Save to: `evidence/curl_timings.txt`

---

## Report Structure

Write `AUDIT_REPORT.md` in **Russian** with the following sections:

```markdown
# Отчет аудита производительности BPMN Canvas

## 1. Методология
- Какие инструменты использовались
- Какие сценарии измерялись
- Какие диаграммы использовались (размеры)

## 2. Базовые измерения
### 2.1 Маленькая диаграмма (≤10 элементов)
- DOM nodes: X
- SVG nodes: X
- Overlays: X
- FPS at rest: X
- FPS during pan: X
- Heap at rest: X MB

### 2.2 Большая диаграмма (≥50 элементов)
- DOM nodes: X
- SVG nodes: X
- Overlays: X
- FPS at rest: X
- FPS during pan: X
- Heap at rest: X MB

## 3. Сравнительный анализ
- Рост DOM на элемент: X nodes/element
- Деградация FPS: X% (small vs large)
- Рост overlay на элемент: X overlays/element

## 4. Профилирование CPU
- Топ-3 долгих задачи (flame chart)
- Scripting time vs Rendering time
- Количество dropped frames

## 5. Анализ памяти
- Heap до панорамирования: X MB
- Heap после 5 циклов: X MB
- Heap через 10 сек: X MB
- Утечка подтверждена / не подтверждена

## 6. Задержка backend
- TTFB BPMN XML: X ms
- TTFB BPMN meta: X ms
- Размер XML: X KB
- Backend является / не является фактором

## 7. Event listeners
- Количество в покое: X
- Количество при drag: X
- Количество после release: X
- Утечка listeners: да / нет

## 8. Вердикт
### Основной bottleneck: [DOM/SVG creation | Overlay churn | Backend latency | Event listeners | Memory leak]

### Доказательство:
[Конкретные числа, подтверждающие вердикт]

### Отвергнутые гипотезы:
[Почему другие причины исключены]

## 9. Рекомендации (без реализации)
[Что следует сделать в следующем контуре — только рекомендации, без кода]

## 10. Исходные данные
- Ссылки на файлы в evidence/
- Commit SHA
- Branch
- Browser version
```

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Frontend not running on `:5177` | Report error, check `ps aux \| grep vite` |
| Backend not responding on `:8088` | Report error, check backend logs |
| Cannot find BPMN diagram to test | Create a note in report; test whatever is available |
| Playwright cannot access Chrome | Try `chromium-browser` or `chromium` binary |
| Console errors during profiling | Log them in report but continue measurement |
| `performance.memory` unavailable | Note browser limitation; use DevTools manual snapshots |
| `getEventListeners` unavailable | Use estimated count method |

---

## Evidence Files Checklist

Before declaring done, verify these files exist:

- [ ] `evidence/small_diagram_baseline.json`
- [ ] `evidence/small_diagram_pan_profile.json`
- [ ] `evidence/large_diagram_baseline.json`
- [ ] `evidence/large_diagram_pan_profile.json`
- [ ] `evidence/heap_measurements.json`
- [ ] `evidence/event_listener_counts.json`
- [ ] `evidence/curl_timings.txt`
- [ ] At least 2 screenshots in `evidence/screenshots/`

---

## Final Deliverables

1. `AUDIT_REPORT.md` — structured report in Russian
2. `evidence/` — directory with all raw data
3. Update `STATE.json` with status `"done"` and list of evidence files
