// @vitest-environment jsdom
// fix/cold-entry-spa-tracker-seed (F4): единая точка сидирования
// casVersionTracker во ВСЕХ ветках входа openSession.
//
// Баг (audit/cold-entry-arrows-lost-after-f2, D1, stage 23.09, сессия
// 2ce96a6631): SPA-вход (клик «Открыть сессию») идёт через ветку
// options.session (openWorkspaceSession → openSession(sid, {session})) — seed
// трекера был только в ветке apiGetSession (:289) → первый ops-flush без
// инициализированного трекера → F2-fallback из versions-head (stale) →
// гарантированный 409 → баннер. Негативный контроль аудита: deeplink-вход
// (apiGetSession-ветка) сеет трекер от live dsv → 200.
//
// Контракт фикса:
//   - E1 (options.session, SPA «Открыть сессию» через openWorkspaceSession):
//     трекер засиден из diagram_state_version объекта сессии;
//   - E2 (options.useCache + sessionCacheRef hit): трекер засиден, apiGetSession
//     не дёргается;
//   - E3 (deeplink/apiGetSession-ветка): регресс — seed сохраняется, ровно один
//     apiGetSession, лишних versions-запросов нет;
//   - no-downgrade: валидный трекер свежее входящего (stale cache) не понижается;
//   - no-clobber: вход без dsv-поля не сбрасывает валидный трекер.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { useRef } from "react";

const apiMocks = vi.hoisted(() => ({
  apiGetSession: vi.fn(),
}));

vi.mock("../lib/api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    apiGetSession: apiMocks.apiGetSession,
  };
});

vi.mock("../features/process/bpmn/snapshots/bpmnSnapshots.js", () => ({
  getLatestBpmnSnapshot: async () => null,
  shouldAutoRestoreFromSnapshot: () => ({ restore: false, reason: "no_snapshot" }),
}));

vi.mock("../features/process/bpmn/save/opsOutbox/persistence/reconciliation.js", () => ({
  getOpsReconcileRuntime: () => null,
  resolveOnEntry: async () => ({ ok: true }),
}));

import useSessionActivationOrchestration from "./useSessionActivationOrchestration.js";
import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
  __resetForTests as resetCasVersionTracker,
} from "../lib/casVersionTracker.js";

const LIVE_DSV = 164;
const STALE_DSV = 159;

function freshSession(sid, dsv) {
  return {
    id: sid,
    session_id: sid,
    project_id: "p1",
    bpmn_xml: "<definitions/>",
    bpmn_xml_version: 3,
    version: 3,
    diagram_state_version: dsv,
  };
}

function buildDeps(overrides = {}) {
  return {
    projectId: "p1",
    setProjectId: () => {},
    projects: [],
    setProjects: () => {},
    draft: {},
    setDraftPersisted: () => {},
    resetDraft: () => {},
    setSessions: () => {},
    sessionNavNotice: null,
    setSessionNavNotice: () => {},
    setSnapshotRestoreNotice: () => {},
    refreshMeta: async () => true,
    markOk: () => {},
    markFail: () => {},
    logNav: () => {},
    logCreateTrace: () => {},
    logDraftTrace: () => {},
    logSnapshotTrace: () => {},
    ensureArray: (v) => (Array.isArray(v) ? v : []),
    ensureObject: (v) => (v && typeof v === "object" ? v : {}),
    ensureDraftShape: (sid) => ({ session_id: String(sid || "") }),
    sessionToDraft: (sid, s) => ({ session_id: sid, ...(s || {}) }),
    projectIdOf: (p) => p?.id || "",
    projectTitleOf: () => "",
    sessionIdOf: (s) => s?.id || s?.session_id || "",
    isLocalSessionId: () => false,
    fnv1aHex: () => "0",
    routeOrchestration: {
      initialSelectionRef: { current: null },
      requestedSessionIdRef: { current: "" },
      activeSessionIdRef: { current: "" },
      confirmedSessionIdRef: { current: "" },
      setRequestedSessionId: () => {},
      rememberActiveSessionId: () => {},
      rememberConfirmedSessionId: () => {},
      clearSessionRestoreMemory: () => {},
    },
    initialProjectSelectionConsumedRef: { current: true },
    suppressProjectAutoselectRef: { current: false },
    openSessionReqSeqRef: { current: 0 },
    projectWorkspaceHintsRef: { current: new Map() },
    createLocalSessionId: () => "",
    activeOrgId: "org1",
    sessionCacheRef: { current: new Map() },
    ...overrides,
  };
}

function Harness({ hookRef, deps }) {
  const stableDeps = useRef(null);
  if (!stableDeps.current) stableDeps.current = buildDeps(deps);
  const orchestration = useSessionActivationOrchestration(stableDeps.current);
  hookRef.current = orchestration;
  return null;
}

async function renderOrchestration(hookRef, deps = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Harness hookRef={hookRef} deps={deps} />);
  });
  return async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
}

describe("openSession tracker seeding (F4)", () => {
  beforeEach(() => {
    resetCasVersionTracker();
    apiMocks.apiGetSession.mockReset();
  });

  it("E1 SPA «Открыть сессию» (openWorkspaceSession → options.session-ветка) сидит трекер", async () => {
    const sid = "s_spa_e1";
    apiMocks.apiGetSession.mockResolvedValue({ ok: true, status: 200, session: freshSession(sid, LIVE_DSV) });
    const hookRef = { current: null };
    const unmount = await renderOrchestration(hookRef);

    await act(async () => {
      await hookRef.current.openWorkspaceSession({ id: sid, project_id: "p1" }, { source: "workspace_dashboard_session_action" });
    });

    expect(getTrackedDiagramStateVersion(sid)).toBe(LIVE_DSV);
    await unmount();
  });

  it("E1-голый options.session (breadcrumb-путь) тоже сидит трекер", async () => {
    const sid = "s_breadcrumb_e1";
    const hookRef = { current: null };
    const unmount = await renderOrchestration(hookRef);

    await act(async () => {
      await hookRef.current.openSession(sid, {
        source: "breadcrumb_navigation",
        session: freshSession(sid, LIVE_DSV),
      });
    });

    expect(getTrackedDiagramStateVersion(sid)).toBe(LIVE_DSV);
    await unmount();
  });

  it("E2 cache-ветка сидит трекер и не дёргает apiGetSession", async () => {
    const sid = "s_cache_e2";
    const sessionCacheRef = { current: new Map([[sid, freshSession(sid, LIVE_DSV)]]) };
    const hookRef = { current: null };
    const unmount = await renderOrchestration(hookRef, { sessionCacheRef });

    await act(async () => {
      await hookRef.current.openSession(sid, { source: "manual_select", useCache: true });
    });

    expect(getTrackedDiagramStateVersion(sid)).toBe(LIVE_DSV);
    expect(apiMocks.apiGetSession).not.toHaveBeenCalled();
    await unmount();
  });

  it("E3 deeplink-ветка (apiGetSession) — регресс: seed сохраняется, ровно один запрос", async () => {
    const sid = "s_deeplink_e3";
    apiMocks.apiGetSession.mockResolvedValue({ ok: true, status: 200, session: freshSession(sid, LIVE_DSV) });
    const hookRef = { current: null };
    const unmount = await renderOrchestration(hookRef);

    await act(async () => {
      await hookRef.current.openSession(sid, { source: "url_restore" });
    });

    expect(getTrackedDiagramStateVersion(sid)).toBe(LIVE_DSV);
    expect(apiMocks.apiGetSession).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it("no-downgrade: валидный трекер свежее stale-объекта не понижается", async () => {
    const sid = "s_nodowngrade";
    setTrackedDiagramStateVersion(sid, LIVE_DSV);
    const hookRef = { current: null };
    const unmount = await renderOrchestration(hookRef);

    await act(async () => {
      await hookRef.current.openSession(sid, {
        source: "breadcrumb_navigation",
        session: freshSession(sid, STALE_DSV),
      });
    });

    expect(getTrackedDiagramStateVersion(sid)).toBe(LIVE_DSV);
    await unmount();
  });

  it("no-clobber: вход без dsv-поля не сбрасывает валидный трекер", async () => {
    const sid = "s_noclobber";
    setTrackedDiagramStateVersion(sid, LIVE_DSV);
    const hookRef = { current: null };
    const unmount = await renderOrchestration(hookRef);

    await act(async () => {
      await hookRef.current.openSession(sid, {
        source: "breadcrumb_navigation",
        session: { id: sid, project_id: "p1", bpmn_xml: "<definitions/>" },
      });
    });

    expect(getTrackedDiagramStateVersion(sid)).toBe(LIVE_DSV);
    await unmount();
  });
});
