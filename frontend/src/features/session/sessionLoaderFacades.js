/**
 * Facades for migrating existing loaders to the unified sessionLoader.
 *
 * These functions keep the same external shape as the old direct API calls but
 * route reads through sessionCache/sessionLoader. They are intended as drop-in
 * replacements for call sites that only need session + XML data.
 */

import { sessionLoader } from "./sessionLoader.js";
import { sessionCache } from "./sessionCache.js";

function asText(value) {
  return String(value || "").trim();
}

/**
 * Load a session (and its BPMN XML) through the unified loader.
 * Returns a shape compatible with legacy `apiGetSession` + `apiGetBpmnXml`
 * consumers: { ok, session, xml, error, status }.
 */
export async function loadSessionWithXml(sessionId, options = {}) {
  const sid = asText(sessionId);
  if (!sid) {
    return { ok: false, error: "missing session id", status: 0 };
  }
  const result = await sessionLoader.load(sid, options);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "load failed",
      status: Number(result.status || 0),
    };
  }
  const data = result.data || {};
  return {
    ok: true,
    session: data.session || { session_id: sid, id: sid },
    xml: data.xml || "",
    meta: data.meta || {},
    extensions: data.extensions || {},
    diagramStateVersion: data.diagramStateVersion,
    source: result.source,
  };
}

/**
 * Reload a session, invalidating the cache first.
 */
export async function reloadSessionWithXml(sessionId, options = {}) {
  const sid = asText(sessionId);
  if (!sid) {
    return { ok: false, error: "missing session id", status: 0 };
  }
  const result = await sessionLoader.reload(sid, options);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "reload failed",
      status: Number(result.status || 0),
    };
  }
  const data = result.data || {};
  return {
    ok: true,
    session: data.session || { session_id: sid, id: sid },
    xml: data.xml || "",
    meta: data.meta || {},
    extensions: data.extensions || {},
    diagramStateVersion: data.diagramStateVersion,
    source: result.source,
  };
}

/**
 * Synchronously read cached XML for a session if it has been loaded.
 */
export function getCachedSessionXml(sessionId) {
  return sessionCache.get(asText(sessionId))?.xml || "";
}

/**
 * Synchronously read cached session data if fresh.
 */
export function getCachedSession(sessionId) {
  return sessionCache.get(asText(sessionId));
}
