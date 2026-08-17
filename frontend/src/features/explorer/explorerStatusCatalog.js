/**
 * P3 [А]: единый справочник статусов таблицы explorer (точка 7px + подпись).
 *
 * Два домена, НЕ смешиваются:
 *  - folder context_status (API: none/as_is/to_be) — редактируется из таблицы
 *    через apiUpdateFolder(context_status).
 *  - session status (API: draft/in_progress/review/ready/archived, manual) —
 *    редактируется через apiPatchSession с transition-матрицей (см. sessionStatus.js).
 *  - project passport.status — free-form (active/on_hold/done/completed), домен
 *    продуктом не определён → read-only бейдж (без поповера).
 *
 * Палитра владельца: AS IS — серый, TO BE — оранжевый, «В работе» — синий,
 * «Готово» — зелёный, «Архив» — приглушённый. draft/ревью добавлены для
 * полного покрытия session-домена (Черновик — серый, На ревью — фиолетовый).
 */

import {
  getAllowedNextStatuses,
  normalizeManualSessionStatus,
} from "../workspace/sessionStatus.js";
import { normalizeExplorerContextStatus } from "./explorerContextStatusModel.js";

// ─── Catalog ─────────────────────────────────────────────────────────────────

export const EXPLORER_STATUS_CATALOG = {
  none: { id: "none", label: "—", tone: "muted" },
  as_is: { id: "as_is", label: "AS IS", tone: "gray" },
  to_be: { id: "to_be", label: "TO BE", tone: "orange" },
  draft: { id: "draft", label: "Черновик", tone: "gray" },
  in_progress: { id: "in_progress", label: "В работе", tone: "blue" },
  review: { id: "review", label: "На ревью", tone: "purple" },
  ready: { id: "ready", label: "Готово", tone: "green" },
  archived: { id: "archived", label: "Архив", tone: "muted" },
  on_hold: { id: "on_hold", label: "Пауза", tone: "orange" },
};

export const EXPLORER_STATUS_ORDER = [
  "none",
  "as_is",
  "to_be",
  "draft",
  "in_progress",
  "review",
  "ready",
  "on_hold",
  "archived",
];

// tone → классы точки 7px (и мягкого фона бейджа)
export const EXPLORER_STATUS_TONE_CLASSES = {
  gray: { dot: "bg-slate-400", text: "text-fg/80" },
  orange: { dot: "bg-amber-500", text: "text-fg/80" },
  blue: { dot: "bg-blue-500", text: "text-fg/80" },
  green: { dot: "bg-emerald-600", text: "text-fg/80" },
  purple: { dot: "bg-violet-400", text: "text-fg/80" },
  muted: { dot: "bg-slate-300", text: "text-muted/80" },
};

export const EXPLORER_STATUS_DOMAINS = ["folder", "project", "session"];

// ─── Domain mapping (API value → catalog id) ─────────────────────────────────

export function mapFolderContextStatusToCatalog(valueRaw) {
  return normalizeExplorerContextStatus(valueRaw); // none | as_is | to_be
}

export function mapSessionStatusToCatalog(valueRaw) {
  return normalizeManualSessionStatus(valueRaw, "draft") || "draft";
}

// project passport.status free-form: покрываем известные значения, остальное — «—».
export function mapProjectStatusToCatalog(valueRaw) {
  const v = String(valueRaw || "").trim().toLowerCase();
  if (!v || v === "active") return "none";
  if (v === "on_hold") return "on_hold";
  if (v === "done" || v === "completed") return "ready";
  if (v === "archived" || v === "archive") return "archived";
  return "none";
}

export function mapStatusToCatalog(domain, valueRaw) {
  if (domain === "folder") return mapFolderContextStatusToCatalog(valueRaw);
  if (domain === "session") return mapSessionStatusToCatalog(valueRaw);
  if (domain === "project") return mapProjectStatusToCatalog(valueRaw);
  return "none";
}

export function getExplorerStatusEntry(domain, valueRaw) {
  const id = mapStatusToCatalog(domain, valueRaw);
  const entry = EXPLORER_STATUS_CATALOG[id] || EXPLORER_STATUS_CATALOG.none;
  const tones = EXPLORER_STATUS_TONE_CLASSES[entry.tone] || EXPLORER_STATUS_TONE_CLASSES.muted;
  return { ...entry, dotClass: tones.dot, textClass: tones.text };
}

// ─── Editable options ────────────────────────────────────────────────────────

/**
 * Опции поповера. folder: полный контекстный набор. session: текущий статус +
 * разрешённые переходы (transition-матрица). project: [] (read-only).
 */
export function getExplorerStatusOptions(domain, currentValueRaw) {
  if (domain === "folder") {
    return ["none", "as_is", "to_be"].map((id) => ({ ...EXPLORER_STATUS_CATALOG[id] }));
  }
  if (domain === "session") {
    const current = mapSessionStatusToCatalog(currentValueRaw);
    const allowed = getAllowedNextStatuses(current);
    return EXPLORER_STATUS_ORDER.filter(
      (id) => allowed.has(id) && ["draft", "in_progress", "review", "ready", "archived"].includes(id),
    ).map((id) => ({ ...EXPLORER_STATUS_CATALOG[id] }));
  }
  return [];
}

export function isExplorerStatusEditable(domain) {
  return domain === "folder" || domain === "session";
}

// ─── Optimistic change (pure reducer) ────────────────────────────────────────

/**
 * Оптимистичная смена статуса. state: { current, pending, saving }.
 *  - select(next): UI сразу показывает next (pending=next, saving=true).
 *  - success(serverValue): фиксируем серверное значение.
 *  - failure(): откат на current до optimistic-правки.
 */
export function explorerStatusChangeReducer(state, action) {
  const prev = state && typeof state === "object" ? state : {};
  const current = String(prev.current || "none");
  switch (action?.type) {
    case "select": {
      const next = String(action.value || current);
      if (next === current) return { current, pending: current, saving: false };
      return { current, pending: next, saving: true };
    }
    case "success": {
      const serverValue = String(action.value || prev.pending || current);
      return { current: serverValue, pending: serverValue, saving: false };
    }
    case "failure":
      return { current, pending: current, saving: false };
    default:
      return { current, pending: String(prev.pending || current), saving: Boolean(prev.saving) };
  }
}
