// Внешнее хранилище provenance-индекса TO BE (feature/tobe-overlay-visibility-
// provenance-v1, T8). Двухканальный источник: raw BPMN XML текущей TO BE-
// сессии (pm:Trace, extractProvenanceFromBpmnXml) + meta.provenance.sidecar
// (снапшот trace_map, класс removed). Состояние разделяется между fetch-
// адаптером (BpmnStage) и UI (контролы/hint) без prop-drilling — паттерн
// tobeOverlayUnderlayStore.
//
// Контракт: status "idle"|"loading"|"ready"|"empty"; index — результат
// buildProvenanceIndex (null при empty). Кэш per sessionId: повторный вызов
// с тем же id — без повторного fetch. Сетевая ошибка — status "empty" +
// console.warn (не throw в UI). Mid-flight смены сессии: чужой (stale)
// индекс НЕ применяется к состоянию (проверка sessionKey на момент resolve).

import { extractProvenanceFromBpmnXml } from "../../../../technologist/workspace/tobeProvenance.js";
import { buildProvenanceIndex } from "./provenanceIndex.js";

let state = { status: "idle", index: null, sessionKey: null };
// Ключ последнего запрошенного load — маркер против transient-mount гонки
// (T8 fix, T12 e2e): teardown-ресет сбрасывает sessionKey в null, но поздний
// ответ по ТОМУ ЖЕ ключу валиден и должен примениться, а не потеряться.
let lastRequestedKey = null;
const listeners = new Set();

// sessionId -> index | null. null — закэшированный факт "данных нет":
// повторный load не должен бить сеть ради подтверждения отсутствия.
const cache = new Map();

function emit() {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // слушатель не должен ломать остальных подписчиков
    }
  }
}

function setState(next) {
  state = next;
  emit();
}

export function getTobeOverlayProvenanceState() {
  return state;
}

export function subscribeTobeOverlayProvenance(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Применяет загруженный индекс ТОЛЬКО если он относится к актуальному ключу.
// Допускаем также применение после transient-reset: teardown на смену
// sessionId сбросил состояние в idle/null, но поздний ответ по последнему
// запрошенному ключу валиден (иначе индекс терялся навсегда — флаки ~1/2
// на живом стеке, T12 e2e). Готовый результат (ready/empty) не перезаписываем.
function applyLoaded(key, index) {
  const matchesCurrent = state.sessionKey === key;
  const matchesAfterTransientReset = state.status === "idle"
    && state.sessionKey === null
    && lastRequestedKey === key;
  if (!matchesCurrent && !matchesAfterTransientReset) return;
  if (state.status === "ready" || state.status === "empty") return;
  setState({ status: index ? "ready" : "empty", index, sessionKey: key });
}

export async function loadProvenanceForSession({ sessionId, fetchXml, fetchMeta } = {}) {
  const key = String(sessionId || "").trim();
  if (!key) return;
  if (typeof fetchXml !== "function" || typeof fetchMeta !== "function") {
    console.warn("[tobe-provenance] fetchXml/fetchMeta обязательны для load");
    return;
  }
  if (cache.has(key)) {
    const cached = cache.get(key);
    if (state.sessionKey === key && state.status === "loading") {
      applyLoaded(key, cached);
    } else {
      // Кэшированный результат по актуальному/повторно запрошенному ключу
      // применяем напрямую — в том числе из idle после transient-reset
      // (иначе applyLoaded отклонил бы и индекс застрял, T8 fix).
      setState({ status: cached ? "ready" : "empty", index: cached, sessionKey: key });
    }
    return;
  }
  // In-flight или уже загружено под этим ключом — дублирующий вызов не нужен.
  if (state.sessionKey === key && state.status !== "idle") return;

  lastRequestedKey = key;
  setState({ status: "loading", index: null, sessionKey: key });
  try {
    const [xmlRes, metaRes] = await Promise.all([fetchXml(key), fetchMeta(key)]);
    const xml = xmlRes && xmlRes.ok ? String(xmlRes.xml ?? "") : "";
    const sidecar = metaRes && metaRes.ok ? (metaRes?.provenance ?? null) : null;
    const xmlProvenance = await extractProvenanceFromBpmnXml(xml);
    const index = buildProvenanceIndex(xmlProvenance, sidecar);
    cache.set(key, index);
    applyLoaded(key, index);
  } catch (err) {
    // Сеть/парсер не должны ломать сценарий подложки; молчать запрещено.
    console.warn("[tobe-provenance] load failed", err);
    cache.set(key, null);
    applyLoaded(key, null);
  }
}

// Teardown при смене сессии: состояние idle + кэш чист (новая сессия —
// новый fetch, никаких чужих индексов).
export function resetProvenanceSessionState() {
  cache.clear();
  if (state.status === "idle" && state.index === null && state.sessionKey === null) return;
  setState({ status: "idle", index: null, sessionKey: null });
}
