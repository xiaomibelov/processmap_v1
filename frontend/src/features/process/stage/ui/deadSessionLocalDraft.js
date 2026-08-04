/**
 * P-1 D3: поиск локального черновика мёртвой сессии (терминальный 404).
 * Чистая функция — без React (тестируется node --test).
 * Синхронные источники по приоритету:
 *   1. fpc_bpmn_runtime_cache:{sid} (JSON {xml, ts}, TTL 24ч)
 *   2. fpc_bpmn_xml_{sid} (plain xml)
 * Снапшоты (IndexedDB fpc_bpmn_snapshots_db) читаются отдельно асинхронно
 * через getLatestBpmnSnapshot в ProcessStage.
 */

function toText(value) {
  return String(value || "").trim();
}

const RUNTIME_CACHE_PREFIX = "fpc_bpmn_runtime_cache:";
const RUNTIME_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24;

function resolveStorage(storage) {
  if (storage && typeof storage.getItem === "function") return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
}

function safeGetItem(storage, key) {
  try {
    return String(storage?.getItem(key) || "");
  } catch {
    return "";
  }
}

/**
 * @param {Object} args
 * @param {string} args.sessionId
 * @param {Storage} [args.storage] — инъекция для тестов; по умолчанию window.localStorage
 * @returns {{xml: string, source: string, ts: number}|null}
 */
export function readDeadSessionLocalDraft({ sessionId = "", storage = null } = {}) {
  const sid = toText(sessionId);
  const store = resolveStorage(storage);
  if (!sid || !store) return null;

  const rawCache = toText(safeGetItem(store, `${RUNTIME_CACHE_PREFIX}${sid}`));
  if (rawCache) {
    try {
      const parsed = JSON.parse(rawCache);
      const xml = toText(parsed?.xml);
      const ts = Number(parsed?.ts) || 0;
      const fresh = !(ts > 0) || (Date.now() - ts) <= RUNTIME_CACHE_MAX_AGE_MS;
      if (xml && fresh) {
        return { xml, source: "runtime_cache", ts };
      }
    } catch {
      // битый JSON кэша — продолжаем поиск в других источниках
    }
  }

  const localXml = toText(safeGetItem(store, `fpc_bpmn_xml_${sid}`));
  if (localXml) {
    return { xml: localXml, source: "local_xml", ts: 0 };
  }

  return null;
}

export default readDeadSessionLocalDraft;
