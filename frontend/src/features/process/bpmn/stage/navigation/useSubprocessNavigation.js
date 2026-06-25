import { useCallback } from "react";
import { apiNavigateToSubprocess, apiReturnToParent } from "../../../../../lib/api.js";

export default function useSubprocessNavigation({
  bpmnStageRef,
  sessionCacheRef,
  bpmnXmlCacheRef,
  parentViewportSnapshotRef,
  setSubprocessBreadcrumbs,
  setFocusElementId,
  setDiscussionLinkedElementFocusIntent,
  pushSessionSelectionToUrl,
  projectRouteContext,
  projectId,
  openSession,
  setRestoreViewportSnapshot,
  draft,
  logNav,
}) {
  const navigateToSubprocess = useCallback(async (sessionIdArg, elementId, targetElementId = "") => {
    const res = await apiNavigateToSubprocess(sessionIdArg, elementId, targetElementId);
    if (!res.ok) {
      console.error("navigate failed", res.error);
      return;
    }

    try {
      const snapshot = bpmnStageRef.current?.getCanvasSnapshot?.();
      if (snapshot) {
        parentViewportSnapshotRef.current.set(String(sessionIdArg || "").trim(), snapshot);
      }
    } catch (e) {
      logNav?.("subprocess_viewport_snapshot_failed", { sessionId: sessionIdArg, error: String(e?.message || e) });
    }

    if (sessionCacheRef.current && draft?.session_id === String(sessionIdArg || "").trim()) {
      sessionCacheRef.current.set(String(sessionIdArg || "").trim(), draft);
    }

    setSubprocessBreadcrumbs((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const childCrumb = {
        session_id: res.subprocessSessionId,
        name: res.subprocessTitle || "Подпроцесс",
        element_id: res.targetElementId || elementId,
      };
      if (list.length === 0) {
        return [
          { session_id: String(sessionIdArg || "").trim(), name: draft?.title || "", element_id: elementId },
          childCrumb,
        ];
      }
      const lastSid = String(list[list.length - 1]?.session_id || "").trim();
      const childSid = String(childCrumb.session_id || "").trim();
      if (lastSid && childSid && lastSid === childSid) return list;
      return [...list, childCrumb];
    });

    const childXml = String(res.bpmnXml || "").trim();
    const childSid = String(res.subprocessSessionId || "").trim();
    if (childSid && childXml && bpmnXmlCacheRef.current) {
      bpmnXmlCacheRef.current.set(childSid, childXml);
    }

    setFocusElementId(res.targetElementId || "");
    pushSessionSelectionToUrl({
      projectId,
      sessionId: res.subprocessSessionId,
      parentSessionId: sessionIdArg,
      focusElementId: res.targetElementId || "",
      projectContext: projectRouteContext,
    });

    setDiscussionLinkedElementFocusIntent((prev) => {
      if (!prev || !res.targetElementId) return prev;
      const prevElementId = String(prev.elementId || prev.element_id || "").trim();
      const prevSid = String(prev.sid || "").trim();
      if (prevElementId !== String(res.targetElementId || "").trim()) return prev;
      if (prevSid && prevSid !== String(sessionIdArg || "").trim()) return prev;
      return { ...prev, sid: String(res.subprocessSessionId || "").trim(), drilldown: true };
    });

    openSession(res.subprocessSessionId);
  }, [bpmnStageRef, sessionCacheRef, bpmnXmlCacheRef, parentViewportSnapshotRef, setSubprocessBreadcrumbs, setFocusElementId, setDiscussionLinkedElementFocusIntent, pushSessionSelectionToUrl, projectRouteContext, projectId, openSession, draft, logNav]);

  const returnToParent = useCallback(async (sessionIdArg, options = {}) => {
    const res = await apiReturnToParent(sessionIdArg);
    if (!res.ok) {
      console.error("return failed", res.error);
      return;
    }
    const parentSid = String(res.parentSessionId || "").trim();
    const snapshot = parentSid ? parentViewportSnapshotRef.current.get(parentSid) : null;
    if (snapshot && setRestoreViewportSnapshot) {
      setRestoreViewportSnapshot(snapshot);
    }

    setSubprocessBreadcrumbs((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      if (list.length > 1) return list.slice(0, -1);
      return list;
    });

    setFocusElementId(res.elementIdInParent || "");

    if (options?.skipHistoryPush !== true) {
      pushSessionSelectionToUrl(
        {
          projectId,
          sessionId: res.parentSessionId,
          focusElementId: res.elementIdInParent || "",
          projectContext: projectRouteContext,
        },
        undefined,
        { replace: options?.replaceHistory === true },
      );
    }

    const cachedParentSession = parentSid ? sessionCacheRef.current?.get?.(parentSid) : null;
    openSession(res.parentSessionId, {
      source: options?.source || "subprocess_return",
      session: cachedParentSession || null,
    });
  }, [bpmnXmlCacheRef, parentViewportSnapshotRef, sessionCacheRef, setSubprocessBreadcrumbs, setFocusElementId, pushSessionSelectionToUrl, projectRouteContext, projectId, openSession, setRestoreViewportSnapshot]);

  return { navigateToSubprocess, returnToParent };
}
