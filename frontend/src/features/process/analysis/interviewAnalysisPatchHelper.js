import { apiPatchSession as defaultApiPatchSession } from "../../../lib/api.js";
import { saveCoordinator } from "../../../features/session/saveCoordinator.js";
import {
  readAckDiagramStateVersion,
  readConflictServerCurrentVersion,
  resolveBaseVersionAtSendTime,
} from "../../../features/session/casResponse.js";

const PIPELINE_NAME = "analysis";
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

saveCoordinator.registerPipeline(PIPELINE_NAME, {
  transport: async (sessionId, payload) => {
    const apiPatchSession = payload?.apiPatchSession;
    if (typeof apiPatchSession !== "function") {
      return { ok: false, status: 0, error: "missing_api_patch_session" };
    }
    const patchBody = payload?.patchBody && typeof payload.patchBody === "object"
      ? { ...payload.patchBody }
      : {};
    if (payload?.base_diagram_state_version !== undefined) {
      patchBody.base_diagram_state_version = payload.base_diagram_state_version;
    }
    return apiPatchSession(sessionId, patchBody);
  },
  buildPayload: (payload) => {
    const patch = buildInterviewAnalysisPatchPayload(payload?.analysisPatch, {
      baseDiagramStateVersion: payload?.baseDiagramStateVersion,
    });
    return {
      patchBody: patch,
      apiPatchSession: payload?.apiPatchSession,
      baseDiagramStateVersion: payload?.baseDiagramStateVersion,
      onSessionSync: payload?.onSessionSync,
    };
  },
  getBaseVersion: (sessionId, payload) =>
    // fix/save-single-writer-and-unified-cas-base (Task 2): tracker-first
    // resolver из casResponse.js в момент отправки; getter из React-окружения
    // и payload option — fallback на переходный период.
    resolveBaseVersionAtSendTime({
      sessionId,
      payload,
      getBaseDiagramStateVersion: payload?.getBaseDiagramStateVersion,
    }),
  onSuccess: (response, sessionId, payload) => {
    // Канонический читатель ack-версии (casResponse.js, дисциплина п.10).
    const version = readAckDiagramStateVersion(response);
    if (version !== null) {
      try {
        payload?.rememberDiagramStateVersion?.(version, { sessionId });
      } catch {
        // no-op
      }
    }
  },
  on409: (response, sessionId, payload) => {
    // Канонический читатель server_current_version (casResponse.js).
    const serverVersion = readConflictServerCurrentVersion(response);
    if (serverVersion !== null) {
      try {
        payload?.rememberDiagramStateVersion?.(serverVersion, { sessionId });
      } catch {
        // no-op
      }
    }
  },
  debounceMs: 0,
  retryCount: 3,
  retryDelayMs: 1000,
});

function toText(value) {
  return String(value || "").trim();
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneSafeJsonValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => cloneSafeJsonValue(item))
      .filter((item) => item !== undefined);
  }
  if (isPlainObject(value)) {
    const out = {};
    Object.keys(value).forEach((key) => {
      if (UNSAFE_KEYS.has(key)) return;
      const cloned = cloneSafeJsonValue(value[key]);
      if (cloned !== undefined) out[key] = cloned;
    });
    return out;
  }
  if (value === null) return null;
  const type = typeof value;
  if (type === "number") return Number.isFinite(value) ? value : undefined;
  if (type === "string" || type === "boolean") return value;
  return undefined;
}

export function sanitizeInterviewAnalysisPatch(analysisPatchRaw) {
  if (!isPlainObject(analysisPatchRaw)) return null;
  return cloneSafeJsonValue(analysisPatchRaw);
}

export function mergeInterviewAnalysisPatch(existingAnalysisRaw, analysisPatchRaw) {
  const existing = sanitizeInterviewAnalysisPatch(existingAnalysisRaw) || {};
  const patch = sanitizeInterviewAnalysisPatch(analysisPatchRaw);
  if (!patch) return existing;
  return {
    ...existing,
    ...patch,
  };
}

export function buildInterviewAnalysisPatchPayload(analysisPatchRaw, options = {}) {
  const analysisPatch = sanitizeInterviewAnalysisPatch(analysisPatchRaw);
  if (!analysisPatch || !Object.keys(analysisPatch).length) {
    return null;
  }
  const payload = {
    interview: {
      analysis: analysisPatch,
    },
  };
  const baseVersion = Number(options?.baseDiagramStateVersion ?? options?.base_diagram_state_version);
  if (Number.isFinite(baseVersion) && baseVersion >= 0) {
    payload.base_diagram_state_version = Math.round(baseVersion);
  }
  return payload;
}

export async function patchInterviewAnalysis(sessionId, analysisPatchRaw, options = {}) {
  const sid = toText(sessionId);
  if (!sid) {
    return { ok: false, status: 0, error: "missing_session_id" };
  }
  const patch = buildInterviewAnalysisPatchPayload(analysisPatchRaw, options);
  if (!patch) {
    return { ok: false, status: 0, error: "empty_analysis_patch" };
  }

  const response = await saveCoordinator.execute(PIPELINE_NAME, {
    sessionId: sid,
    analysisPatch: analysisPatchRaw,
    apiPatchSession: typeof options?.apiPatchSession === "function"
      ? options.apiPatchSession
      : defaultApiPatchSession,
    getBaseDiagramStateVersion: options?.getBaseDiagramStateVersion,
    rememberDiagramStateVersion: options?.rememberDiagramStateVersion,
    baseDiagramStateVersion: options?.baseDiagramStateVersion ?? options?.base_diagram_state_version,
    onSessionSync: options?.onSessionSync,
  });

  if (!response?.ok) {
    return {
      ok: false,
      status: Number(response?.status || 0),
      error: response?.error || "interview_analysis_patch_failed",
      response,
    };
  }

  const session = response.session && typeof response.session === "object" ? response.session : null;
  if (session && typeof options?.onSessionSync === "function") {
    options.onSessionSync({
      ...session,
      _sync_source: "interview_analysis_patch",
    });
  }

  return {
    ok: true,
    status: Number(response?.status || 200),
    session,
    analysis: session?.interview && typeof session.interview === "object"
      ? session.interview.analysis || null
      : null,
    response,
  };
}
