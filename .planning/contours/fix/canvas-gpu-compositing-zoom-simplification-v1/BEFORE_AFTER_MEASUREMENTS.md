# BEFORE_AFTER_MEASUREMENTS.md

**Контур**: `fix/canvas-gpu-compositing-zoom-simplification-v1`

---

## Baseline (из предыдущих контуров)

| Метрика | Значение | Источник |
|---------|----------|----------|
| SVG-узлы на диаграмме (428 элементов) | 3754 | `audit/canvas-performance-diagnosis-v1` |
| Pan FPS (до оптимизаций) | ~30 | `audit/canvas-performance-diagnosis-v1` |
| Pan FPS (после overlay debounce) | ~50 | `fix/canvas-overlay-debounce-v1` |
| Воспринимаемый лаг | Остаётся | User report |

## Target (после GPU compositing + zoom simplification)

| Метрика | Цель |
|---------|------|
| Pan FPS большой диаграммы | ≥ 55 |
| Воспринимаемый лаг | Устранён |
| Маленькая диаграмма | 60 FPS, без регрессии |

## After (измерения этого контура)

### Build/deploy
- `npm run build`: 35.47 с, 0 ошибок, 1014 модулей
- Docker deploy: dist скопирован в nginx-контейнер

### Runtime verification (Playwright)
- Страница `http://localhost:5177/app?project=70d1c5ffaf&session=9a8030f136` загружается
- Диаграмма отображается (2 pools, 6 lanes, 56+ tasks, connections)
- `zoom-full` → `zoom-simplified` классы переключаются корректно

### FPS / Paint time
**НЕ ИЗМЕРЕН** — требует:
- Chrome DevTools Performance profile во время 3-секундного pan
- Или `measureFPS()` скрипта в консоли во время drag

### DevTools Layers
**НЕ ИЗМЕРЕН** — требует интерактивного Chrome DevTools.

## Рекомендации для Reviewer

1. Открыть `http://localhost:5177/app?project=70d1c5ffaf&session=9a8030f136`
2. Chrome DevTools → Performance → Record
3. 3-секундный pan диаграммы мышью
4. Проверить:
   - FPS meter: стабильные 55+
   - Paint events: минимальные (должен доминировать Composite)
   - Layers panel: SVG-холст на отдельном compositor-слое
5. Повторить при zoom < 0.4 и < 0.2
