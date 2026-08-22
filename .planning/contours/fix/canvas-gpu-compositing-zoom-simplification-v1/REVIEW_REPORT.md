# Review Report

**Контур**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Run ID**: `20260528T210002Z-13339`  
**Reviewer**: Agent 3  
**Дата**: 2026-05-28  
**Вердикт**: BLOCKED (runtime mismatch)

---

## Executive Summary

Реализация кода **корректна и соответствует плану**, но **не может быть проверена в runtime** из-за расхождения между собранным кодом и тем, что отдаёт dev-сервер `:5177`. Статус: `BLOCKED` до устранения mismatch.

---

## 1. Code Review

### 1.1 Изменённые файлы

```
 frontend/src/components/process/BpmnStage.jsx                    | +1
 frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js | +133
 frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js     | +1
 frontend/src/styles/legacy/legacy_bpmn.css                        | +35
 4 files changed, 168 insertions(+), 2 deletions(-)
```

### 1.2 GPU Compositing (CSS)

**Файл**: `frontend/src/styles/legacy/legacy_bpmn.css`

```css
.bpmnStage .djs-container svg,
.bpmnStage .djs-canvas svg {
  will-change: transform;
  transform: translateZ(0);
}

.bpmnStage .djs-container {
  contain: layout paint style;
}

.bpmnStage .djs-canvas.pan-active {
  will-change: transform;
  contain: layout paint;
}
```

**Оценка**: ✅ Корректно
- `translateZ(0)` на `<svg>` форсирует compositor layer — стандартная техника.
- `contain: layout paint style` изолирует paint rect.
- `will-change` применяется только во время `.pan-active` — экономит GPU-память.
- Селекторы специфичны `.bpmnStage`, не лезут в глобальное пространство.

### 1.3 Zoom Simplification (CSS)

```css
.bpmnStage .djs-container.zoom-simplified .djs-shape .djs-visual > image,
.bpmnStage .djs-container.zoom-simplified .djs-shape > .djs-visual > :not(rect):not(text):not(tspan) {
  display: none;
}

.bpmnStage .djs-container.zoom-minimal .djs-connection .djs-label {
  display: none;
}
```

**Оценка**: ✅ Корректно
- `display: none` применяется к **дочерним** SVG-элементам внутри `.djs-visual`, не к корневой `.djs-shape`.
- Hit-testing сохраняется — click/selection/hover будут работать.
- Пороги zoom < 0.4 (simplified) и < 0.2 (minimal) соответствуют спецификации.
- Отклонение от плана: вместо `[d*="icon" i]` (не поддерживается esbuild) использован `:not(rect):not(text):not(tspan)` — разумный workaround, задокументирован в `CONTEXT_USED_WORKER.md`.

### 1.4 GPU Compositing + Zoom Hooks (JS)

**Файл**: `wireBpmnStageRuntimeEvents.js`

```javascript
function bindGpuCompositingAndZoomHooks({ eventBus, inst }) {
  // ...
  eventBus.on("canvas.viewbox.changing", 1250, () => {
    panTarget.classList.add(GPU_PAN_ACTIVE_CLASS);
    clearTimeout(panTimeout);
  });

  eventBus.on("canvas.viewbox.changed", 1250, () => {
    clearTimeout(panTimeout);
    panTimeout = setTimeout(() => {
      panTarget.classList.remove(GPU_PAN_ACTIVE_CLASS);
    }, 100);
    // update zoom class...
  });
}
```

**Оценка**: ✅ Корректно
- Приоритет 1250 корректно расположен между overlay debounce (1300) и стандартными обработчиками bpmn-js (<1000).
- 100ms trailing timeout на снятие `pan-active` предотвращает мерцание.
- Zoom-класс обновляется на `canvas.viewbox.changed` и при инициализации.
- Дефенсивные проверки (`instanceof Element`, `try/catch` на `canvas.zoom()`) — надёжно.
- **Нет DOM removal / culling** — соответствует не-целям контура.

### 1.5 Overlay Pan Debounce

**Оценка**: ⚠️ Замечание

В `wireBpmnStageRuntimeEvents.js` добавлен `bindOverlayPanDebouncer`, который дублирует функциональность, уже реализованную в отдельном контуре `fix/canvas-overlay-debounce-v1`. В рамках текущего контура это не является ошибкой (Worker явно внедрил overlay debounce как часть единого файла), но:
- В `BpmnStage.jsx` уже может существовать overlay debounce логика.
- Дублирование не вызовет конфликта благодаря разным приоритетам (1300 vs старые), но стоит проверить при интеграции.

### 1.6 `deferUpdate: true`

**Файлы**: `BpmnStage.jsx`, `bpmnWiring.js`

**Оценка**: ✅ Корректно
- `deferUpdate: true` в конфигурации Viewer/Modeler откладывает SVG-обновления до конца стека вызовов, что снижает количество промежуточных repaint.
- Это дополнительная оптимизация, не упомянутая в PLAN.md, но совместимая с целями.

---

## 2. Runtime Verification

### 2.1 curl `:5177` — HTTP 200 ✅

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5177/
# 200
```

### 2.2 Cache-Control — no-cache ✅

```
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```

### 2.3 Served bundle vs source code — ❌ MISMATCH

| Проверка | Ожидается | Факт (served bundle) |
|----------|-----------|----------------------|
| CSS `pan-active` | Присутствует | **Отсутствует** |
| CSS `zoom-simplified` | Присутствует | **Отсутствует** |
| CSS `zoom-minimal` | Присутствует | **Отсутствует** |
| CSS `translateZ(0)` | Присутствует | **Отсутствует** |
| CSS `contain:` | Присутствует | **Отсутствует** |
| JS `viewbox.changing` | Присутствует | **Отсутствует** |
| JS `bindGpuCompositingAndZoomHooks` | Присутствует | **Отсутствует** |

**Dev-сервер** (`node /app/node_modules/.bin/vite --host 0.0.0.0 --port 5177`) работает из `/app`, а не из `/opt/processmap-test/frontend`. Собранный `dist/` содержит изменения, но runtime их не отдаёт.

### 2.4 Browser structural check — ❌ Inconclusive

Playwright: CSS rules не найдены в `document.styleSheets` — consistent с отсутствием в served bundle. `.bpmnStage` не обнаружен на текущей странице (нет загруженной диаграммы).

### 2.5 DevTools Layers / Performance / FPS — ❌ Невозможно

Без корректно работающего runtime проверки Layers panel, Performance profile и FPS-измерение невозможны.

---

## 3. Checklist

### A. GPU Compositing
- [ ] A1: DevTools Layers panel shows `.djs-container` on separate compositor layer during pan.
- [ ] A2: No CPU paint spikes during pan in Performance profile.
- [ ] A3: `will-change: transform` present in computed styles of `.djs-canvas.pan-active`.
- [ ] A4: `contain: layout paint` present in computed styles during pan.

### B. Zoom Simplification
- [ ] B1: At zoom < 0.4: shapes show simplified rendering.
- [ ] B2: At zoom ≥ 0.4: full rendering restored.
- [ ] B3: Connection labels hidden at zoom < 0.2.
- [ ] B4: Click/hover/selection work at all zoom levels.
- [ ] B5: No shapes disappear at any zoom level.

### C. Performance
- [ ] C1: Large diagram pan FPS ≥ 55.
- [ ] C2: No perceived stutter during real mouse drag pan.
- [ ] C3: Small diagram pan FPS still 60.

### D. Stability
- [ ] D1: No shapes disappear.
- [ ] D2: Scrubber / minimap works.
- [ ] D3: No console errors.
- [ ] D4: No backend/API errors from canvas interactions.

---

## 4. Recommendations

1. **Решить mismatch сервера**: либо перезапустить Vite из `/opt/processmap-test/frontend`, либо настроить nginx на отдачу `dist/`, либо убедиться что `/app` синхронизирован с рабочей директорией.
2. **После разблокировки** повторить полный цикл verification checklist (A1–D4).
3. **Code quality**: рассмотреть возможность извлечения `bindOverlayPanDebouncer` в отдельный файл, чтобы избежать дублирования с `fix/canvas-overlay-debounce-v1`.

---

## 5. Git Proof

```bash
cd /opt/processmap-test
git branch --show-current
# (detached HEAD или feature branch — проверяется отдельно)

git diff --name-only
# frontend/src/components/process/BpmnStage.jsx
# frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js
# frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js
# frontend/src/styles/legacy/legacy_bpmn.css

git diff --stat
# 4 files changed, 168 insertions(+), 2 deletions(-)
```

---

## 6. Handoff

**Цель контура**: Оптимизация pan BPMN-холста через GPU-композитинг и упрощение фигур по zoom.  
**Что закрыто**: Код реализации написан, собран, соответствует спецификации.  
**Что осталось**: Runtime verification blocked из-за mismatch между `dist/` и `:5177`. Требуется перезапуск dev-сервера или корректная синхронизация окружения.  
**Риски**: Низкий — код качественный, но без runtime proof FPS target ≥55 не доказан.
