import { useCallback, useEffect, useRef } from "react";
import { deriveActorsFromBpmn } from "../lib/deriveActorsFromBpmn";
import { buildBpmnSaveFailureDiagnostics } from "../bpmn/save/saveBeforeSwitchDiagnostics.js";

function toText(v) {
  return String(v || "");
}

function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function shouldLogBpmnTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_BPMN__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_bpmn") || "").trim() === "1";
  } catch {
    return false;
  }
}

function shouldLogActorsTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_ACTORS__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_actors") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logActorsTrace(tag, payload = {}) {
  if (!shouldLogActorsTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[ACTORS] ${String(tag || "trace")} ${suffix}`.trim());
}

function logBpmnTrace(tag, xmlText, meta = null) {
  if (!shouldLogBpmnTrace()) return;
  const xml = String(xmlText || "");
  const extra = meta && typeof meta === "object"
    ? Object.entries(meta)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(" ")
    : "";
  const suffix = extra ? ` ${extra}` : "";
  // eslint-disable-next-line no-console
  console.debug(`[BPMN] ${String(tag || "unknown")} len=${xml.length} hash=${fnv1aHex(xml)}${suffix}`);
}

function shortStack() {
  try {
    return String(new Error("bpmn_store_set_trace").stack || "")
      .split("\n")
      .slice(2, 7)
      .map((line) => line.trim())
      .join(" | ");
  } catch {
    return "";
  }
}

function saveAttemptKindBySource(sourceText) {
  const source = String(sourceText || "").toLowerCase();
  if (source.includes("tab_switch")) return "tab_switch";
  if (source.includes("beforeunload") || source.includes("pagehide") || source.includes("visibility_hidden")) {
    return "lifecycle_flush";
  }
  return "manual";
}

function buildSaveFailureResult(raw = {}, context = {}) {
  const diagnostics = buildBpmnSaveFailureDiagnostics(raw, context);
  return {
    ok: false,
    xml: String(raw?.xml || ""),
    error: diagnostics.userMessage,
    errorClass: diagnostics.errorClass,
    errorCode: diagnostics.errorCode,
    status: diagnostics.status,
    canRetry: diagnostics.canRetry,
    canLeaveUnsafely: diagnostics.canLeaveUnsafely,
    diagnosticsSeverity: diagnostics.diagnosticsSeverity,
    diagnostics,
  };
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function buildSeedBpmnXml(title = "") {
  const processName = escapeXml(String(title || "").trim() || "Новый процесс");
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false" name="${processName}">
    <bpmn:startEvent id="StartEvent_1" name="Старт" />
    <bpmn:task id="Task_1" name="Опишите первый шаг процесса" />
    <bpmn:endEvent id="EndEvent_1" name="Финиш" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="280" y="128" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="500" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="216" y="168" />
        <di:waypoint x="280" y="168" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="420" y="168" />
        <di:waypoint x="500" y="168" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

export default function useBpmnSync({
  sessionId,
  isLocal,
  draft,
  bpmnRef,
  onSessionSync,
  apiGetBpmnXml,
}) {
  const sid = toText(sessionId).trim();
  const draftRef = useRef(draft);
  const storeUpdateCountRef = useRef(0);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const waitForRefMethod = useCallback(
    async (methodName, timeoutMs = 1200) => {
      const started = Date.now();
      while (Date.now() - started <= timeoutMs) {
        const fn = bpmnRef.current?.[methodName];
        if (typeof fn === "function") return fn;
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
      return null;
    },
    [bpmnRef],
  );

  const syncXmlToSession = useCallback(
    (xmlText, meta = {}) => {
      const xml = toText(xmlText || "");
      if (!xml.trim() || !sid) return;
      const source = String(meta?.source || "unknown").trim() || "unknown";
      const xmlHash = fnv1aHex(xml);
      logActorsTrace("derive start", {
        sid,
        source,
        xmlLen: xml.length,
        xmlHash,
      });
      const derivedActors = deriveActorsFromBpmn(xml);
      logActorsTrace("derive done", {
        sid,
        source,
        count: derivedActors.length,
      });
      storeUpdateCountRef.current += 1;
      logBpmnTrace("STORE_UPDATED", xml, {
        sid,
        source,
        target: "session_draft",
        count: Number(storeUpdateCountRef.current || 0),
      });
      if (shouldLogBpmnTrace()) {
        const base = asObject(draftRef.current);
        // eslint-disable-next-line no-console
        console.debug(
          `[BPMN_STORE_SET] sid=${sid} source=${source} len=${xml.length} hash=${fnv1aHex(xml)} `
          + `rev=${Number(base?.bpmn_xml_version || base?.version || 0)} `
          + `stack=${shortStack()}`,
        );
      }
      onSessionSync?.({
        id: sid,
        session_id: sid,
        bpmn_xml: xml,
        actors_derived: derivedActors,
        _sync_source: source,
      });
    },
    [onSessionSync, sid],
  );

  const saveFromModeler = useCallback(async (options = {}) => {
    const force = options?.force === true;
    const source = String(options?.source || (force ? "tab_switch" : "autosave")).trim() || "autosave";
    const persistReason = String(options?.persistReason || source).trim() || source;
    const isManualSaveAction = source === "manual_save";
    const allowInFlightPendingOutcome = force && !isManualSaveAction;
    let saveLocal = bpmnRef.current?.saveLocal;
    if (force && typeof saveLocal !== "function") {
      saveLocal = await waitForRefMethod("saveLocal", 1500);
    }
    const fallbackXml = toText(
      bpmnRef.current?.getXmlDraft?.() || draftRef.current?.bpmn_xml || "",
    );
    const isSaveInProgress = () => {
      try {
        return !!bpmnRef.current?.isFlushing?.();
      } catch {
        return false;
      }
    };
    const requestBaseRev = asNumber(
      draftRef.current?.bpmn_xml_version ?? draftRef.current?.version ?? 0,
      0,
    );
    const failureContext = {
      saveAttemptKind: saveAttemptKindBySource(source),
      activeBpmnSource: "diagram_modeler",
      sourceReason: source,
      sessionId: sid,
      projectId: toText(draftRef.current?.project_id || draftRef.current?.projectId || ""),
      requestBaseRev,
      payloadHash: fallbackXml.trim() ? fnv1aHex(fallbackXml) : "",
    };
    if (allowInFlightPendingOutcome && isSaveInProgress()) {
      if (fallbackXml.trim()) {
        syncXmlToSession(fallbackXml, { source: `${source}:pending_flush` });
      }
      return { ok: true, pending: true, reason: "save_in_progress", xml: fallbackXml };
    }
    if (typeof saveLocal !== "function") {
      if (isLocal && fallbackXml.trim()) {
        syncXmlToSession(fallbackXml, { source: `${source}:fallback_no_modeler` });
        return { ok: true, xml: fallbackXml };
      }
      return buildSaveFailureResult(
        {
          error: "Modeler недоступен для сохранения BPMN.",
          errorCode: "modeler_unavailable",
          status: 0,
          xml: "",
        },
        failureContext,
      );
    }
    try {
      const saved = await Promise.resolve(saveLocal({ force, source, persistReason }));
      if (saved === false || (saved && typeof saved === "object" && saved.ok === false)) {
        if (allowInFlightPendingOutcome && isSaveInProgress()) {
          if (fallbackXml.trim()) {
            syncXmlToSession(fallbackXml, { source: `${source}:pending_on_error` });
          }
          return { ok: true, pending: true, reason: "save_in_progress", xml: fallbackXml };
        }
        if (force && isLocal && fallbackXml.trim()) {
          syncXmlToSession(fallbackXml, { source: `${source}:fallback_on_error` });
          return { ok: true, xml: fallbackXml };
        }
        return buildSaveFailureResult(saved && typeof saved === "object" ? saved : {
          error: "Не удалось сохранить BPMN перед переключением вкладки.",
          xml: "",
        }, failureContext);
      }
      let savedXml = saved && typeof saved === "object"
        ? toText(saved.xml)
        : toText(draftRef.current?.bpmn_xml || "");
      const pending = !!(saved && typeof saved === "object" && saved.pending === true);
      let selectedSource = "runtime";
      if (!savedXml.trim() && fallbackXml.trim()) {
        savedXml = fallbackXml;
        selectedSource = "store_fallback";
      }
      if (force && !savedXml.trim()) {
        if (pending) {
          logBpmnTrace("FORCED_SAVE_EMPTY_PENDING", savedXml, {
            sid,
            source,
            pending: 1,
            fallback_len: fallbackXml.length,
          });
          return { ok: true, pending: true, xml: "" };
        }
        return buildSaveFailureResult(
          {
            error: "Принудительное сохранение BPMN вернуло пустой XML.",
            errorCode: "empty_xml_after_force_save",
            xml: "",
          },
          failureContext,
        );
      }
      if (savedXml.trim()) {
        logBpmnTrace("FLUSH_SAVE_XML_SELECTED", savedXml, {
          sid,
          source,
          xml_source: selectedSource,
          pending: pending ? 1 : 0,
        });
        syncXmlToSession(savedXml, { source });
      }
      return {
        ok: true,
        xml: savedXml,
        pending,
        storedRev: Number(saved?.storedRev || saved?.rev || 0),
        diagramStateVersion: Number(saved?.diagramStateVersion || 0),
        bpmnVersionSnapshot: saved?.bpmnVersionSnapshot && typeof saved.bpmnVersionSnapshot === "object"
          ? saved.bpmnVersionSnapshot
          : null,
      };
    } catch (error) {
      if (allowInFlightPendingOutcome && isSaveInProgress()) {
        if (fallbackXml.trim()) {
          syncXmlToSession(fallbackXml, { source: `${source}:pending_catch` });
        }
        return { ok: true, pending: true, reason: "save_in_progress", xml: fallbackXml };
      }
      if (force && isLocal && fallbackXml.trim()) {
        syncXmlToSession(fallbackXml, { source: `${source}:fallback_catch` });
        return { ok: true, xml: fallbackXml };
      }
      return buildSaveFailureResult(
        {
          error: String(error?.message || error || "Не удалось сохранить BPMN перед переключением вкладки."),
          status: asNumber(error?.status || 0, 0),
          errorCode: toText(error?.code || ""),
          xml: "",
        },
        failureContext,
      );
    }
  }, [bpmnRef, isLocal, sid, syncXmlToSession, waitForRefMethod]);

  const saveFromXmlDraft = useCallback(async (options = {}) => {
    const force = options?.force === true;
    const source = String(options?.source || "manual_xml").trim() || "manual_xml";
    const requestBaseRev = asNumber(
      draftRef.current?.bpmn_xml_version ?? draftRef.current?.version ?? 0,
      0,
    );
    const xmlFallback = toText(bpmnRef.current?.getXmlDraft?.() || draftRef.current?.bpmn_xml || "");
    const failureContext = {
      saveAttemptKind: saveAttemptKindBySource(source),
      activeBpmnSource: "xml_draft",
      sourceReason: source,
      sessionId: sid,
      projectId: toText(draftRef.current?.project_id || draftRef.current?.projectId || ""),
      requestBaseRev,
      payloadHash: xmlFallback.trim() ? fnv1aHex(xmlFallback) : "",
    };
    const hasChanges = !!bpmnRef.current?.hasXmlDraftChanges?.();
    if (!hasChanges) {
      const raw = toText(bpmnRef.current?.getXmlDraft?.() || draftRef.current?.bpmn_xml || "");
      syncXmlToSession(raw, { source: `${source}:no_changes` });
      return { ok: true, xml: raw, pending: false };
    }
    const saved = await Promise.resolve(bpmnRef.current?.saveXmlDraft?.());
    if (saved === false || (saved && typeof saved === "object" && saved.ok === false)) {
      if (force) {
        const fallback = toText(draftRef.current?.bpmn_xml || "");
        if (fallback.trim()) {
          syncXmlToSession(fallback, { source: `${source}:fallback_on_error` });
          return { ok: true, xml: fallback, pending: false };
        }
      }
      const errText = saved && typeof saved === "object" ? toText(saved.error) : "";
      return buildSaveFailureResult(
        {
          ...(saved && typeof saved === "object" ? saved : {}),
          error: errText || "Не удалось сохранить XML перед переключением вкладки.",
          xml: "",
        },
        failureContext,
      );
    }
    const savedXml = saved && typeof saved === "object"
      ? toText(saved.xml)
      : toText(draftRef.current?.bpmn_xml || "");
    syncXmlToSession(savedXml, { source });
    return {
      ok: true,
      xml: savedXml,
      pending: false,
      storedRev: Number(saved?.storedRev || saved?.rev || 0),
      diagramStateVersion: Number(saved?.diagramStateVersion || 0),
      bpmnVersionSnapshot: saved?.bpmnVersionSnapshot && typeof saved.bpmnVersionSnapshot === "object"
        ? saved.bpmnVersionSnapshot
        : null,
    };
  }, [bpmnRef, sid, syncXmlToSession]);

  const flushFromActiveTab = useCallback(
    async (activeTab, options = {}) => {
      const tab = toText(activeTab || "").trim().toLowerCase();
      const force = options?.force === true;
      const source = String(
        options?.source
          || options?.reason
          || (force ? "tab_switch" : "manual"),
      ).trim() || "manual";
      if (tab === "xml") {
        return await saveFromXmlDraft({ ...options, force, source });
      }
      if (tab === "diagram") {
        return await saveFromModeler({ ...options, force: true, source });
      }
      return { ok: true, xml: toText(draftRef.current?.bpmn_xml || ""), pending: false };
    },
    [saveFromModeler, saveFromXmlDraft],
  );

  const saveFromActiveTab = useCallback(
    async (activeTab, options = {}) => {
      return await flushFromActiveTab(activeTab, options);
    },
    [flushFromActiveTab],
  );

  const fetchLatestXml = useCallback(async (options = {}) => {
    const syncSession = options?.syncSession !== false;
    const preferDraft = options?.preferDraft !== false;
    if (preferDraft) {
      const draftXml = toText(draftRef.current?.bpmn_xml || "");
      if (draftXml.trim()) {
        if (syncSession) syncXmlToSession(draftXml, { source: "fetch_latest_xml:draft" });
        return { ok: true, xml: draftXml };
      }
    }
    if (!sid || isLocal) {
      return { ok: true, xml: toText(draftRef.current?.bpmn_xml || "") };
    }
    const latest = await apiGetBpmnXml(sid);
    if (!latest.ok) {
      return {
        ok: false,
        error: String(latest.error || "Не удалось получить BPMN"),
        xml: toText(draftRef.current?.bpmn_xml || ""),
      };
    }
    const xml = toText(latest.xml || "");
    if (syncSession) syncXmlToSession(xml, { source: "fetch_latest_xml:backend" });
    return { ok: true, xml };
  }, [apiGetBpmnXml, isLocal, sid, syncXmlToSession]);

  const importXml = useCallback(
    async (xmlText) => {
      const raw = toText(xmlText || "");
      const imported = await Promise.resolve(bpmnRef.current?.importXmlText?.(raw));
      if (!imported) {
        return { ok: false, error: "Импорт не выполнен." };
      }
      if (sid) {
        syncXmlToSession(raw, { source: "import_xml" });
      }
      return { ok: true, xml: raw };
    },
    [bpmnRef, sid, syncXmlToSession],
  );

  const resetBackend = useCallback(async () => {
    await Promise.resolve(bpmnRef.current?.resetBackend?.());
  }, [bpmnRef]);

  const resolveXmlForExport = useCallback(async (activeTab) => {
    const tab = toText(activeTab || "").trim().toLowerCase();
    let xml = "";
    if (tab === "diagram" || tab === "xml") {
      const saved = await saveFromActiveTab(tab);
      if (!saved.ok) return saved;
      xml = toText(saved.xml || "");
    }
    if (!xml.trim()) {
      const latest = await fetchLatestXml();
      if (latest.ok) {
        xml = toText(latest.xml || "");
      } else {
        xml = toText(latest.xml || "");
      }
    }
    if (!xml.trim()) {
      xml = toText(draftRef.current?.bpmn_xml || "");
    }
    return { ok: true, xml };
  }, [fetchLatestXml, saveFromActiveTab]);

  const ensureSeedXml = useCallback(async (options = {}) => {
    const source = String(options?.source || "tab_seed").trim() || "tab_seed";
    const reason = String(options?.reason || source).trim() || source;
    const target = String(options?.target || "").trim() || "-";
    const draftXml = toText(draftRef.current?.bpmn_xml || "");
    if (shouldLogBpmnTrace()) {
      // eslint-disable-next-line no-console
      console.debug(`[COORD] ensureSeed start sid=${sid || "-"} reason=${reason} target=${target} draft_len=${draftXml.length}`);
    }
    if (draftXml.trim()) {
      if (shouldLogBpmnTrace()) {
        // eslint-disable-next-line no-console
        console.debug(`[COORD] ensureSeed skip sid=${sid || "-"} reason=draft_non_empty len=${draftXml.length}`);
      }
      return { ok: true, xml: draftXml, seeded: false, source: "draft" };
    }
    if (sid && !isLocal && typeof apiGetBpmnXml === "function") {
      const latest = await apiGetBpmnXml(sid);
      if (latest?.ok) {
        const backendXml = toText(latest.xml || "");
        if (backendXml.trim()) {
          syncXmlToSession(backendXml, { source: `${source}:backend_non_empty` });
          if (shouldLogBpmnTrace()) {
            // eslint-disable-next-line no-console
            console.debug(`[COORD] ensureSeed skip sid=${sid || "-"} reason=backend_non_empty len=${backendXml.length}`);
          }
          return { ok: true, xml: backendXml, seeded: false, source: "backend" };
        }
      }
    }
    const seedXml = buildSeedBpmnXml(draftRef.current?.title);
    syncXmlToSession(seedXml, { source: `${source}:generated` });
    if (shouldLogBpmnTrace()) {
      // eslint-disable-next-line no-console
      console.debug(`[COORD] ensureSeed ok sid=${sid || "-"} reason=generated len=${seedXml.length}`);
    }
    return { ok: true, xml: seedXml, seeded: true, source: "seed" };
  }, [apiGetBpmnXml, isLocal, sid, syncXmlToSession]);

  return {
    saveFromModeler,
    saveFromXmlDraft,
    saveFromActiveTab,
    flushFromActiveTab,
    fetchLatestXml,
    importXml,
    resetBackend,
    resolveXmlForExport,
    ensureSeedXml,
  };
}
