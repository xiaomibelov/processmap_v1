/**
 * Cross-tab synchronization of CAS diagram_state_version.
 *
 * Каждая вкладка при set/bump casVersionTracker публикует {sid, version} в
 * BroadcastChannel `pm-cas-versions` (fallback — window "storage" events,
 * если BroadcastChannel недоступен). Принимающая вкладка:
 *  - clean (нет несохранённых изменений) → adopt версии в трекер — следующее
 *    сохранение пройдёт без честного 409;
 *  - dirty (есть несохранённые правки) → НЕ трогает CAS-base (сохраняет
 *    честную конфликт-семантику) и показывает предупреждение через
 *    onRemoteVersionWhileDirty.
 *
 * join/leave-сообщения ведут подсчёт открытых вкладок сессии (для предупреждения
 * «открыто в N вкладках» и будущей блокировки записи). leave шлётся на
 * unbind/pagehide/beforeunload (best-effort).
 *
 * Новая работа контура fix/canvas-editing-stability (P1) — в canonical-ветке
 * отсутствует.
 */

import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
} from "./casVersionTracker.js";

export const CHANNEL_NAME = "pm-cas-versions";
export const PROTOCOL_VERSION = 1;

const MESSAGE_TYPES = new Set(["join", "leave", "here", "version"]);

function normalizeSid(value) {
  return String(value || "").trim();
}

function normalizeVersion(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * @param {string} clientId уникальный id вкладки (lib/clientId.js getOrCreateClientId)
 */
export function createCrossTabVersionSync({
  clientId = "",
  now = () => Date.now(),
  createChannel = null,
} = {}) {
  const ownClientId = String(clientId || "").trim() || `tab-${Math.random().toString(36).slice(2, 10)}`;
  const channelFactory = typeof createChannel === "function" ? createChannel : defaultCreateChannel;

  let channel = null;
  let bound = null;
  /** @type {Map<string, number>} clientId → количество join (защита от дублей) */
  const peerCounts = new Map();
  let applyingRemote = false;

  function post(message) {
    if (!channel) return;
    try {
      channel.postMessage({
        v: PROTOCOL_VERSION,
        ...message,
        clientId: ownClientId,
        at: now(),
      });
    } catch {
      // Channel post failures must never break the app.
    }
  }

  function otherTabCount() {
    let total = 0;
    for (const count of peerCounts.values()) total += count;
    return total;
  }

  function emitTabCount() {
    const handler = bound?.onTabCountChange;
    if (typeof handler !== "function") return;
    try {
      handler(otherTabCount());
    } catch {
      // no-op
    }
  }

  function handleVersionMessage(message) {
    if (!bound) return;
    const sid = normalizeSid(message?.sid);
    if (!sid || sid !== bound.sid) return;
    const version = normalizeVersion(message?.version);
    if (version === null) return;
    // CAS-версии монотонны: stale-сообщение (here, отправленное до чужого
    // save) не должно откатывать локальный трекер назад.
    const current = getTrackedDiagramStateVersion(sid);
    if (current !== null && version <= current) return;
    const isDirtyFn = bound.isDirty;
    const dirty = typeof isDirtyFn === "function" ? isDirtyFn() === true : false;
    if (dirty) {
      const handler = bound?.onRemoteVersionWhileDirty;
      if (typeof handler === "function") {
        try {
          handler({ sid, version });
        } catch {
          // no-op
        }
      }
      return;
    }
    // Clean tab: adopt. Подавляем повторную публикацию (эхо) на время adopt.
    applyingRemote = true;
    try {
      setTrackedDiagramStateVersion(sid, version);
    } finally {
      applyingRemote = false;
    }
  }

  function handleMessage(rawMessage) {
    const message = rawMessage && typeof rawMessage === "object" ? rawMessage : {};
    if (!MESSAGE_TYPES.has(message.type)) return;
    if (String(message.clientId || "") === ownClientId) return;
    if (!bound) return;
    const sid = normalizeSid(message?.sid);
    if (!sid || sid !== bound.sid) return;

    if (message.type === "join") {
      // Новая вкладка: учитываем и отвечаем текущей версией (here) —
      // новичок clean-adopt'ит её сразу. here шлём всегда (version может быть
      // null) — новичок считает отправителя пиром и чинит асимметрию подсчёта.
      const key = String(message.clientId || "");
      peerCounts.set(key, (peerCounts.get(key) || 0) + 1);
      emitTabCount();
      post({ type: "here", sid, version: normalizeVersion(getTrackedDiagramStateVersion(sid)) });
      return;
    }
    if (message.type === "leave") {
      const key = String(message.clientId || "");
      const next = (peerCounts.get(key) || 0) - 1;
      if (next > 0) {
        peerCounts.set(key, next);
      } else {
        peerCounts.delete(key);
      }
      emitTabCount();
      return;
    }
    if (message.type === "here") {
      // Ответ на join: фиксируем пира (idempotent set — защита от дублей) и
      // применяем версию, если она новее локальной (монотонный guard внутри).
      const key = String(message.clientId || "");
      peerCounts.set(key, 1);
      emitTabCount();
      handleVersionMessage(message);
      return;
    }
    // version
    handleVersionMessage(message);
  }

  function bind({ sid, isDirty = null, onRemoteVersionWhileDirty = null, onTabCountChange = null } = {}) {
    unbind();
    const normalizedSid = normalizeSid(sid);
    if (!normalizedSid) return () => {};
    bound = {
      sid: normalizedSid,
      isDirty: typeof isDirty === "function" ? isDirty : () => false,
      onRemoteVersionWhileDirty: typeof onRemoteVersionWhileDirty === "function" ? onRemoteVersionWhileDirty : null,
      onTabCountChange: typeof onTabCountChange === "function" ? onTabCountChange : null,
    };
    channel = channelFactory(CHANNEL_NAME);
    if (channel && typeof channel === "object") {
      channel.onmessage = (raw) => handleMessage(raw);
    }
    post({ type: "join", sid: normalizedSid });

    const handlePageHide = () => {
      post({ type: "leave", sid: normalizedSid });
    };
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("pagehide", handlePageHide);
      window.addEventListener("beforeunload", handlePageHide);
    }
    bound.cleanupWindow = () => {
      if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener("pagehide", handlePageHide);
        window.removeEventListener("beforeunload", handlePageHide);
      }
    };
    return unbind;
  }

  function unbind() {
    if (!bound) return;
    const sid = bound.sid;
    if (typeof bound.cleanupWindow === "function") {
      try {
        bound.cleanupWindow();
      } catch {
        // no-op
      }
    }
    post({ type: "leave", sid });
    peerCounts.clear();
    if (channel && typeof channel.close === "function") {
      try {
        channel.close();
      } catch {
        // no-op
      }
    }
    channel = null;
    bound = null;
  }

  function publishVersion(sid, version) {
    if (applyingRemote) return;
    const normalizedSid = normalizeSid(sid);
    const normalizedVersion = normalizeVersion(version);
    if (!normalizedSid || normalizedVersion === null) return;
    if (bound && normalizedSid !== bound.sid) return;
    post({ type: "version", sid: normalizedSid, version: normalizedVersion });
  }

  return {
    bind,
    unbind,
    publishVersion,
    getTabCount: otherTabCount,
    get clientId() {
      return ownClientId;
    },
    get sid() {
      return bound?.sid || "";
    },
  };
}

/**
 * Транспорт по умолчанию: BroadcastChannel, fallback — storage events.
 * Возвращает channel-like { postMessage, close, set onmessage } или null.
 */
export function defaultCreateChannel(name) {
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel(String(name || CHANNEL_NAME));
      return {
        postMessage: (msg) => bc.postMessage(msg),
        close: () => bc.close(),
        set onmessage(fn) {
          bc.onmessage = (event) => {
            try {
              fn(event?.data);
            } catch {
              // no-op
            }
          };
        },
      };
    } catch {
      // fall through to storage events
    }
  }
  if (typeof window !== "undefined"
    && typeof window.addEventListener === "function"
    && typeof window.localStorage !== "undefined") {
    const storageKey = `${name}:msg`;
    let handler = null;
    const listener = (event) => {
      if (!handler || event?.key !== storageKey || !event?.newValue) return;
      try {
        handler(JSON.parse(event.newValue));
      } catch {
        // no-op
      }
    };
    window.addEventListener("storage", listener);
    return {
      postMessage: (msg) => {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(msg));
        } catch {
          // no-op
        }
      },
      close: () => {
        window.removeEventListener("storage", listener);
      },
      set onmessage(fn) {
        handler = typeof fn === "function" ? fn : null;
      },
    };
  }
  return null;
}
