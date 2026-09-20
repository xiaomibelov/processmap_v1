// gatewayPut — регистрация прямых diagram-truth PUT как участников per-session
// mutation lane (контур feature/mutation-gateway-c3, срез S1; предшественник
// gateway.putSystem из PLAN §6 — системные cold-действия: tobe_publish,
// snapshot restore, conflict overwrite/same-tab replay, dead-session restore).
//
// Контракт: тот же сигнатурный профиль, что у apiPutBpmnXml — вызывающие
// стороны не меняются. Сериализация lane означает, что PUT стартует только
// после завершения in-flight mutation-запроса сессии (ops-flush/full-save);
// base_diagram_state_version вызывающий код вычисляет ДО вызова (как и раньше
// при ожидании flushPromise) — lane не подменяет CAS-контракт.
// Kill-switch fpc_gateway_lane (см. gatewayLane.js): OFF = прямой PUT.

import { apiPutBpmnXml } from "../../lib/api.js";
import { saveCoordinator } from "./saveCoordinator.js";

/**
 * Прямой PUT diagram truth сессии — как task mutation lane.
 * @param {string} sessionId
 * @param {string} xml
 * @param {Object} [options] - пробрасывается в apiPutBpmnXml как есть
 * @returns {Promise<Object>}
 */
export async function gatewayPutBpmnXml(sessionId, xml, options = {}) {
  const sid = String(sessionId || "").trim();
  const lane = typeof saveCoordinator.getMutationLane === "function"
    ? saveCoordinator.getMutationLane()
    : null;
  if (!sid || !lane) {
    return apiPutBpmnXml(sessionId, xml, options);
  }
  return lane.run(sid, () => apiPutBpmnXml(sessionId, xml, options));
}
