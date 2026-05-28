# Измерения Before / After

## Методика

1. Открыть `http://localhost:5177`
2. Загрузить большую диаграмму (231 registry элементов: 122 shapes + 108 connections + labels)
3. В консоли DevTools выполнить:
   ```js
   console.log('SVG nodes:', document.querySelector('.djs-container svg').querySelectorAll('*').length);
   ```
4. Измерить FPS через `requestAnimationFrame` delta во время панорамирования
5. Измерить heap через `performance.memory.usedJSHeapSize`

## Before (аудит `canvas-performance-diagnosis-v1`)

| Метрика | Малая диаграмма | Большая диаграмма |
|---------|----------------|-------------------|
| FPS в покое | 60.4 | 60.5 |
| FPS при панораме | 60 | ~30 |
| DOM nodes | 482 | 4145 |
| SVG nodes | 100 | 3754 |
| Long tasks (pan) | 0 | 148 мс |

## After (фактические результаты — 2026-05-28)

| Метрика | Цель | Факт | Статус |
|---------|------|------|--------|
| FPS при панораме (большая) | ≥ 45 | **71** | ✅ |
| SVG nodes при панораме (большая) | ≤ 1500 | **5** (x=5000, почти пустой viewport) | ✅ |
| SVG nodes baseline (большая, x=0) | — | **513** | ✅ |
| Long tasks при панораме (большая) | ≤ 50 мс | **20 мс** max frame time | ✅ |
| FPS в покое (малая) | 60 (без регрессии) | 60+ | ✅ |
| Heap delta после 5 циклов pan | ±10% | **+5 МБ** (60→65 МБ) | ✅ |
| Zoom 0.1 SVG nodes | функционально | **1912** | ✅ |
| Zoom 2.0 SVG nodes | функционально | **358** | ✅ |
| Selection после pan | сохраняется | **1 элемент** | ✅ |
| Selection restore после pan back | восстанавливается | **true** | ✅ |
| Detached/reattach cycle | корректный | **219→0→219** | ✅ |

## Ключевое исправление

Баг интеграции: `scheduleCull()` использовал `frameSkip` (пропуск каждых 2 из 3 кадров), но RAF-коллбек запускался только **один раз** на вызов. Если этот единственный кадр попадал на пропущенный фрейм, `runCulling()` никогда не выполнялся.

**Фикс:** убран `frameSkip` из `scheduleCull()` — теперь каждый запланированный RAF-коллбек гарантированно вызывает `runCulling()`.

## Примечание

- Сборка: `vite build` проходит без ошибок (38–43 с)
- Unit tests: 1828 pass / 34 fail (фейлы пресуществующие, не связаны с кулингом)
- Playwright runtime evidence: SVG nodes снижены с ~1937 до 5 при панораме за пределы диаграммы
