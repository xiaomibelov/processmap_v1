// Z1 TOBE-UX — pure-математика viewBox zoom/pan для самописного SVG-канваса.
// Без DOM/React — тестируется node --test. Модель: zoom/pan = изменение
// атрибута viewBox (как viewport-навигация bpmn-js), поэтому svgPoint()
// через getScreenCTM() и drag-математика продолжают работать без правок.

export const ZOOM_STEP = 1.2; // шаг кнопок ± (как «+0.2» у bpmn-хоста, но мультипликативно)
export const WHEEL_ZOOM_STEP = 1.15; // шаг wheel-зума за нотч
export const MIN_VIEW_WIDTH = 60; // предел zoom-in (единицы модели)
export const MAX_ZOOM_OUT_FACTOR = 12; // предел zoom-out относительно fit-ширины
export const MINIMAP_NODE_THRESHOLD = 50; // миникарта показывается при >50 узлах

export function parseViewBox(str) {
  const [x = 0, y = 0, w = 100, h = 100] = String(str || "").trim().split(/\s+/).map(Number);
  return { x, y, w, h };
}

export function formatViewBox(v) {
  return `${v.x} ${v.y} ${v.w} ${v.h}`;
}

// zoom вокруг точки (px, py) в координатах модели; factor>1 = приближение
export function zoomAroundPoint(view, factor, px, py, { minW = MIN_VIEW_WIDTH, maxW = Infinity } = {}) {
  const w = Math.min(Math.max(view.w / factor, minW), maxW);
  const real = view.w / w; // фактический factor после клампов
  const h = view.h / real;
  return {
    x: px - (px - view.x) / real,
    y: py - (py - view.y) / real,
    w,
    h,
  };
}

// zoom вокруг центра вида (кнопки ±)
export function zoomAroundCenter(view, factor, opts) {
  return zoomAroundPoint(view, factor, view.x + view.w / 2, view.y + view.h / 2, opts);
}

// pan: сдвиг вида на (dx, dy) в координатах модели
export function panBy(view, dx, dy) {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

// 1:1 — одна единица модели = один CSS-пиксель (ширина вида = ширине контейнера в px),
// центр сохраняется, пропорции — по аспекту контейнера
export function zoomToActualSize(view, containerW, containerH) {
  const cx = view.x + view.w / 2;
  const cy = view.y + view.h / 2;
  const w = Math.max(Number(containerW) || 100, 1);
  const h = Math.max(Number(containerH) || 100, 1);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// центрирование вида на точке (например, на узле из навигации замечаний);
// целевая ширина — не шире текущей и не уже targetW (чтобы узел был читаем)
export function centerOn(view, px, py, targetW, fitW) {
  const w = Math.min(view.w, Math.max(Number(targetW) || 0, MIN_VIEW_WIDTH), Number(fitW) || view.w);
  const h = (view.h / view.w) * w;
  return { x: px - w / 2, y: py - h / 2, w, h };
}

// текущий масштаб в процентах относительно fit (100% = весь граф вписан)
export function zoomPercent(view, fit) {
  if (!fit || !fit.w) return 100;
  return Math.round((fit.w / view.w) * 100);
}
