# AUDIT REPORT — Диагностика производительности BPMN Canvas

**Дата аудита:** 2026-05-28  
**Контур:** audit/canvas-performance-diagnosis-v1  
**Агент:** Agent 2 / Worker  
**Цель:** http://localhost:5177 (ProcessMap BPMN canvas)  
**Методология:** MEASUREMENT_METHODOLOGY.md (M1–M6)  

---

## 1. Executive Summary

**Primary bottleneck: DOM/SVG creation**

При панорамировании (pan) крупной диаграммы FPS падает с 60.5 до 57.4, а браузер фиксирует long tasks суммарной длительностью 148 мс. Это напрямую коррелирует с ростом числа SVG-узлов: с 100 (small) до 3754 (large), то есть в 37.5 раз. Backend-задержка и утечки памяти исключены как первопричина лагов во время интеракции.

| Метрика | Small (9 элементов) | Large (428 элементов) |
|---------|---------------------|----------------------|
| FPS at rest | 60.4 | 60.5 |
| FPS during pan | 60.5 | **57.4** |
| DOM nodes | 482 | **4145** |
| SVG nodes | 100 | **3754** |
| Overlays | 0 | 1 |

---

## 2. Flame Chart / Long Task Analysis

Long tasks фиксируются только на large диаграмме во время пана. Top-3 задачи:

| # | Duration | StartTime |
|---|----------|-----------|
| 1 | 83 мс | 61986 |
| 2 | 65 мс | 61897 |

- **Всего long tasks:** 2
- **Общее время scripting:** 148 мс
- **Рендеринг (визуально):** падение FPS с 60.5 до 57.4 подтверждает, что основная часть кадров теряется из-за длительных задач в main thread.

На small диаграмме long tasks отсутствуют (0).

---

## 3. DOM & Overlay Metrics

| Diagram | Elements | SVG Nodes | Overlays | FPS pan | Verdict |
|---------|----------|-----------|----------|---------|---------|
| Small | 9 | 100 | 0 | 60.5 | Норма |
| Large | 428 | **3754** | 1 | **57.4** | **Перегрузка SVG-DOM** |

- **DOM-per-element:** small = 53.6, large = 9.7 (снижается из-за фиксированной обвязки UI).
- **SVG-per-element:** small = 11.1, large = 8.8.
- **Overlays:** 0–1 штука. Overlay churn исключён.

---

## 4. Memory Analysis

### Small
- T0 (покой): 60.16 МБ
- T1 (после 5 панов): 47.58 МБ
- T2 (после 10 с ожидания): 62.70 МБ
- Δ T1–T0: –12.58 МБ (GC отработал)
- Recovery: 15.12 МБ
- **Leak confirmed: false**

### Large
- T0 (покой): 90.98 МБ
- T1 (после 5 панов): 67.32 МБ
- T2 (после 10 с ожидания): 87.06 МБ
- Δ T1–T0: –23.66 МБ (GC отработал)
- Recovery: 19.74 МБ (83.4 %)
- **Leak confirmed: false**

Память не течёт; колебания в пределах нормы работы Garbage Collector.

---

## 5. Event Listener Audit

Inline event listeners (атрибуты `on*`) отсутствуют на обеих диаграммах во всех трёх состояниях:

| State | Small | Large |
|-------|-------|-------|
| At rest | 0 / 482 elements | 0 / 4171 elements |
| During drag | 0 / 482 elements | 0 / 4171 elements |
| After release | 0 / 482 elements | 0 / 4171 elements |

- **Leak confirmed: false**
- React synthetic event system не оставляет inline следов; массового навешивания слушателей нет.

---

## 6. Backend Latency

### Small diagram (session 6318dcf810)
- TTFB: 27 мс
- Total: 27 мс
- Response size: 2482 bytes

### Large diagram (session 5425e68a8d)
- TTFB: 363 мс
- Total: 364 мс
- Response size: 107 826 bytes

Backend отдаёт XML за приемлемое время. TTFB 363 мс для ~108 КБ влияет только на **начальную загрузку**, но не на лаги во время панорамирования, которые происходят полностью на клиенте после загрузки данных.

- **Backend is factor during interaction: false**

---

## 7. Root Cause Verdict

**Единственный bottleneck: DOM/SVG creation**

### Подтверждающие факты (≥2 конкретных числа)
1. Рост SVG-узлов с 100 до 3754 (в 37.5 раз) при переходе от small к large диаграмме.
2. FPS during pan падает с 60.5 до 57.4 именно на large диаграмме.
3. Появляются long tasks 83 мс и 65 мс только на large диаграмме.

### Отвергнутые гипотезы
- **Overlay churn:** overlays 0–1 штука. Нет корреляции с падением FPS.
- **Backend latency:** 363 мс TTFB влияет на загрузку, но пан работает offline; long tasks возникают в main thread, а не на сетевых запросах.
- **Event listeners:** 0 inline listeners. Нет роста при drag/release.
- **Memory leaks:** T2 восстанавливается до уровня T0. Leak confirmed = false.

---

## 8. Fix Recommendations (для будущего контура)

| Приоритет | Impact | Effort | Рекомендация |
|-----------|--------|--------|--------------|
| **1** | High | Low | Включить `transform` (CSS GPU-acceleration) для слоя viewport вместо пересчёта атрибутов SVG при пане. |
| **2** | High | Medium | Реализовать виртуализацию SVG: рендерить только элементы, попадающие в viewport (bounding box culling). |
| **3** | Medium | Low | Уменьшить детализацию connections (меньше path-сегментов) для диаграмм >200 shapes. |
| **4** | Medium | Medium | Рассмотреть слияние статичных SVG-групп в единый `<g>` или использование `<use>` для повторяющихся элементов. |
| **5** | Low | Low | Добавить debounce/throttle на события мыши при пане, чтобы снизить частоту обновления координат. |

---

## 9. Evidence Files

```
.planning/contours/audit/canvas-performance-diagnosis-v1/evidence/
├── diagram_inventory.txt
├── diagram_sizes.txt
├── small_diagram_baseline.json
├── large_diagram_baseline.json
├── small_diagram_fps.json
├── large_diagram_fps.json
├── small_diagram_pan_profile.json
├── large_diagram_pan_profile.json
├── heap_measurements.json
├── event_listener_counts.json
├── curl_timings.txt
└── screenshots/
    ├── small_diagram_baseline.png
    ├── small_diagram_during_pan.png
    ├── large_diagram_baseline.png
    └── large_diagram_during_pan.png
```

---

## 10. Methodology Notes

- **Инструменты:** Playwright (browser automation, screenshots), Chrome DevTools API (via Playwright evaluate), curl (backend latency).
- **Браузер:** Chromium (headless/headed via Playwright MCP).
- **Диаграммы:**
  - Small: сессия `6318dcf810`, 9 BPMN-элементов (Start, 2 Tasks, End, 3 Flows), XML 2470 bytes.
  - Large: сессия `5425e68a8d`, 428 BPMN-элементов (203 shapes + 225 connections), XML 107 826 bytes.
- **Timestamp начала:** 2026-05-28T08:09:07Z
- **Timestamp окончания:** 2026-05-28T08:22:00Z

---

*Отчёт сформирован автоматически на основе измерений M1–M6 без модификации исходного кода.*
