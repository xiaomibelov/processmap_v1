import { finalizeCamundaExtensionsXml, normalizeCamundaExtensionsMap } from "./camundaExtensions.js";

function toText(value) {
  return String(value || "").trim();
}

function toNonNegativeIntOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isDiagramStateConflict(saveResult) {
  const status = Number(saveResult?.status || 0);
  if (status === 409) return true;
  const marker = `${String(saveResult?.error || "")} ${String(saveResult?.text || "")}`.toUpperCase();
  return marker.includes("DIAGRAM_STATE_CONFLICT");
}

function pickDiagramStateBaseVersion(sessionLike) {
  const raw = sessionLike && typeof sessionLike === "object"
    ? sessionLike.diagram_state_version ?? sessionLike.bpmn_xml_version ?? sessionLike.version
    : null;
  return toNonNegativeIntOrNull(raw);
}

function buildRetryMeta({
  latestMetaRaw,
  previousMetaRaw,
  nextCamundaExtensionsByElementId,
}) {
  const latestMeta = asObject(latestMetaRaw);
  const previousMeta = asObject(previousMetaRaw);
  return {
    ...previousMeta,
    ...latestMeta,
    camunda_extensions_by_element_id: nextCamundaExtensionsByElementId,
  };
}

function buildFallbackSessionPatch({
  sid,
  nextXml,
  nextMeta,
  storedRev,
  diagramStateVersion,
  syncSource,
}) {
  return {
    id: sid,
    session_id: sid,
    bpmn_xml: nextXml,
    bpmn_meta: nextMeta,
    bpmn_xml_version: Number(storedRev || 0),
    version: Number(storedRev || 0),
    diagram_state_version: Number(diagramStateVersion || 0),
    _sync_source: syncSource,
  };
}

export function buildCamundaExtensionsCanonicalXml({
  currentXmlRaw,
  nextCamundaExtensionsByElementIdRaw,
  buildCanonicalXml,
}) {
  const currentXml = toText(currentXmlRaw);
  const nextCamundaExtensionsByElementId = normalizeCamundaExtensionsMap(nextCamundaExtensionsByElementIdRaw);
  const buildXml = typeof buildCanonicalXml === "function"
    ? buildCanonicalXml
    : ({ xmlText, camundaExtensionsByElementId }) => finalizeCamundaExtensionsXml({
      xmlText,
      camundaExtensionsByElementId,
    });
  const nextXml = buildXml({
    xmlText: currentXml,
    camundaExtensionsByElementId: nextCamundaExtensionsByElementId,
  });
  return {
    currentXml,
    nextXml: String(nextXml || ""),
    nextCamundaExtensionsByElementId,
  };
}

export async function persistCamundaExtensionsViaCanonicalXmlBoundary({
  sessionIdRaw,
  isLocal,
  currentXmlRaw,
  nextMetaRaw,
  nextCamundaExtensionsByElementIdRaw,
  baseDiagramStateVersionRaw,
  buildCanonicalXml,
  apiPutBpmnXml,
  apiGetSession,
  onSessionSync,
  syncSource = "camunda_extensions_xml_boundary_save",
}) {
  const sid = toText(sessionIdRaw);
  const nextMeta = asObject(nextMetaRaw);
  const {
    currentXml,
    nextXml,
    nextCamundaExtensionsByElementId,
  } = buildCamundaExtensionsCanonicalXml({
    currentXmlRaw,
    nextCamundaExtensionsByElementIdRaw,
    buildCanonicalXml,
  });

  if (!nextXml) {
    return { ok: false, status: 0, error: "Пустая BPMN XML: не удалось применить Properties." };
  }
  if (nextXml === currentXml) {
    return { ok: false, status: 0, error: "Изменения Properties не применились к BPMN XML." };
  }

  if (!sid || isLocal) {
    if (typeof onSessionSync === "function" && sid) {
      onSessionSync({
        ...buildFallbackSessionPatch({
          sid,
          nextXml,
          nextMeta,
          storedRev: toNonNegativeIntOrNull(baseDiagramStateVersionRaw),
          diagramStateVersion: toNonNegativeIntOrNull(baseDiagramStateVersionRaw),
          syncSource,
        }),
      });
    }
    return {
      ok: true,
      local: true,
      nextXml,
      nextMeta,
      nextCamundaExtensionsByElementId,
    };
  }

  if (typeof apiPutBpmnXml !== "function") {
    return { ok: false, status: 0, error: "apiPutBpmnXml unavailable" };
  }

  let persistedXml = nextXml;
  let persistedMeta = nextMeta;
  let saveRes = await apiPutBpmnXml(sid, nextXml, {
    reason: "manual_save:camunda_extensions",
    baseDiagramStateVersion: toNonNegativeIntOrNull(baseDiagramStateVersionRaw),
    bpmnMeta: nextMeta,
  });

  if (!saveRes?.ok && isDiagramStateConflict(saveRes) && typeof apiGetSession === "function") {
    const latest = await apiGetSession(sid);
    if (latest?.ok && latest.session && typeof latest.session === "object") {
      const retryMeta = buildRetryMeta({
        latestMetaRaw: latest.session?.bpmn_meta,
        previousMetaRaw: nextMeta,
        nextCamundaExtensionsByElementId,
      });
      const rebased = buildCamundaExtensionsCanonicalXml({
        currentXmlRaw: latest.session?.bpmn_xml,
        nextCamundaExtensionsByElementIdRaw: nextCamundaExtensionsByElementId,
        buildCanonicalXml,
      });
      if (rebased.nextXml && rebased.nextXml !== rebased.currentXml) {
        const retryBaseVersion = pickDiagramStateBaseVersion(latest.session);
        const retryRes = await apiPutBpmnXml(sid, rebased.nextXml, {
          reason: "manual_save:camunda_extensions",
          baseDiagramStateVersion: retryBaseVersion,
          bpmnMeta: retryMeta,
        });
        if (retryRes?.ok) {
          saveRes = retryRes;
          persistedXml = rebased.nextXml;
          persistedMeta = retryMeta;
        }
      }
    }
  }

  if (!saveRes?.ok) {
    return {
      ok: false,
      status: Number(saveRes?.status || 0),
      error: String(saveRes?.error || "Не удалось сохранить Properties."),
    };
  }

  let sessionSynced = false;
  if (typeof apiGetSession === "function") {
    const fresh = await apiGetSession(sid);
    if (fresh?.ok && fresh.session && typeof fresh.session === "object") {
      onSessionSync?.({
        ...fresh.session,
        _sync_source: syncSource,
      });
      sessionSynced = true;
    }
  }
  if (!sessionSynced) {
    onSessionSync?.(
      buildFallbackSessionPatch({
        sid,
        nextXml: persistedXml,
        nextMeta: persistedMeta,
        storedRev: Number(saveRes?.storedRev || 0),
        diagramStateVersion: Number(saveRes?.diagramStateVersion || 0),
        syncSource,
      }),
    );
  }

  return {
    ok: true,
    status: Number(saveRes?.status || 200),
    storedRev: Number(saveRes?.storedRev || 0),
    diagramStateVersion: Number(saveRes?.diagramStateVersion || 0),
    nextXml: persistedXml,
    nextMeta: persistedMeta,
    nextCamundaExtensionsByElementId,
  };
}
