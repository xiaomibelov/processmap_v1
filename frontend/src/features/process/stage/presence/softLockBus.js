// softLockBus — advisory soft-lock (contour feature/async-save-pipeline-step2,
// UI.md §7): кто какой элемент редактирует, из presence active_users →
// бейджи на канвасе (BpmnStage overlays). Pure-логика отдельно от JSX;
// bus — тонкий registry между ProcessStage (presence) и BpmnStage (overlays).

function toText(value) {
  return String(value || "").trim();
}

import { presenceEditingBadgeText } from "./presenceModel.js";

/**
 * Актёры с editingElementId → цели бейджей на канвасе. Себя (isCurrentUser)
 * пропускаем; по элементу — один бейдж (первый актор).
 * @returns {Array<{elementId: string, label: string, badge: string}>}
 */
export function computeSoftLockTargets(actorsRaw = []) {
  const actors = Array.isArray(actorsRaw) ? actorsRaw : [];
  const out = [];
  const seen = new Set();
  for (const actor of actors) {
    if (actor?.isCurrentUser === true) continue;
    const elementId = toText(actor?.editingElementId);
    if (!elementId || seen.has(elementId)) continue;
    seen.add(elementId);
    const label = toText(actor?.label) || "Пользователь";
    out.push({ elementId, label, badge: presenceEditingBadgeText(actor) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bus: ProcessStage публикует цели, BpmnStage подписывается и рисует/снимает
// overlay-бейджи. Смена целей — подписка (не поллинг).
// ---------------------------------------------------------------------------
let targets = [];
const listeners = new Set();

export function setSoftLockTargets(next) {
  targets = Array.isArray(next) ? next : [];
  for (const listener of listeners) {
    try {
      listener(targets);
    } catch {
      // no-op
    }
  }
}

export function getSoftLockTargets() {
  return targets;
}

export function subscribeSoftLockTargets(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Провайдер выбранного элемента: BpmnStage регистрирует getter чтения
// modeler selection; useSessionPresence читает его на каждом heartbeat
// (UI.md §7 — editingElementId в presence-touch, снятие при деселекте).
// ---------------------------------------------------------------------------
let editingElementGetter = null;

export function setPresenceEditingElementGetter(getter) {
  editingElementGetter = typeof getter === "function" ? getter : null;
}

export function getPresenceEditingElement() {
  try {
    return toText(editingElementGetter?.());
  } catch {
    return "";
  }
}
