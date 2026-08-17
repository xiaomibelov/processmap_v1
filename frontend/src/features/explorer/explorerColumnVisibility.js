/**
 * P4 [А]: чистая логика адаптива таблицы explorer по ширине КОНТЕЙНЕРА
 * (не viewport — сайдбар схлопывается) + решение «текст обрезан» для marquee.
 *
 * Приоритет скрытия колонок (владелец, дословно):
 *   сначала «Обновлено» → «Ответственный» → «Состав»;
 *   «Название» (min-width ≥260px) и «Статус» не скрываются никогда.
 *   <680px — compact: двухстрочные строки (название+статус / мета-строка
 *   «состав · ответственный · обновлено»), шапка таблицы скрыта.
 *
 * Заменяет временную меру P0 (minWidth 1044 + горизонтальный скролл).
 *
 * Механизм: ResizeObserver на контейнере таблицы + эта чистая функция
 * (jsdom-тестируема). Container queries не выбраны: compact-режим требует
 * структурной перекладки строки (мета-строка, скрытие thead), чего чистый
 * CSS не делает; заодно нет нужды в Tailwind container-queries plugin.
 */

import {
  compositionProjectsText,
  firstName,
  formatRelativeTime,
  sessionsCounterText,
} from "./explorerTableFormat.js";
import {
  getExplorerBusinessAssignee,
  formatExplorerUserDisplay,
} from "./explorerAssigneeModel.js";

// Сетка ширин (ТЗ п.8): Название min 260 (flex) + Тип 88 + Состав 210 +
// Ответственный 176 + Статус 88 + Обновлено 190 + Действия 32 = 1044
// (+72 с сигнальными колонками).
export const EXPLORER_LAYOUT_FULL_MIN = 1044;
export const EXPLORER_LAYOUT_NO_UPDATED_MIN = 854; // FULL_MIN − 190 («Обновлено»)
export const EXPLORER_LAYOUT_COMPACT_MAX = 679; // <680 — двухстрочные строки
export const EXPLORER_NAME_MIN_WIDTH = 260;
const SIGNAL_COLUMNS_EXTRA = 72; // 2 × 36px (⚠/📋), tree-профиль сейчас без них

/**
 * Раскладка колонок по ширине контейнера (px).
 * width <= 0 / не число (первый кадр до ResizeObserver) → полный режим,
 * чтобы не прятать колонки до первого замера.
 */
export function getExplorerColumnLayout(widthRaw, { signalColumns = false } = {}) {
  const width = Number(widthRaw);
  const extra = signalColumns ? SIGNAL_COLUMNS_EXTRA : 0;
  const fullMin = EXPLORER_LAYOUT_FULL_MIN + extra;
  const noUpdatedMin = EXPLORER_LAYOUT_NO_UPDATED_MIN + extra;
  const full = {
    compact: false,
    showType: true,
    showComposition: true,
    showAssignee: true,
    showUpdated: true,
    nameMinWidth: EXPLORER_NAME_MIN_WIDTH,
  };
  if (!Number.isFinite(width) || width <= 0 || width >= fullMin) return full;
  if (width <= EXPLORER_LAYOUT_COMPACT_MAX) {
    // compact: колонки Тип/Состав/Ответственный/Обновлено уходят в мета-строку.
    return {
      compact: true,
      showType: false,
      showComposition: false,
      showAssignee: false,
      showUpdated: false,
      nameMinWidth: 0, // двухстрочная строка: название получает всю ширину строки
    };
  }
  if (width >= noUpdatedMin) {
    return { ...full, showUpdated: false };
  }
  return { ...full, showUpdated: false, showAssignee: false };
}

/** Число видимых колонок (для colSpan строк loading/empty/error). */
export function explorerVisibleColumnCount(layout, { signalColumns = false } = {}) {
  const l = layout && typeof layout === "object" ? layout : getExplorerColumnLayout(0);
  let n = 3; // Название + Статус + действия — всегда
  if (!l.compact) {
    if (l.showType) n += 1;
    if (l.showComposition) n += 1;
    if (l.showAssignee) n += 1;
    if (signalColumns) n += 2;
    if (l.showUpdated) n += 1;
  }
  return n;
}

/** «Текст реально обрезан» для marquee: запас 1px против субпиксельного округления. */
export function isExplorerTextTruncated(scrollWidthRaw, clientWidthRaw) {
  const scrollWidth = Number(scrollWidthRaw);
  const clientWidth = Number(clientWidthRaw);
  if (!Number.isFinite(scrollWidth) || !Number.isFinite(clientWidth) || clientWidth <= 0) return false;
  return scrollWidth > clientWidth + 1;
}

/** Параметры marquee-анимации: смещение и длительность (~40px/с, 3–12с). */
export function explorerMarqueeMotion(scrollWidthRaw, clientWidthRaw) {
  const scrollWidth = Number(scrollWidthRaw);
  const clientWidth = Number(clientWidthRaw);
  if (!isExplorerTextTruncated(scrollWidth, clientWidth)) return { shiftPx: 0, durationSec: 0 };
  const shiftPx = Math.ceil(scrollWidth - clientWidth);
  const durationSec = Math.min(12, Math.max(3, shiftPx / 40));
  return { shiftPx, durationSec };
}

function compositionMetaText(item, kind) {
  if (kind === "folder") {
    const total = item?.descendant_trackable_sessions_count ?? item?.descendant_sessions_count;
    const done = item?.descendant_done_sessions_count;
    return [
      compositionProjectsText(item?.descendant_projects_count),
      sessionsCounterText(done, total),
    ].filter(Boolean).join(" · ");
  }
  if (kind === "project") {
    const total = item?.trackable_sessions_count ?? item?.descendant_sessions_count ?? item?.sessions_count;
    return sessionsCounterText(item?.done_sessions_count, total);
  }
  return "";
}

/**
 * Мета-строка compact-режима: «состав · ответственный · обновлено».
 * Пустые части опускаются; если всё пусто — «—» не ставим (пустая строка).
 */
export function buildExplorerRowMeta(item, kind) {
  const parts = [];
  const composition = compositionMetaText(item, kind);
  if (composition) parts.push(composition);
  // у session-строк колонки «Ответственный» нет вовсе — в мета не добавляем.
  if (kind !== "session") {
    const assigneeFull = formatExplorerUserDisplay(getExplorerBusinessAssignee(item));
    parts.push(assigneeFull ? firstName(assigneeFull) : "Не назначен");
  }
  const rel = formatRelativeTime(item?.rollup_activity_at || item?.updated_at);
  if (rel) parts.push(rel);
  return parts.join(" · ");
}
