// opsRebase — 409-rebase same-tab race (contour feature/async-save-pipeline-step1,
// UI.md §5). Клиент принимает {currentVersion, currentXml}, адоптит серверную
// версию в casVersionTracker (публикация в crossTabVersionSync сохраняется —
// tracker сам нотифицирует подписчиков) и replay'ит pendingOps на live modeler.
//
// Replay идёт через commandStack.execute с флагами контекста __pmOpId +
// __pmOpSource: "replay" — echo suppression: replay-команды re-fire'ятся через
// commandStack.changed, но commandToOps их пропускает, а outbox восстанавливает
// op с тем же opId (сервер идемпотентен по opId, двойная доставка безопасна).
//
// Отступление от UI.md §5: вместо applyOpsToModeler (vocabulary AI edit plans:
// addTask/rename/connect/…) replay реализован здесь через commandStack.execute —
// applyOps не покрывает command-derived op-типы (shape.move/resize/delete) и не
// умеет помечать контекст команд флагами эхо-подавления. Паттерн fuzzy-
// resolution по id/name зеркалит applyOps.resolveElement (правило единой
// реализации — behavioral parity, не копия кода).

import {
  setVersion as setTrackedDiagramStateVersion,
} from "../../../../../lib/casVersionTracker.js";
import { readConflictServerCurrentVersion } from "../../../../../features/session/casResponse.js";

function asText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return asText(value).toLowerCase().replace(/\s+/g, " ");
}

function elementName(element) {
  return asText(element?.businessObject?.name || element?.id || "");
}

function isConnectionLike(element) {
  return !!element && (Array.isArray(element?.waypoints) || /flow|edge|connection/i.test(String(element?.type || "")));
}

/**
 * Fuzzy-резолв элемента: точное совпадение по id → по name → префикс →
 * вхождение (скоринг как в applyOps.resolveElement: 5/4/3).
 * @returns {{element: Object, fuzzy: boolean} | null}
 */
export function resolveElementFuzzy(registry, ref, { allowConnections = true } = {}) {
  const token = asText(ref);
  if (!token || !registry) return null;
  const direct = registry.get(token);
  if (direct) return { element: direct, fuzzy: false };

  const normalized = normalizeKey(token);
  const elements = (registry.getAll?.() || []).filter((element) => {
    if (!element || String(element?.type || "") === "label") return false;
    return allowConnections ? true : !isConnectionLike(element);
  });
  let best = null;
  let bestScore = -1;
  for (const element of elements) {
    const idNorm = normalizeKey(element?.id);
    const nameNorm = normalizeKey(elementName(element));
    let score = -1;
    if (idNorm === normalized || nameNorm === normalized) score = 5;
    else if (nameNorm.startsWith(normalized) || idNorm.startsWith(normalized)) score = 4;
    else if (nameNorm.includes(normalized) || idNorm.includes(normalized)) score = 3;
    if (score > bestScore) {
      best = element;
      bestScore = score;
    }
  }
  return best ? { element: best, fuzzy: true } : null;
}

function replayFlags(op) {
  return { __pmOpId: asText(op?.opId), __pmOpSource: "replay" };
}

function safeExecute(commandStack, command, context) {
  try {
    commandStack.execute(command, context);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: asText(error?.message || error || "replay_execute_failed") };
  }
}

function replayOne(modeler, op) {
  const registry = modeler?.get?.("elementRegistry");
  const commandStack = modeler?.get?.("commandStack");
  if (!registry || !commandStack) {
    return { ok: false, error: "modeler_not_ready", fuzzyMiss: true };
  }
  const flags = replayFlags(op);
  const type = asText(op?.type);

  // create-op'ы в step1 не replay'ятся: серверный элемент мог получить другой
  // id/инцидентность — безопасный fallback на полный save (PLAN §6.4 research).
  if (type === "shape.create" || type === "connection.create") {
    return { ok: false, error: "create_replay_not_supported", fuzzyMiss: true };
  }

  const needConnection = type === "element.updateDi" && Array.isArray(op?.waypoints);
  const resolved = resolveElementFuzzy(registry, op?.elementId, { allowConnections: needConnection || type.startsWith("connection.") });
  if (!resolved) {
    return { ok: false, error: "element_not_found", fuzzyMiss: true };
  }
  const element = resolved.element;

  if (type === "element.updateProperties") {
    return safeExecute(commandStack, "element.updateProperties", {
      element,
      properties: op?.properties && typeof op.properties === "object" ? op.properties : {},
      ...flags,
    });
  }
  if (type === "shape.move") {
    const delta = op?.delta && Number.isFinite(Number(op.delta.x)) && Number.isFinite(Number(op.delta.y))
      ? { x: Number(op.delta.x), y: Number(op.delta.y) }
      : null;
    if (!delta) return { ok: false, error: "missing_delta", fuzzyMiss: true };
    return safeExecute(commandStack, "shape.move", {
      shape: element,
      delta,
      parent: element?.parent || null,
      ...flags,
    });
  }
  if (type === "shape.resize") {
    const b = op?.bounds;
    if (!b || !Number.isFinite(Number(b.width)) || !Number.isFinite(Number(b.height))) {
      return { ok: false, error: "missing_bounds", fuzzyMiss: true };
    }
    return safeExecute(commandStack, "shape.resize", {
      shape: element,
      newBounds: { x: Number(b.x) || 0, y: Number(b.y) || 0, width: Number(b.width), height: Number(b.height) },
      ...flags,
    });
  }
  if (type === "element.updateDi") {
    if (Array.isArray(op?.waypoints)) {
      return safeExecute(commandStack, "connection.updateWaypoints", {
        connection: element,
        newWaypoints: op.waypoints,
        ...flags,
      });
    }
    const b = op?.bounds;
    if (!b) return { ok: false, error: "missing_di_payload", fuzzyMiss: true };
    return safeExecute(commandStack, "label.move", {
      label: element,
      newBounds: { x: Number(b.x) || 0, y: Number(b.y) || 0, width: Number(b.width) || 0, height: Number(b.height) || 0 },
      ...flags,
    });
  }
  if (type === "shape.delete") {
    return safeExecute(commandStack, "shape.delete", { shape: element, ...flags });
  }
  if (type === "connection.delete") {
    return safeExecute(commandStack, "connection.delete", { connection: element, ...flags });
  }
  return { ok: false, error: "unsupported_op", fuzzyMiss: true };
}

/**
 * Replay op-листа на live modeler. Каждая применённая команда re-fire'ится
 * через commandStack.changed с флагами replay — commandToOps её пропускает.
 * @returns {{ok: boolean, applied: number, failed: number, results: Array}}
 */
export async function replayOpsOnModeler(modeler, ops = []) {
  const list = Array.isArray(ops) ? ops : [];
  const results = [];
  let applied = 0;
  let failed = 0;
  for (const op of list) {
    const opId = asText(op?.opId);
    const outcome = replayOne(modeler, op);
    if (outcome.ok) applied += 1;
    else failed += 1;
    results.push({ opId, ok: outcome.ok === true, error: asText(outcome.error), fuzzyMiss: outcome.fuzzyMiss === true });
  }
  return { ok: failed === 0, applied, failed, results };
}

/**
 * Адопт серверной версии в tracked CAS base. Публикация в другие вкладки
 * сохраняется через subscribeDiagramVersionChanges → crossTabVersionSync
 * (тот же путь, что у same-tab auto-resolve ProcessStage).
 */
export function adoptServerVersion(sessionId, serverVersion) {
  const sid = asText(sessionId);
  const version = Number(serverVersion);
  if (!sid || !Number.isFinite(version) || version < 0) return false;
  setTrackedDiagramStateVersion(sid, Math.round(version));
  return true;
}

function readServerCurrentVersion(response) {
  const canonical = readConflictServerCurrentVersion(response);
  if (canonical !== null) return canonical;
  const candidates = [
    response?.currentVersion,
    response?.current_version,
    response?.data?.currentVersion,
    response?.data?.current_version,
    response?.data?.detail?.currentVersion,
    response?.data?.detail?.current_version,
  ];
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return null;
}

export function createOpsRebase({ applyOpsFn = replayOpsOnModeler } = {}) {
  return {
    /**
     * @returns {Promise<{ok: boolean, needsFullSave: boolean, serverVersion?: number|null, replay?: Object}>}
     */
    async handleConflict({ sessionId, response, pendingOps, modeler } = {}) {
      const serverVersion = readServerCurrentVersion(response);
      if (serverVersion === null) {
        // Нет версии в 409-body — auto-rebase невозможен, честный fallback.
        return { ok: false, needsFullSave: true, serverVersion: null };
      }
      adoptServerVersion(sessionId, serverVersion);
      const replay = await applyOpsFn(modeler, Array.isArray(pendingOps) ? pendingOps : []);
      if (!replay?.ok) {
        return { ok: false, needsFullSave: true, serverVersion, replay };
      }
      return { ok: true, needsFullSave: false, serverVersion, replay };
    },
  };
}
