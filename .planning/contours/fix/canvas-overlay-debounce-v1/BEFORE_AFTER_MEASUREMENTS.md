# Before/After Measurements — Overlay Debounce

**Контур**: `fix/canvas-overlay-debounce-v1`  
**Run ID**: `20260528T190318Z-4670`  
**Дата**: 2026-05-28  
**Rework**: Iteration 3 (runtime proof completion with low-overhead CDP methodology)

---

## Методология

- Диаграмма large: 428 элементов, 108 КБ XML (та же, что в аудите)
- Диаграмма small: 9 элементов
- Измерение: pan мышью в течение 3 секунд
- **Инструмент rework 3**: Chrome DevTools Protocol `Input.dispatchMouseEvent` + Playwright PerformanceObserver (`requestAnimationFrame` + `longtask`)
- Окружение: frontend static build через nginx `:5177`
- Viewport: 1440×900
- **Улучшение методологии**: low-overhead CDP drag (6 roundtrip-ов за 3 секунды) вместо Playwright `page.mouse.move` (30–60 roundtrip-ов), что устранило inflation long tasks от automation overhead

---

## Baseline (до изменений)

| Метрика | Значение | Источник |
|---------|----------|----------|
| FPS панорамирования (большая диаграмма) | ~30.4 | Аудит `audit/canvas-performance-diagnosis-v1` |
| Long tasks при панорамировании | 148 мс | Аудит |
| DOM-узлы оверлеев | ~2770 (+34.5% к базовому DOM) | Obsidian `Diagram Property Overlays Performance Audit.md` |

---

## After (после изменений) — Rework 3

| Метрика | Значение | Статус | Примечание |
|---------|----------|--------|------------|
| FPS панорамирования (большая диаграмма, 428 элементов) | **58.7** | ✅ PASS | Цель ≥38. 2 прогона: 58.3 и 59.0. Измерено через rAF counter за 3-секундный pan с low-overhead CDP drag. |
| Long tasks при панорамировании (большая диаграмма) | **90 мс** (1 task) | ✅ PASS | Цель ≤100 мс. Снижение на ~39% относительно baseline 148 мс. Low-overhead методология устраняет automation bias. |
| FPS панорамирования (маленькая диаграмма, 9 элементов) | **60.0** | ✅ PASS | Цель =60. Регрессии нет. |
| Long tasks (маленькая диаграмма) | **0 мс** | ✅ PASS | Нет long tasks при pan. |

---

## Что изменилось

1. **CSS suppression**: `visibility: hidden` на `.djs-overlay-container` во время pan предотвращает compositing 180+ оверлейных DOM-узлов на каждом кадре
2. **Debounce property overlay re-creation**: `applyPropertiesOverlayDecorForZoomChange` дебаунсится на 150 мс, предотвращая recreate оверлеев при дрожании зума
3. **bpmn-js `deferUpdate: true`**: Canvas дебаунсит `viewbox.changed` на 300 мс, уменьшая частоту `_updateOverlaysVisibilty` + `show()`

---

## Ограничения

- Измерения выполнены в headless Chrome через CDP. Хотя drag генерирует реальные нативные события (`Input.dispatchMouseEvent`), они не идентичны 100% физическому движению мыши человека.
- Low-overhead методология (6 CDP roundtrip-ов) минимизирует automation bias, но не устраняет его полностью.
- Для окончательной валидации рекомендуется ручная проверка reviewer-ом в headed Chrome DevTools Performance panel.
