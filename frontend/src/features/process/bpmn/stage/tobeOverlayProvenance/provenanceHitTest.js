// Чистый hit-test по диаграмм-координатам для подсветки provenance (T7).
//
// Read-only подсветка происхождения на ghost-подложке AS IS: hover-точка
// (координаты canvas editor'а, семантика di.bounds) -> id ghost-элемента.
// Без DOM/diagram-js: единственная точка контакта — адаптер
// hitTestGhostRegistry под интерфейс diagram-js ElementRegistry (forEach).
// Потребители: T8–T11.

const DEFAULT_TOLERANCE = 6;

// Нормализует rect: negative width/height -> abs (защита от перевернутых
// bounds), нечисловые/неfinite значения -> null (запись пропускается).
function normalizeRect(rect) {
  if (!rect || typeof rect !== "object") return null;
  const { id } = rect;
  let x = Number(rect.x);
  let y = Number(rect.y);
  let width = Number(rect.width);
  let height = Number(rect.height);
  // negative width/height: нормализация с переносом origin (rect разворачивается
  // в противоположную сторону), а не просто abs.
  if (width < 0) {
    x += width;
    width = Math.abs(width);
  }
  if (height < 0) {
    y += height;
    height = Math.abs(height);
  }
  if (typeof id !== "string" || !id) return null;
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { id, x, y, width, height };
}

// Расстояние точки -> прямоугольника: 0 внутри, иначе до ближайшей грани/угла.
function distanceToRect(px, py, rect) {
  const dx = Math.max(rect.x - px, 0, px - (rect.x + rect.width));
  const dy = Math.max(rect.y - py, 0, py - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

// Hit-test: точка -> id ближайшего rect.
//
// rect: { id: string, x, y, width, height } (семантика di.bounds);
// point: { x, y } — координаты В ДИАГРАММЕ (canvas coordinate system editor'а);
// tolerance: number, default 6 — snap-to-nearest вокруг расширенных границ.
// returns: rect.id | null.
//
// Правила: прямое попадание (внутри, включая границу) -> id rect, при
// нескольких — ближайший (внутри = 0), tie -> первый в порядке массива;
// промах в пределах tolerance -> ближайший такой rect; иначе null.
export function hitTestRectId(point, rects, tolerance = DEFAULT_TOLERANCE) {
  const px = Number(point?.x);
  const py = Number(point?.y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  if (!Array.isArray(rects) || rects.length === 0) return null;
  const tol = Number.isFinite(Number(tolerance)) ? Math.abs(Number(tolerance)) : DEFAULT_TOLERANCE;

  let bestId = null;
  let bestDist = Infinity;
  for (const raw of rects) {
    const rect = normalizeRect(raw);
    if (!rect) continue;
    const dist = distanceToRect(px, py, rect);
    if (dist <= tol && dist < bestDist) {
      bestDist = dist;
      bestId = rect.id;
    }
  }
  return bestId;
}

// Адаптер под diagram-js ElementRegistry: единственная точка контакта
// с diagram-js. Тянет у элементов di.bounds {x,y,width,height} + id через
// registry API (forEach по registry), делегируя в hitTestRectId.
// Урок C1: интерфейс registry, а не мок глубоко внутри.
export function hitTestGhostRegistry(point, ghostElementRegistry, tolerance = DEFAULT_TOLERANCE) {
  const forEach = ghostElementRegistry?.forEach;
  if (typeof forEach !== "function") return null;
  const rects = [];
  forEach.call(ghostElementRegistry, (element) => {
    const bo = element?.businessObject || element;
    const bounds = bo?.di?.bounds;
    if (!bounds) return;
    rects.push({ id: element.id, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  });
  return hitTestRectId(point, rects, tolerance);
}
