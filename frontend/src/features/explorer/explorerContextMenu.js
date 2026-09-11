/**
 * Keyboard-модель ContextMenu (workspace explorer): индексы пунктов меню
 * (без separator'ов) и разрешение клавиш навигации. Чистые функции — без
 * DOM/React, покрываются node --test. UI-контракт (a11y):
 *   ArrowUp/ArrowDown — перемещение по пунктам (separator пропускаются,
 *     зацикливание через крайние);
 *   Home/End — первый/последний пункт;
 *   Escape — закрыть меню (возврат фокуса на trigger делает компонент);
 *   Enter/прочие клавиши — здесь не обрабатываются (Enter активирует
 *     нативный <button role="menuitem">).
 */

export function menuItemIndexes(items = []) {
  const list = Array.isArray(items) ? items : [];
  const indexes = [];
  list.forEach((item, index) => {
    if (!item || item.separator) return;
    indexes.push(index);
  });
  return indexes;
}

/**
 * Разрешить клавишу меню. currentIndex — data-menu-index активного пункта
 * (-1, если фокус вне пунктов). Возвращает:
 *   { index }  — фокус переходит на пункт с этим индексом;
 *   { close: true } — Escape, меню закрывается;
 *   null       — клавиша меню не обрабатывается.
 */
export function resolveMenuKey(items, currentIndex, key) {
  const indexes = menuItemIndexes(items);
  if (!indexes.length) return null;
  if (key === "Escape") return { close: true };
  if (key === "Home") return { index: indexes[0] };
  if (key === "End") return { index: indexes[indexes.length - 1] };
  if (key !== "ArrowDown" && key !== "ArrowUp") return null;
  const position = indexes.indexOf(currentIndex);
  if (position === -1) {
    return { index: key === "ArrowDown" ? indexes[0] : indexes[indexes.length - 1] };
  }
  const next = (position + (key === "ArrowDown" ? 1 : -1) + indexes.length) % indexes.length;
  return { index: indexes[next] };
}
