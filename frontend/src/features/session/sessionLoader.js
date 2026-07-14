/**
 * Unified session loader.
 *
 * Single entry point for loading a session:
 *  - deduplicates concurrent loads for the same sessionId,
 *  - fetches session JSON and BPMN XML in parallel,
 *  - applies snapshot fallback when backend XML is empty,
 *  - parses camunda extensions from XML,
 *  - populates sessionCache,
 *  - syncs casVersionTracker.
 *
 * Subscribes to saveCoordinator events to keep the cache fresh after saves
 * and to invalidate it on conflicts.
 */

import { apiGetBpmnXml, apiGetSession } from "../../lib/api.js";
import { isLocalSessionId } from "../../components/process/interview/utils.js";
import { extractCamundaExtensionsMapFromBpmnXml } from "../process/camunda/camundaExtensions.js";
import {
  getLatestBpmnSnapshot,
  shouldAutoRestoreFromSnapshot,
} from "../process/bpmn/snapshots/bpmnSnapshots.js";
import { setVersion as setCasVersion } from "../../lib/casVersionTracker.js";
import { saveCoordinator } from "./saveCoordinator.js";
import { sessionCache } from "./sessionCache.js";

function asText(value) {
  return String(value || "").trim();
}

function localSessionXml(sessionId) {
  try {
    const storage = globalThis.localStorage || globalThis.window?.localStorage;
    return String(storage?.getItem(`fpc_bpmn_xml_${sessionId}`) || "");
  } catch {
    return "";
  }
}

function diagramStateVersionFromSession(session) {
  const v = Number(
    session?.diagram_state_version
    ?? session?.diagramStateVersion
    ?? session?.version
    ?? -1,
  );
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
}

class SessionLoader {
  constructor() {
    this.inFlight = new Map();
    this.unsubscribeSaveCoordinator = null;
    this._subscribeToSaveCoordinator();
  }

  _subscribeToSaveCoordinator() {
    this.unsubscribeSaveCoordinator = saveCoordinator.subscribe((event, data) => {
      const sid = asText(data?.sessionId);
      if (!sid) return;
      if (event === "success" && data?.pipeline === "xml") {
        const response = data?.response || {};
        sessionCache.update(sid, {
          xml: response.xml || sessionCache.get(sid, { allowStale: true })?.xml || "",
          diagramStateVersion: Number.isFinite(Number(response.diagram_state_version))
            ? Math.round(Number(response.diagram_state_version))
            : sessionCache.get(sid, { allowStale: true })?.diagramStateVersion,
        });
      } else if (event === "conflict") {
        sessionCache.invalidate(sid);
      }
    });
  }

  /**
   * Load a session. Returns cached data if fresh unless force=true.
   */
  async load(sessionId, options = {}) {
    const sid = asText(sessionId);
    if (!sid) {
      return { ok: false, error: "missing session id" };
    }

    const force = options?.force === true;
    if (!force) {
      const cached = sessionCache.get(sid);
      if (cached) {
        return { ok: true, data: cached, source: "cache" };
      }
    }

    const existing = this.inFlight.get(sid);
    if (existing && !force) {
      const data = await existing;
      return { ok: true, data, source: "in-flight" };
    }
    if (existing && force) {
      // Wait for the existing load to finish before forcing a new one to avoid
      // racing with an in-flight mutation.
      try { await existing; } catch { /* ignore */ }
    }

    const promise = this._fetch(sid, options);
    this.inFlight.set(sid, promise);
    try {
      const result = await promise;
      return result;
    } finally {
      if (this.inFlight.get(sid) === promise) {
        this.inFlight.delete(sid);
      }
    }
  }

  /**
   * Reload a session (invalidate cache + force fetch).
   */
  async reload(sessionId, options = {}) {
    const sid = asText(sessionId);
    sessionCache.invalidate(sid);
    return this.load(sid, { ...options, force: true });
  }

  /**
   * Load multiple sessions in parallel. Returns a map sessionId -> result.
   */
  async loadBatch(sessionIds, options = {}) {
    const ids = Array.isArray(sessionIds) ? sessionIds : [];
    const results = await Promise.all(
      ids.map((sid) => this.load(sid, options).then((r) => ({ sid, r }))),
    );
    const out = {};
    for (const { sid, r } of results) {
      out[sid] = r;
    }
    return out;
  }

  async _fetch(sid, options = {}) {
    if (isLocalSessionId(sid)) {
      const xml = localSessionXml(sid);
      const data = {
        sessionId: sid,
        session: { id: sid, session_id: sid, bpmn_xml: xml },
        xml,
        meta: {},
        extensions: extractCamundaExtensionsMapFromBpmnXml(xml),
        diagramStateVersion: 0,
      };
      sessionCache.set(sid, data);
      setCasVersion(sid, 0);
      return { ok: true, data, source: "local" };
    }

    const projectId = asText(options?.projectId);

    const [sessionResult, xmlResult] = await Promise.all([
      apiGetSession(sid),
      apiGetBpmnXml(sid, { raw: true, includeOverlay: false, cacheBust: true }),
    ]);

    if (!sessionResult.ok) {
      return {
        ok: false,
        error: sessionResult.error || "failed to load session",
        status: Number(sessionResult.status || 0),
      };
    }

    const session = sessionResult.session || sessionResult.data || {};
    let xml = asText(xmlResult.ok ? xmlResult.xml : session?.bpmn_xml || "");

    const hasBackendVersion = (
      Number(session?.bpmn_xml_version) > 0
      || Number(session?.version) > 0
      || Number(session?.diagram_state_version) > 0
    );
    if (!xml.trim() && hasBackendVersion) {
      xml = "<server-xml-present/>";
    }

    // Snapshot fallback when backend XML is empty but session has a version.
    if (!xml.trim() && hasBackendVersion) {
      try {
        const snapshot = await getLatestBpmnSnapshot({ projectId, sessionId: sid });
        const snapshotXml = asText(snapshot?.xml || "");
        const restoreDecision = shouldAutoRestoreFromSnapshot({ backendXml: xml, snapshot });
        if (restoreDecision.restore && snapshotXml) {
          xml = snapshotXml;
        }
      } catch {
        // ignore snapshot errors
      }
    }

    const diagramStateVersion = diagramStateVersionFromSession(session);
    setCasVersion(sid, diagramStateVersion);

    const data = {
      sessionId: sid,
      session,
      xml,
      meta: session?.bpmn_meta || {},
      extensions: extractCamundaExtensionsMapFromBpmnXml(xml),
      diagramStateVersion,
    };

    sessionCache.set(sid, data);

    return { ok: true, data, source: "backend" };
  }
}

export const sessionLoader = new SessionLoader();

export default sessionLoader;
