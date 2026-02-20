import { useCallback, useEffect, useRef, useState } from "react";
import { apiPatchSession } from "../../../lib/api/sessionApi";
import { parseAndProjectBpmnToInterview } from "./useInterviewProjection";
import { deriveActorsFromBpmn } from "../lib/deriveActorsFromBpmn";
import { traceProcess } from "../lib/processDebugTrace";

function shortErr(x) {
  const s = String(x || "").trim();
  if (!s) return "";
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}

function toNodeIdRaw(v) {
  const s = String(v || "").trim();
  return s || "";
}

function defaultTabForSession(draft) {
  const hasXml = String(draft?.bpmn_xml || "").trim().length > 0;
  if (hasXml) return "diagram";
  // Never hard-fallback to Interview on empty XML; Diagram can seed itself.
  return "diagram";
}

function shouldLogTabTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_BPMN__) return true;
  try {
    const bpmn = String(window.localStorage?.getItem("fpc_debug_bpmn") || "").trim() === "1";
    const tabs = String(window.localStorage?.getItem("fpc_debug_tabs") || "").trim() === "1";
    return bpmn || tabs;
  } catch {
    return false;
  }
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

function stackTrace() {
  try {
    return String(new Error("tab_set_trace").stack || "")
      .split("\n")
      .slice(2, 8)
      .map((line) => line.trim())
      .join(" | ");
  } catch {
    return "";
  }
}

function logTabSwitch(current, next, phase = "start", sid = "") {
  if (!shouldLogTabTrace()) return;
  const cur = String(current || "").trim() || "-";
  const target = String(next || "").trim() || "-";
  const sessionId = String(sid || "").trim() || "-";
  // eslint-disable-next-line no-console
  console.debug(`[TABS] switch ${cur} -> ${target} sid=${sessionId} phase=${phase} ts=${new Date().toISOString()}`);
  // eslint-disable-next-line no-console
  console.debug(`[TAB] from=${cur} to=${target} sid=${sessionId} phase=${phase}`);
}

function logTabDecision({ request, current, allow, reason, sessionId, storeLen, rev }) {
  if (!shouldLogTabTrace()) return;
  const req = String(request || "").trim() || "-";
  const cur = String(current || "").trim() || "-";
  const why = String(reason || "").trim() || "-";
  const sid = String(sessionId || "").trim() || "-";
  const len = Number.isFinite(Number(storeLen)) ? Number(storeLen) : 0;
  const r = Number.isFinite(Number(rev)) ? Number(rev) : 0;
  // eslint-disable-next-line no-console
  console.debug(`[TABS] request=${req} current=${cur} allow=${allow ? "1" : "0"} reason=${why} sessionId=${sid} storeLen=${len} rev=${r}`);
}

function logDraftState(tag, sid, phase, draftValue) {
  if (!shouldLogTabTrace()) return;
  const d = draftValue && typeof draftValue === "object" ? draftValue : {};
  const xml = String(d?.bpmn_xml || "");
  // eslint-disable-next-line no-console
  console.debug(
    `[DRAFT] ${String(tag || "state")} sid=${String(sid || "-")} phase=${String(phase || "-")} `
    + `bpmnLen=${xml.length} bpmnHash=${fnv1aHex(xml)}`,
  );
}

function normalizeTabId(tab) {
  const v = String(tab || "").trim().toLowerCase();
  if (v === "editor") return "diagram";
  if (v === "review" || v === "llm") return "";
  return v;
}

function isKnownTab(tab) {
  return tab === "interview" || tab === "diagram" || tab === "xml" || tab === "doc";
}

export default function useProcessTabs({
  sid,
  draft,
  isLocal,
  processTabIntent,
  bpmnRef,
  processBodyRef,
  bpmnSync,
  projectionHelpers,
  onSessionSync,
  flushInterviewBeforeTabSwitch,
  flushDiagramBeforeTabSwitch,
  invalidateHydrateForSession,
  markHydrateDoneForSession,
  onError,
}) {
  const [tab, setTabState] = useState(() => defaultTabForSession(draft));
  const [isSwitchingTab, setIsSwitchingTab] = useState(false);
  const [isFlushingTab, setIsFlushingTab] = useState(false);
  const [focusRequest, setFocusRequest] = useState(null);
  const draftRef = useRef(draft);
  const prevSidRef = useRef(String(sid || ""));
  const currentTabRef = useRef(defaultTabForSession(draft));
  const switchTabRef = useRef(async () => {});
  const handledIntentKeyRef = useRef("");
  const handledIntentGlobalRef = useRef(new Set());
  const sessionTabMemoryRef = useRef({});
  const switchBusyRef = useRef(false);
  const flushBusyRef = useRef(false);
  const pendingDiagramReplayRef = useRef(false);
  const pendingTabReplayRef = useRef(null);
  const pendingTabTimerRef = useRef(0);
  const visibleProbeCycleRef = useRef(0);
  const tabSetSeqRef = useRef(0);
  const sessionEpochRef = useRef(0);
  const sidRef = useRef(String(sid || ""));
  const processTabIntentRef = useRef(processTabIntent);

  const draftTraceMetaRef = useRef({ storeLen: 0, rev: 0 });

  const clearPendingTabReplay = useCallback(() => {
    pendingTabReplayRef.current = null;
    if (pendingTabTimerRef.current) {
      window.clearTimeout(pendingTabTimerRef.current);
      pendingTabTimerRef.current = 0;
    }
  }, []);

  const schedulePendingTabReplay = useCallback((delayMs = 40) => {
    if (pendingTabTimerRef.current) return;
    pendingTabTimerRef.current = window.setTimeout(async () => {
      pendingTabTimerRef.current = 0;
      const pending = pendingTabReplayRef.current;
      if (!pending) return;
      const currentSid = String(sidRef.current || "");
      const currentEpoch = Number(sessionEpochRef.current || 0);
      if (pending.sid !== currentSid || pending.epoch !== currentEpoch) {
        clearPendingTabReplay();
        return;
      }
      const activeTab = String(currentTabRef.current || "").toLowerCase();
      if (activeTab !== "diagram") return;
      let ready = false;
      try {
        ready = await Promise.resolve(
          bpmnRef?.current?.whenReady?.({
            timeoutMs: 5000,
            expectedSid: pending.sid,
          }),
        );
      } catch {
        ready = false;
      }
      if (!ready) {
        const attempts = Number(pending.attempts || 0) + 1;
        if (attempts > 12) {
          clearPendingTabReplay();
          return;
        }
        pendingTabReplayRef.current = {
          ...pending,
          attempts,
        };
        schedulePendingTabReplay(220);
        return;
      }
      if (pending !== pendingTabReplayRef.current) return;
      const sidNow = String(sidRef.current || "");
      const epochNow = Number(sessionEpochRef.current || 0);
      if (pending.sid !== sidNow || pending.epoch !== epochNow) return;
      clearPendingTabReplay();
      if (shouldLogTabTrace()) {
        // eslint-disable-next-line no-console
        console.debug(`[TAB_PENDING_REPLAY] sid=${pending.sid || "-"} target=${pending.target || "-"} reason=runtime_ready`);
      }
      void switchTabRef.current(String(pending.target || ""));
    }, Math.max(20, Number(delayMs || 40)));
  }, [bpmnRef, clearPendingTabReplay]);

  useEffect(() => {
    draftRef.current = draft;
    const draftXmlLen = String(draft?.bpmn_xml || "").length;
    const rev = Number(draft?.bpmn_xml_version || draft?.version || 0);
    draftTraceMetaRef.current = {
      storeLen: draftXmlLen,
      rev: Number.isFinite(rev) ? rev : 0,
    };
  }, [draft]);

  useEffect(() => {
    currentTabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    sidRef.current = String(sid || "");
  }, [sid]);

  useEffect(() => {
    return () => {
      clearPendingTabReplay();
    };
  }, [clearPendingTabReplay]);

  useEffect(() => {
    processTabIntentRef.current = processTabIntent;
  }, [processTabIntent]);

  const setTabWithReason = useCallback(
    (nextTab, reason = "direct_set", extra = {}) => {
      const to = String(nextTab || "").toLowerCase();
      if (!to) return;
      const from = String(currentTabRef.current || "").toLowerCase();
      const sidNow = String(sid || "").trim();
      if (sidNow) {
        sessionTabMemoryRef.current = {
          ...sessionTabMemoryRef.current,
          [sidNow]: to,
        };
      }
      currentTabRef.current = to;
      setTabState(to);
      if (!shouldLogTabTrace()) return;
      tabSetSeqRef.current += 1;
      const d = draftRef.current && typeof draftRef.current === "object" ? draftRef.current : {};
      const xml = String(d?.bpmn_xml || "");
      const actors = d?.actors_derived;
      const interview = d?.interview && typeof d.interview === "object" ? d.interview : {};
      const payload = [
        `[TAB_SET] seq=${tabSetSeqRef.current}`,
        `from=${from || "-"}`,
        `to=${to}`,
        `sid=${String(sid || "-")}`,
        `reason=${String(reason || "-")}`,
        `allow=${extra?.allow === false ? "0" : "1"}`,
        `isSwitching=${switchBusyRef.current ? "1" : "0"}`,
        `intent=${String(extra?.intent || "-")}`,
        `draftLen=${xml.length}`,
        `draftHash=${fnv1aHex(xml)}`,
        `draftRev=${Number(d?.bpmn_xml_version || d?.version || 0) || 0}`,
        `draftDirty=${d?.dirty ? 1 : 0}`,
        `actorsLen=${Array.isArray(actors) ? actors.length : 0}`,
        `actorsHash=${fnv1aHex(JSON.stringify(Array.isArray(actors) ? actors : []))}`,
        `interviewHash=${fnv1aHex(JSON.stringify(interview || {}))}`,
        `lastSavedRev=${Number(d?.lastSavedRev || 0) || 0}`,
        `lastLoadedRev=${Number(d?.lastLoadedRev || 0) || 0}`,
        `stack=${stackTrace()}`,
      ].join(" ");
      // eslint-disable-next-line no-console
      console.debug(payload);
    },
    [sid],
  );

  useEffect(() => {
    const prevSid = String(prevSidRef.current || "");
    prevSidRef.current = String(sid || "");
    sessionEpochRef.current += 1;
    const sidNow = String(sid || "").trim();
    const rememberedTabRaw = sidNow ? String(sessionTabMemoryRef.current?.[sidNow] || "").toLowerCase() : "";
    const rememberedTab = isKnownTab(rememberedTabRaw) ? rememberedTabRaw : "";
    const intentObj = processTabIntentRef.current && typeof processTabIntentRef.current === "object"
      ? processTabIntentRef.current
      : null;
    const intentTab = intentObj && String(intentObj.sid || "").trim() === sidNow
      ? normalizeTabId(intentObj.tab)
      : "";
    const currentTab = normalizeTabId(currentTabRef.current);
    const nextTab = rememberedTab
      || (isKnownTab(intentTab) ? intentTab : "")
      || (isKnownTab(currentTab) ? currentTab : "")
      || defaultTabForSession(draft);
    if (shouldLogTabTrace()) {
      // eslint-disable-next-line no-console
      console.debug(`[SESSION] activate sid=${String(sid || "-")} prevSid=${prevSid || "-"} tab=${String(tab || "-")}`);
    }
    setTabWithReason(nextTab, "session_change_default_tab", {
      allow: true,
      intent: rememberedTab ? "remembered" : (isKnownTab(intentTab) ? "intent" : "default"),
    });
    setFocusRequest(null);
    setIsFlushingTab(false);
    flushBusyRef.current = false;
    pendingDiagramReplayRef.current = false;
    clearPendingTabReplay();
    currentTabRef.current = nextTab;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  const flushBpmnTab = useCallback(
    async (activeTab, reason = "tab_switch") => {
      const current = String(activeTab || "").toLowerCase();
      if (!["diagram", "xml"].includes(current)) {
        return { ok: true, xml: String(draftRef.current?.bpmn_xml || ""), pending: false };
      }
      if (flushBusyRef.current) {
        return { ok: false, error: "flush_in_progress", xml: "" };
      }
      flushBusyRef.current = true;
      setIsFlushingTab(true);
      try {
        const flushed = await bpmnSync.flushFromActiveTab(current, {
          force: current === "diagram",
          source: reason,
          reason,
        });
        return flushed;
      } finally {
        flushBusyRef.current = false;
        setIsFlushingTab(false);
      }
    },
    [bpmnSync],
  );

  useEffect(() => {
    if (!sid) return;
    const el = processBodyRef?.current;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
    if (tab !== "diagram") return;
    let cancelled = false;
    const cycleIndex = visibleProbeCycleRef.current + 1;
    visibleProbeCycleRef.current = cycleIndex;
    const run = async () => {
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });
      if (cancelled) return;
      try {
        await bpmnRef?.current?.ensureVisible?.({
          reason: "tab_visible",
          cycleIndex,
          expectedSid: String(sid || ""),
        });
      } catch {
        // ignore
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [tab, sid, bpmnRef, processBodyRef]);

  useEffect(() => {
    const intent = processTabIntent && typeof processTabIntent === "object" ? processTabIntent : null;
    if (!intent) return;
    const targetSid = String(intent.sid || "").trim();
    const intentTab = String(intent.tab || "").trim().toLowerCase();
    const targetTab = intentTab === "editor" ? "diagram" : intentTab;
    if (!targetSid || targetSid !== sid) return;
    // TODO(tech-debt): review/llm tabs are intentionally hidden for now.
    if (!["interview", "diagram", "xml", "doc"].includes(targetTab)) return;
    const nonce = String(intent.nonce ?? "no_nonce");
    const intentKey = `${targetSid}:${targetTab}:${nonce}`;
    if (handledIntentGlobalRef.current.has(intentKey)) {
      const traceMeta = draftTraceMetaRef.current || { storeLen: 0, rev: 0 };
      logTabDecision({
        request: targetTab,
        current: currentTabRef.current,
        allow: false,
        reason: "intent_already_consumed_global",
        sessionId: sid,
        storeLen: traceMeta.storeLen,
        rev: traceMeta.rev,
      });
      return;
    }
    if (handledIntentKeyRef.current === intentKey) {
      const traceMeta = draftTraceMetaRef.current || { storeLen: 0, rev: 0 };
      logTabDecision({
        request: targetTab,
        current: currentTabRef.current,
        allow: false,
        reason: "intent_already_handled",
        sessionId: sid,
        storeLen: traceMeta.storeLen,
        rev: traceMeta.rev,
      });
      return;
    }
    handledIntentKeyRef.current = intentKey;
    handledIntentGlobalRef.current.add(intentKey);
    const current = String(currentTabRef.current || "").toLowerCase();
    const traceMeta = draftTraceMetaRef.current || { storeLen: 0, rev: 0 };
    if (current === targetTab) {
      logTabDecision({
        request: targetTab,
        current,
        allow: false,
        reason: "intent_same_tab",
        sessionId: sid,
        storeLen: traceMeta.storeLen,
        rev: traceMeta.rev,
      });
      return;
    }
    traceProcess("tabs.intent_switch", {
      sid,
      from: current,
      target: targetTab,
      nonce,
    });
    logTabDecision({
      request: targetTab,
      current,
      allow: true,
      reason: "intent_switch",
      sessionId: sid,
      storeLen: traceMeta.storeLen,
      rev: traceMeta.rev,
    });
    void switchTabRef.current(targetTab);
  }, [processTabIntent, sid]);

  useEffect(() => {
    if (!focusRequest || tab !== "diagram") return undefined;
    const timer = window.setTimeout(async () => {
      const ok = await Promise.resolve(bpmnRef?.current?.focusNode?.(focusRequest.nodeId));
      if (ok) {
        setFocusRequest(null);
        return;
      }
      if (focusRequest.attempt >= 12) {
        onError?.(`Не удалось перейти к узлу ${focusRequest.nodeId} на диаграмме.`);
        setFocusRequest(null);
        return;
      }
      setFocusRequest((prev) => (prev ? { ...prev, attempt: prev.attempt + 1 } : prev));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusRequest, tab, bpmnRef, onError]);

  useEffect(() => {
    if (!sid) return undefined;
    const flushByLifecycle = (reason) => {
      const current = String(currentTabRef.current || "").toLowerCase();
      if (!["diagram", "xml"].includes(current)) return;
      void bpmnSync.flushFromActiveTab(current, {
        force: current === "diagram",
        source: reason,
        reason,
      });
    };
    const onBeforeUnload = () => {
      flushByLifecycle("beforeunload");
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushByLifecycle("visibility_hidden");
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [sid, bpmnSync]);

  const switchTab = useCallback(
    async (nextTab) => {
      const rawTarget = String(nextTab || "").toLowerCase();
      const target = rawTarget === "editor" ? "diagram" : rawTarget;
      const current = String(tab || "").toLowerCase();
      const traceMeta = draftTraceMetaRef.current || { storeLen: 0, rev: 0 };
      if (!target) {
        logTabDecision({
          request: rawTarget,
          current,
          allow: false,
          reason: "empty_target",
          sessionId: sid,
          storeLen: traceMeta.storeLen,
          rev: traceMeta.rev,
        });
        return;
      }
      if (target === tab) {
        logTabDecision({
          request: target,
          current,
          allow: false,
          reason: "same_tab",
          sessionId: sid,
          storeLen: traceMeta.storeLen,
          rev: traceMeta.rev,
        });
        return;
      }
      if (switchBusyRef.current) {
        logTabDecision({
          request: target,
          current,
          allow: false,
          reason: "switch_busy",
          sessionId: sid,
          storeLen: traceMeta.storeLen,
          rev: traceMeta.rev,
        });
        return;
      }
      const switchSid = String(sidRef.current || "");
      const switchEpoch = Number(sessionEpochRef.current || 0);
      const isStaleSwitch = () =>
        switchSid !== String(sidRef.current || "")
        || switchEpoch !== Number(sessionEpochRef.current || 0);
      switchBusyRef.current = true;
      setIsSwitchingTab(true);
      logTabDecision({
        request: target,
        current,
        allow: true,
        reason: "switch_start",
        sessionId: sid,
        storeLen: traceMeta.storeLen,
        rev: traceMeta.rev,
      });
      const replayPendingOnEnterDiagram = target === "diagram" && pendingDiagramReplayRef.current;
      let seededDiagramNeedsPersist = false;
      traceProcess("tabs.switch_start", { sid, current, target });
      logTabSwitch(current, target, "start", switchSid);
      logDraftState("before", switchSid, `${current}->${target}`, draftRef.current);
      try {
        if (current === "diagram" && target !== "diagram") {
          let readyResult = true;
          try {
            const maybeReady = await Promise.resolve(
              bpmnRef?.current?.whenReady?.({
                timeoutMs: 5000,
                expectedSid: switchSid,
              }),
            );
            readyResult = maybeReady !== false;
          } catch {
            readyResult = false;
          }
          if (isStaleSwitch()) return;
          if (!readyResult) {
            pendingTabReplayRef.current = {
              sid: switchSid,
              epoch: switchEpoch,
              target,
              attempts: 0,
            };
            if (shouldLogTabTrace()) {
              // eslint-disable-next-line no-console
              console.debug(`[TAB_PENDING] sid=${switchSid || "-"} target=${target || "-"} reason=not_ready`);
            }
            schedulePendingTabReplay();
            logTabDecision({
              request: target,
              current,
              allow: true,
              reason: "diagram_not_ready_pending",
              sessionId: sid,
              storeLen: traceMeta.storeLen,
              rev: traceMeta.rev,
            });
            return;
          }
        }

        if (current === "interview" && target !== "interview") {
          const ok = await flushInterviewBeforeTabSwitch(tab, target);
          if (isStaleSwitch()) return;
          traceProcess("tabs.flush_interview", { sid, current, target, ok: !!ok });
          if (!ok) return;
          if (target === "diagram" || target === "xml") {
            const latest = await bpmnSync.fetchLatestXml({
              // Interview->XML/Diagram must use local draft as source-of-truth on tab switch.
              // Never sync backend snapshot into draft here.
              syncSession: false,
              preferDraft: true,
            });
            if (isStaleSwitch()) return;
            traceProcess("tabs.fetch_xml_before_bpmn_target", {
              sid,
              target,
              ok: !!latest.ok,
              xml_len: String(latest.xml || "").length,
            });
            if (!latest.ok) {
              onError?.(shortErr(latest.error || "Не удалось обновить BPMN из XML перед переключением вкладки."));
              logTabDecision({
                request: target,
                current,
                allow: false,
                reason: "fetch_latest_failed",
                sessionId: sid,
                storeLen: traceMeta.storeLen,
                rev: traceMeta.rev,
              });
              return;
            }
            const ensured = await bpmnSync.ensureSeedXml({
              source: "tab_switch_seed",
              reason: "tab_switch_seed",
              target,
            });
            if (isStaleSwitch()) return;
            traceProcess("tabs.ensure_seed", {
              sid,
              target,
              ok: !!ensured?.ok,
              seeded: ensured?.seeded ? 1 : 0,
              xml_len: String(ensured?.xml || "").length,
            });
            if (target === "diagram" && ensured?.seeded) {
              seededDiagramNeedsPersist = true;
            }
            if (!ensured?.ok) {
              onError?.(shortErr(ensured?.error || "Не удалось создать стартовый BPMN перед переключением."));
              logTabDecision({
                request: target,
                current,
                allow: false,
                reason: "seed_failed",
                sessionId: sid,
                storeLen: traceMeta.storeLen,
                rev: traceMeta.rev,
              });
              return;
            }
          }
        }

        const leavingBpmn = (current === "diagram" || current === "xml") && target !== current;
        if (leavingBpmn) {
          const ok = await flushDiagramBeforeTabSwitch(current, target);
          if (isStaleSwitch()) return;
          traceProcess("tabs.flush_diagram", { sid, current, target, ok: !!ok });
          if (!ok) return;
          try {
            const saved = await flushBpmnTab(current, "tab_switch");
            if (isStaleSwitch()) return;
            traceProcess("tabs.save_active_bpmn", {
              sid,
              current,
              target,
              ok: !!saved?.ok,
              xml_len: String(saved?.xml || "").length,
              pending: saved?.pending ? 1 : 0,
            });
            if (!saved.ok) {
              onError?.(shortErr(saved.error || "Не удалось сохранить BPMN перед переключением вкладки."));
              logTabDecision({
                request: target,
                current,
                allow: false,
                reason: "flush_bpmn_failed",
                sessionId: sid,
                storeLen: traceMeta.storeLen,
                rev: traceMeta.rev,
              });
              return;
            }
            if (current === "diagram" && saved?.pending) {
              pendingDiagramReplayRef.current = true;
              pendingTabReplayRef.current = {
                sid: switchSid,
                epoch: switchEpoch,
                target,
                attempts: 0,
              };
              if (shouldLogTabTrace()) {
                // eslint-disable-next-line no-console
                console.debug(`[TAB_PENDING] sid=${switchSid || "-"} target=${target || "-"} reason=diagram_save_pending`);
              }
              schedulePendingTabReplay();
              logTabDecision({
                request: target,
                current,
                allow: true,
                reason: "diagram_save_pending",
                sessionId: sid,
                storeLen: traceMeta.storeLen,
                rev: traceMeta.rev,
              });
              return;
            }
            if (current === "diagram") {
              pendingDiagramReplayRef.current = !!saved?.pending;
            }
            let savedXml = String(saved.xml || "");
            if (current === "diagram" && target === "interview" && savedXml.trim()) {
              await new Promise((resolve) => window.setTimeout(resolve, 48));
              if (isStaleSwitch()) return;
              try {
                const confirmSave = await flushBpmnTab(current, "tab_switch_confirm");
                if (isStaleSwitch()) return;
                if (confirmSave?.ok && !confirmSave?.pending) {
                  const confirmedXml = String(confirmSave.xml || "");
                  if (confirmedXml.trim()) {
                    savedXml = confirmedXml;
                  }
                }
              } catch {
                // ignore confirm pass; fall back to first save result
              }
            }

            if (target === "interview") {
              let xmlForSync = savedXml;
              const latest = await bpmnSync.fetchLatestXml({
                // Do not overwrite draft with backend/export snapshot on tab switch.
                // This avoids rollback when backend /bpmn export lags behind local draft.
                syncSession: false,
                preferDraft: true,
              });
              if (isStaleSwitch()) return;
              if (latest.ok) {
                const latestXml = String(latest.xml || "");
                const shouldUseLatest = !xmlForSync.trim()
                  || saved?.pending
                  || latestXml.length > xmlForSync.length;
                if (shouldUseLatest && latestXml.trim()) {
                  xmlForSync = latestXml;
                }
              }
              if (!xmlForSync.trim()) {
                xmlForSync = String(draftRef.current?.bpmn_xml || "");
              }
              if (xmlForSync.trim()) {
                const draftNow = draftRef.current && typeof draftRef.current === "object" ? draftRef.current : {};
                const projected = parseAndProjectBpmnToInterview({
                  xmlText: xmlForSync,
                  draft: {
                    ...draftNow,
                    bpmn_xml: xmlForSync,
                  },
                  helpers: projectionHelpers,
                  preferBpmn: true,
                  forceTimelineFromBpmn: true,
                });
                if (projected.ok) {
                  const derivedActors = deriveActorsFromBpmn(xmlForSync);
                  onSessionSync?.({
                    ...draftNow,
                    id: sid,
                    session_id: sid,
                    bpmn_xml: xmlForSync,
                    interview: projected.nextInterview,
                    nodes: projected.nextNodes,
                    edges: projected.nextEdges,
                    actors_derived: derivedActors,
                  });

                  if (!isLocal) {
                    const syncPatch = {
                      interview: projected.nextInterview,
                    };
                    const syncRes = await apiPatchSession(sid, syncPatch);
                    if (isStaleSwitch()) return;
                    traceProcess("tabs.sync_interview_from_bpmn", {
                      sid,
                      ok: !!syncRes.ok,
                      interview_steps: Array.isArray(projected.nextInterview?.steps) ? projected.nextInterview.steps.length : 0,
                      nodes: Array.isArray(projected.nextNodes) ? projected.nextNodes.length : 0,
                      edges: Array.isArray(projected.nextEdges) ? projected.nextEdges.length : 0,
                    });
                    if (syncRes.ok) {
                      const serverSession =
                        syncRes.session && typeof syncRes.session === "object"
                          ? syncRes.session
                          : {};
                      onSessionSync?.({
                        ...draftNow,
                        ...serverSession,
                        id: sid,
                        session_id: sid,
                        bpmn_xml: xmlForSync,
                        interview: projected.nextInterview,
                        nodes: projected.nextNodes,
                        edges: projected.nextEdges,
                        actors_derived: derivedActors,
                      });
                      markHydrateDoneForSession?.();
                    } else {
                      onError?.(shortErr(syncRes.error || "Не удалось синхронизировать Interview из BPMN при переходе на вкладку Interview."));
                    }
                  } else {
                    markHydrateDoneForSession?.();
                  }
                }
              }
              if (!xmlForSync.trim()) {
                invalidateHydrateForSession?.();
              }
            }
	          } catch {
            traceProcess("tabs.switch_error", { sid, current, target, error: "save_before_switch_failed" });
            onError?.("Не удалось сохранить BPMN перед переключением вкладки.");
            logTabDecision({
              request: target,
              current,
              allow: false,
              reason: "switch_exception",
              sessionId: sid,
              storeLen: traceMeta.storeLen,
              rev: traceMeta.rev,
            });
            return;
          }
        }
        traceProcess("tabs.switch_done", { sid, current, target });
        logTabSwitch(current, target, "done", switchSid);
        if (isStaleSwitch()) return;
        setTabWithReason(target, "switch_done", { allow: true });
        logDraftState("after", switchSid, `${current}->${target}`, draftRef.current);
        if (target === "diagram" && shouldLogTabTrace()) {
          const d = draftRef.current && typeof draftRef.current === "object" ? draftRef.current : {};
          const xml = String(d?.bpmn_xml || "");
          // eslint-disable-next-line no-console
          console.debug(
            `[DIAGRAM_ENTER] sid=${switchSid || "-"} source=tab_switch `
            + `bpmnLen=${xml.length} bpmnHash=${fnv1aHex(xml)}`,
          );
        }
        if (target === "xml") {
          clearPendingTabReplay();
        }
        if (replayPendingOnEnterDiagram) {
          pendingDiagramReplayRef.current = false;
          const replaySid = switchSid;
          const replayEpoch = switchEpoch;
          window.setTimeout(() => {
            if (replaySid !== String(sidRef.current || "")) return;
            if (replayEpoch !== Number(sessionEpochRef.current || 0)) return;
            void bpmnSync.flushFromActiveTab("diagram", {
              force: true,
              source: "pending_replay_switch",
              reason: "pending_replay_switch",
            });
          }, 80);
        }
        if (seededDiagramNeedsPersist) {
          const replaySid = switchSid;
          const replayEpoch = switchEpoch;
          window.setTimeout(() => {
            if (replaySid !== String(sidRef.current || "")) return;
            if (replayEpoch !== Number(sessionEpochRef.current || 0)) return;
            void bpmnSync.flushFromActiveTab("diagram", {
              force: true,
              source: "seed_persist_switch",
              reason: "seed_persist_switch",
            });
          }, 220);
        }
      } finally {
        switchBusyRef.current = false;
        setIsSwitchingTab(false);
      }
    },
    [
      tab,
      flushInterviewBeforeTabSwitch,
      flushDiagramBeforeTabSwitch,
      bpmnSync,
      bpmnSync.ensureSeedXml,
      projectionHelpers,
      onSessionSync,
      sid,
      isLocal,
      invalidateHydrateForSession,
      markHydrateDoneForSession,
      flushBpmnTab,
      onError,
      schedulePendingTabReplay,
      clearPendingTabReplay,
    ],
  );

  const requestDiagramFocus = useCallback((nodeId) => {
    const id = toNodeIdRaw(nodeId);
    if (!id) return false;
    setTabWithReason("diagram", "request_focus", { allow: true });
    setFocusRequest({ nodeId: id, attempt: 0 });
    return true;
  }, []);

  const isInterview = tab === "interview";
  const isBpmnTab = tab === "diagram" || tab === "xml";
  switchTabRef.current = switchTab;

  const setTab = useCallback(
    (nextTab) => {
      clearPendingTabReplay();
      setTabWithReason(nextTab, "external_set_tab", { allow: true });
    },
    [setTabWithReason, clearPendingTabReplay],
  );

  return {
    tab,
    setTab,
    switchTab,
    isSwitchingTab,
    isFlushingTab,
    requestDiagramFocus,
    isInterview,
    isBpmnTab,
  };
}
