// gatewayLane — per-session mutation lane (контур feature/mutation-gateway-c3, срез S1).
//
// Один in-flight diagram-truth mutation-запрос на сессию across pipelines
// (ops/rawXml/xml + зарегистрированные прямые PUT). Заменяет ad-hoc взаимные
// исключения save-пути: outbox busy-poll 200 мс, fullSavePreserve sentinel
// triangulation, coordinator flushPromise-сериализация.
//
// Ключевой инвариант дизайна (см. queueKey в saveCoordinator.js): lane живёт
// на уровне mutation-intent (прогон пайплайна), НЕ на уровне вызова execute.
// Вложенный execute той же execution-chain (транспорт xml → flushSave →
// rawXml) lane-блокировки НЕ ждёт: токен chain пробрасывается явно
// (transport 4-м аргументом → flushSave options.laneContext →
// payload.mutationLaneContext), иначе deadlock (xml ждёт transport, transport
// ждёт rawXml, rawXml ждёт lane за xml). Вызов без токена всегда очередь.
//
// Kill-switch: fpc_gateway_lane (localStorage), default ON; "0"/"off"/"false"
// → pass-through. Флаг — рововой выключатель: ad-hoc механизмы удалены
// безусловно, lane-on — единственный поддерживаемый режим.

function asText(value) {
  return String(value || "").trim();
}

/**
 * Чтение kill-switch'а. Динамическое (на каждый acquire), чтобы тесты и
 * оперативный откат могли переключать режим без пересоздания координатора.
 * @returns {boolean}
 */
export function isGatewayLaneEnabled() {
  if (typeof window === "undefined") return true;
  try {
    const raw = asText(window.localStorage?.getItem?.("fpc_gateway_lane")).toLowerCase();
    return !(raw === "0" || raw === "off" || raw === "false");
  } catch {
    return true;
  }
}

/**
 * Фабрика lane. Каждому saveCoordinator — свой экземпляр (изоляция тестов).
 *
 * @param {Object} [options]
 * @param {Function} [options.isEnabled] - источник kill-switch (тесты)
 * @returns {{run: Function, has: Function, clear: Function}}
 */
export function createGatewayLane(options = {}) {
  const isEnabled = typeof options.isEnabled === "function" ? options.isEnabled : isGatewayLaneEnabled;
  /** @type {Map<string, Promise<void>>} хвост очереди per session */
  const tails = new Map();
  /** @type {Map<string, object>} активные execution-chains per session (reentrancy) */
  const chains = new Map();

  /**
   * Выполнить task в lane сессии.
   *
   * Reentrancy — СТРОГО по явному токену: task вложенного вызова получает
   * токен активной chain четвёртым аргументом transport'а (см. saveCoordinator)
   * и обязан пробросить его обратно через payload.mutationLaneContext. Вызов
   * без токена ВСЕГДА ставится в FIFO-очередь, даже если lane занят — иначе
   * внешний flush при in-flight мутации исполнился бы конкурентно (это и был
   * busy-poll 200 мс: внешние flush'и дожидались освобождения).
   *
   * @param {string} sessionId
   * @param {Function} task - (laneContext) => Promise<*> | *
   * @param {Object} [laneContext] - токен активной chain (только вложенные вызовы)
   * @returns {Promise<*>}
   */
  function run(sessionId, task, laneContext) {
    const sid = asText(sessionId);
    if (!sid || typeof task !== "function" || isEnabled() === false) {
      return Promise.resolve().then(() => task(laneContext));
    }
    if (laneContext && chains.get(sid) === laneContext) {
      // Вложенный вызов той же execution-chain: lane уже удерживается этой
      // цепочкой — постановка в очередь дала бы deadlock (xml → rawXml).
      return Promise.resolve().then(() => task(laneContext));
    }
    const prev = tails.get(sid) || Promise.resolve();
    const token = {};
    const next = prev.catch(() => undefined).then(async () => {
      chains.set(sid, token);
      try {
        return await task(token);
      } finally {
        chains.delete(sid);
      }
    });
    // В хвост кладём swallow-вариант: отказ task не должен ломать resume
    // последующих mutation-запросов сессии (аналог previous.catch в _enqueueRun).
    // После оседания хвост удаляется — has() отражает реальную занятость lane.
    const tail = next.then(() => undefined, () => undefined).then(() => {
      if (tails.get(sid) === tail) tails.delete(sid);
    });
    tails.set(sid, tail);
    return next;
  }

  /**
   * Есть ли незавершённая работа в lane сессии (in-flight или очередь).
   * @param {string} sessionId
   * @returns {boolean}
   */
  function has(sessionId) {
    return tails.has(asText(sessionId));
  }

  /**
   * Разрыв цепочки сессии (аналог sessionQueues.clear() в clearSession):
   * уже запущенные task'и не отменяются (запрос мог уйти на сервер), но
   * следующий run не будет ждать старый хвост.
   * @param {string} [sessionId] - пусто = все сессии
   */
  function clear(sessionId) {
    const sid = asText(sessionId);
    if (!sid) {
      tails.clear();
      return;
    }
    tails.delete(sid);
  }

  return { run, has, clear };
}
