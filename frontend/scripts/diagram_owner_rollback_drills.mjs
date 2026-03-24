import {
  buildDiagramJazzDocumentIdentity,
  createDiagramJazzContractDraftAdapter,
  resolveDiagramJazzContractDraftActivation,
} from "../src/features/process/bpmn/jazz/diagramJazzContractDraft.js";
import {
  ownerPathBlockReason,
  resolveDiagramOwnerCutoverState,
} from "../src/features/process/bpmn/jazz/diagramOwnerCutoverContract.js";

function toText(value) {
  return String(value || "").trim();
}

function assertCheck(condition, message, failures) {
  if (!condition) failures.push(message);
}

function baseIdentity(seed) {
  const suffix = `${seed}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return buildDiagramJazzDocumentIdentity({
    orgId: `drill_org_${suffix}`,
    projectId: `drill_project_${suffix}`,
    sessionId: `drill_session_${suffix}`,
  });
}

function baseEnvJazzReady(identity = null) {
  const env = {
    VITE_DIAGRAM_OWNER_STATE: "jazz_owner",
    VITE_DIAGRAM_JAZZ_OWNER_SWITCH_APPROVED: "1",
    VITE_DIAGRAM_JAZZ_CUTOVER_ENABLE: "1",
    VITE_DIAGRAM_JAZZ_CONTRACT_DRAFT: "1",
    VITE_DIAGRAM_JAZZ_ADAPTER: "jazz",
    VITE_DIAGRAM_JAZZ_PEER: "zeebe",
    VITE_DIAGRAM_JAZZ_BACKEND_API_READY: "1",
    VITE_DIAGRAM_JAZZ_ROLLBACK_READY: "1",
    VITE_DIAGRAM_JAZZ_OBSERVABILITY_READY: "1",
    VITE_DIAGRAM_JAZZ_CONTRACT_VERSION: "diagram-jazz-backend-contract-draft-v1",
    VITE_DIAGRAM_JAZZ_REQUIRED_CONTRACT_VERSION: "diagram-jazz-backend-contract-draft-v1",
  };
  const scopeId = toText(identity?.scopeId || "");
  if (scopeId) env.VITE_DIAGRAM_JAZZ_SCOPE_ALLOWLIST = scopeId;
  return env;
}

function markerEvents(markers) {
  return markers.map((item) => toText(item.event));
}

function createHarness({ env, identity, apiRead, apiWrite }) {
  const markers = [];
  const activation = resolveDiagramJazzContractDraftActivation({
    envOverride: env,
    scopeOverride: {
      orgId: identity?.orgId || "",
      projectId: identity?.projectId || "",
      sessionId: identity?.sessionId || "",
      scopeId: identity?.scopeId || "",
    },
  });
  const adapter = createDiagramJazzContractDraftAdapter({
    activation,
    identity,
    apiGetDiagramJazzXml: apiRead,
    apiPutDiagramJazzXml: apiWrite,
    onTrace: (event, payload = {}) => markers.push({ event, payload }),
  });
  return { activation, adapter, markers };
}

async function scenario01RequestedJazzBeforeActivationThenRollback() {
  const failures = [];
  const identity = baseIdentity("s01");

  const envCutover = {
    ...baseEnvJazzReady(identity),
    VITE_DIAGRAM_JAZZ_OWNER_SWITCH_APPROVED: "0",
  };
  const stateCutover = resolveDiagramOwnerCutoverState({
    envOverride: envCutover,
    scopeOverride: {
      orgId: identity.orgId,
      projectId: identity.projectId,
      sessionId: identity.sessionId,
      scopeId: identity.scopeId,
    },
  });
  assertCheck(stateCutover.effectiveState === "cutover_blocked", "s01: expected cutover_blocked before rollback", failures);
  assertCheck(stateCutover.diagramOwner === "legacy_owner", "s01: owner must be legacy before rollback", failures);

  const harnessBefore = createHarness({
    env: envCutover,
    identity,
    apiRead: async () => ({ ok: true, status: 200, xml: "<bpmn:definitions/>", ack: {} }),
    apiWrite: async () => ({ ok: true, status: 200, ack: {} }),
  });
  const readBefore = await harnessBefore.adapter.readDurableXml({ sessionId: identity.sessionId });
  assertCheck(readBefore.ok === false, "s01: expected blocked read before rollback", failures);
  assertCheck(
    toText(readBefore.blocked || readBefore.errorCode) === "diagram_cutover_blocked_owner_switch_not_approved",
    "s01: expected blocked reason owner_switch_not_approved",
    failures,
  );

  const envRollback = {
    ...envCutover,
    VITE_DIAGRAM_OWNER_STATE: "rollback_to_legacy",
    VITE_DIAGRAM_JAZZ_ROLLBACK_READY: "1",
    VITE_DIAGRAM_JAZZ_ROLLBACK_TRIGGER: "1",
  };
  const stateRollback = resolveDiagramOwnerCutoverState({
    envOverride: envRollback,
    scopeOverride: {
      orgId: identity.orgId,
      projectId: identity.projectId,
      sessionId: identity.sessionId,
      scopeId: identity.scopeId,
    },
  });
  assertCheck(stateRollback.effectiveState === "rollback_to_legacy", "s01: expected rollback_to_legacy", failures);
  assertCheck(stateRollback.diagramOwner === "legacy_owner", "s01: rollback must keep owner legacy", failures);
  assertCheck(ownerPathBlockReason(stateRollback, "jazz") === "diagram_cutover_rollback_active", "s01: expected rollback lock for jazz path", failures);

  const harnessAfter = createHarness({
    env: envRollback,
    identity,
    apiRead: async () => ({ ok: true, status: 200, xml: "<bpmn:definitions/>", ack: {} }),
    apiWrite: async () => ({ ok: true, status: 200, ack: {} }),
  });
  const readAfter = await harnessAfter.adapter.readDurableXml({ sessionId: identity.sessionId });
  assertCheck(readAfter.ok === false, "s01: expected blocked read after rollback", failures);
  assertCheck(
    toText(readAfter.blocked || readAfter.errorCode) === "diagram_cutover_rollback_active",
    "s01: expected rollback_active reason",
    failures,
  );
  assertCheck(markerEvents(harnessAfter.markers).includes("diagram_cutover_rollback"), "s01: expected cutover_rollback marker", failures);

  return {
    scenario: "s01_requested_jazz_before_activation_then_rollback",
    passed: failures.length === 0,
    failures,
    detail: {
      stateBefore: stateCutover,
      stateAfter: stateRollback,
      readBefore,
      readAfter,
      markersBefore: markerEvents(harnessBefore.markers),
      markersAfter: markerEvents(harnessAfter.markers),
    },
  };
}

async function scenario02RollbackWhenCutoverBlocked() {
  const failures = [];
  const identity = baseIdentity("s02");

  const envBlocked = {
    ...baseEnvJazzReady(identity),
    VITE_DIAGRAM_JAZZ_BACKEND_API_READY: "0",
  };
  const stateBlocked = resolveDiagramOwnerCutoverState({
    envOverride: envBlocked,
    scopeOverride: {
      orgId: identity.orgId,
      projectId: identity.projectId,
      sessionId: identity.sessionId,
      scopeId: identity.scopeId,
    },
  });
  assertCheck(stateBlocked.effectiveState === "cutover_blocked", "s02: expected cutover_blocked", failures);
  assertCheck(stateBlocked.blockedReason === "diagram_cutover_blocked_api_not_ready", "s02: expected api_not_ready reason", failures);

  const envRollback = {
    ...envBlocked,
    VITE_DIAGRAM_OWNER_STATE: "rollback_to_legacy",
    VITE_DIAGRAM_JAZZ_ROLLBACK_READY: "1",
    VITE_DIAGRAM_JAZZ_ROLLBACK_TRIGGER: "1",
  };
  const harness = createHarness({
    env: envRollback,
    identity,
    apiRead: async () => ({ ok: true, status: 200, xml: "<bpmn:definitions/>", ack: {} }),
    apiWrite: async () => ({ ok: true, status: 200, ack: {} }),
  });
  const out = await harness.adapter.writeDurableXml({ sessionId: identity.sessionId, xml: "<bpmn:definitions/>" });
  assertCheck(out.ok === false, "s02: expected blocked write", failures);
  assertCheck(
    toText(out.blocked || out.errorCode) === "diagram_cutover_rollback_active",
    "s02: expected rollback_active reason",
    failures,
  );
  const events = markerEvents(harness.markers);
  assertCheck(events.includes("diagram_jazz_fe_blocked"), "s02: expected FE blocked marker", failures);
  assertCheck(events.includes("diagram_cutover_rollback"), "s02: expected rollback marker", failures);

  return {
    scenario: "s02_rollback_when_cutover_blocked",
    passed: failures.length === 0,
    failures,
    detail: {
      stateBlocked,
      stateRollback: resolveDiagramOwnerCutoverState({
        envOverride: envRollback,
        scopeOverride: {
          orgId: identity.orgId,
          projectId: identity.projectId,
          sessionId: identity.sessionId,
          scopeId: identity.scopeId,
        },
      }),
      write: out,
      markers: events,
    },
  };
}

async function scenario03ExplicitRollbackTrigger() {
  const failures = [];
  const identity = baseIdentity("s03");
  const envRollback = {
    ...baseEnvJazzReady(identity),
    VITE_DIAGRAM_OWNER_STATE: "rollback_to_legacy",
    VITE_DIAGRAM_JAZZ_ROLLBACK_READY: "1",
    VITE_DIAGRAM_JAZZ_ROLLBACK_TRIGGER: "1",
  };
  const state = resolveDiagramOwnerCutoverState({
    envOverride: envRollback,
    scopeOverride: {
      orgId: identity.orgId,
      projectId: identity.projectId,
      sessionId: identity.sessionId,
      scopeId: identity.scopeId,
    },
  });
  assertCheck(state.effectiveState === "rollback_to_legacy", "s03: expected rollback state", failures);
  assertCheck(state.diagramOwner === "legacy_owner", "s03: expected legacy owner", failures);

  const harness = createHarness({
    env: envRollback,
    identity,
    apiRead: async () => ({ ok: true, status: 200, xml: "<bpmn:definitions/>", ack: {} }),
    apiWrite: async () => ({ ok: true, status: 200, ack: {} }),
  });
  const out = await harness.adapter.readDurableXml({ sessionId: identity.sessionId });
  assertCheck(out.ok === false, "s03: expected blocked read", failures);
  assertCheck(
    toText(out.blocked || out.errorCode) === "diagram_cutover_rollback_active",
    "s03: expected rollback_active reason",
    failures,
  );

  return {
    scenario: "s03_explicit_rollback_trigger",
    passed: failures.length === 0,
    failures,
    detail: {
      state,
      read: out,
      markers: markerEvents(harness.markers),
    },
  };
}

async function scenario04RollbackAfterWriteConflict() {
  const failures = [];
  const identity = baseIdentity("s04");
  const envJazz = baseEnvJazzReady(identity);

  const harnessConflict = createHarness({
    env: envJazz,
    identity,
    apiRead: async () => ({ ok: true, status: 200, xml: "<bpmn:definitions/>", ack: { stored_revision: 1, stored_fingerprint: "abc" } }),
    apiWrite: async () => ({
      ok: false,
      status: 409,
      errorCode: "diagram_jazz_revision_conflict",
      blocked: "diagram_jazz_revision_conflict",
      error: "revision conflict",
      traceId: "api-trace-s04",
      correlationId: "corr-s04",
      traceLayer: "api",
      traceOperation: "write",
      traceContractVersion: "diagram-trace-contract-v1",
    }),
  });
  const conflict = await harnessConflict.adapter.writeDurableXml({ sessionId: identity.sessionId, xml: "<bpmn:definitions/>" });
  assertCheck(conflict.ok === false, "s04: expected write conflict", failures);
  assertCheck(
    toText(conflict.errorCode || conflict.blocked) === "diagram_jazz_revision_conflict",
    "s04: expected revision conflict reason",
    failures,
  );
  assertCheck(markerEvents(harnessConflict.markers).includes("diagram_jazz_fe_conflict"), "s04: expected FE conflict marker", failures);

  const envRollback = {
    ...envJazz,
    VITE_DIAGRAM_OWNER_STATE: "rollback_to_legacy",
    VITE_DIAGRAM_JAZZ_ROLLBACK_READY: "1",
    VITE_DIAGRAM_JAZZ_ROLLBACK_TRIGGER: "1",
  };
  const harnessRollback = createHarness({
    env: envRollback,
    identity,
    apiRead: async () => ({ ok: true, status: 200, xml: "<bpmn:definitions/>", ack: {} }),
    apiWrite: async () => ({ ok: true, status: 200, ack: {} }),
  });
  const after = await harnessRollback.adapter.writeDurableXml({ sessionId: identity.sessionId, xml: "<bpmn:definitions/>" });
  assertCheck(after.ok === false, "s04: expected blocked write after rollback", failures);
  assertCheck(
    toText(after.errorCode || after.blocked) === "diagram_cutover_rollback_active",
    "s04: expected rollback_active after conflict",
    failures,
  );

  return {
    scenario: "s04_rollback_after_write_conflict",
    passed: failures.length === 0,
    failures,
    detail: {
      conflict,
      afterRollback: after,
      markersConflict: markerEvents(harnessConflict.markers),
      markersAfter: markerEvents(harnessRollback.markers),
    },
  };
}

async function scenario05RollbackAfterProviderMismatchOrInvariant() {
  const failures = [];
  const identity = baseIdentity("s05");
  const envJazz = baseEnvJazzReady(identity);

  const harnessMismatch = createHarness({
    env: envJazz,
    identity,
    apiRead: async () => ({
      ok: false,
      status: 409,
      errorCode: "diagram_jazz_provider_mismatch",
      blocked: "diagram_jazz_provider_mismatch",
      error: "provider mismatch",
      traceId: "api-trace-s05",
      correlationId: "corr-s05",
      traceLayer: "api",
      traceOperation: "read",
      traceContractVersion: "diagram-trace-contract-v1",
    }),
    apiWrite: async () => ({ ok: true, status: 200, ack: {} }),
  });
  const mismatch = await harnessMismatch.adapter.readDurableXml({ sessionId: identity.sessionId });
  assertCheck(mismatch.ok === false, "s05: expected mismatch", failures);
  assertCheck(
    toText(mismatch.errorCode || mismatch.blocked) === "diagram_jazz_provider_mismatch",
    "s05: expected provider mismatch reason",
    failures,
  );

  const envRollback = {
    ...envJazz,
    VITE_DIAGRAM_OWNER_STATE: "rollback_to_legacy",
    VITE_DIAGRAM_JAZZ_ROLLBACK_READY: "1",
    VITE_DIAGRAM_JAZZ_ROLLBACK_TRIGGER: "1",
  };
  const harnessRollback = createHarness({
    env: envRollback,
    identity,
    apiRead: async () => ({ ok: true, status: 200, xml: "<bpmn:definitions/>", ack: {} }),
    apiWrite: async () => ({ ok: true, status: 200, ack: {} }),
  });
  const after = await harnessRollback.adapter.readDurableXml({ sessionId: identity.sessionId });
  assertCheck(after.ok === false, "s05: expected blocked read after rollback", failures);
  assertCheck(
    toText(after.blocked || after.errorCode) === "diagram_cutover_rollback_active",
    "s05: expected rollback_active after mismatch",
    failures,
  );

  return {
    scenario: "s05_rollback_after_provider_mismatch_or_invariant",
    passed: failures.length === 0,
    failures,
    detail: {
      mismatch,
      afterRollback: after,
      markersMismatch: markerEvents(harnessMismatch.markers),
      markersAfter: markerEvents(harnessRollback.markers),
    },
  };
}

async function scenario06RollbackMissingPrerequisiteFailClosed() {
  const failures = [];
  const identity = baseIdentity("s06");
  const env = {
    ...baseEnvJazzReady(identity),
    VITE_DIAGRAM_OWNER_STATE: "rollback_to_legacy",
    VITE_DIAGRAM_JAZZ_ROLLBACK_READY: "1",
    VITE_DIAGRAM_JAZZ_ROLLBACK_TRIGGER: "0",
  };
  const state = resolveDiagramOwnerCutoverState({
    envOverride: env,
    scopeOverride: {
      orgId: identity.orgId,
      projectId: identity.projectId,
      sessionId: identity.sessionId,
      scopeId: identity.scopeId,
    },
  });
  assertCheck(state.effectiveState === "cutover_blocked", "s06: expected cutover_blocked", failures);
  assertCheck(state.blockedReason === "diagram_cutover_rollback_trigger_missing", "s06: expected rollback_trigger_missing", failures);

  const harness = createHarness({
    env,
    identity,
    apiRead: async () => ({ ok: true, status: 200, xml: "<bpmn:definitions/>", ack: {} }),
    apiWrite: async () => ({ ok: true, status: 200, ack: {} }),
  });
  const out = await harness.adapter.readDurableXml({ sessionId: identity.sessionId });
  assertCheck(out.ok === false, "s06: expected blocked read", failures);
  assertCheck(
    toText(out.blocked || out.errorCode) === "diagram_cutover_rollback_trigger_missing",
    "s06: expected fail-closed reason",
    failures,
  );

  return {
    scenario: "s06_rollback_missing_prerequisite_fail_closed",
    passed: failures.length === 0,
    failures,
    detail: {
      state,
      read: out,
      markers: markerEvents(harness.markers),
    },
  };
}

async function runAll() {
  const scenarios = [
    scenario01RequestedJazzBeforeActivationThenRollback,
    scenario02RollbackWhenCutoverBlocked,
    scenario03ExplicitRollbackTrigger,
    scenario04RollbackAfterWriteConflict,
    scenario05RollbackAfterProviderMismatchOrInvariant,
    scenario06RollbackMissingPrerequisiteFailClosed,
  ];
  const results = [];
  for (const run of scenarios) {
    results.push(await run());
  }
  return {
    ok: results.every((item) => item.passed),
    count: results.length,
    passed: results.filter((item) => item.passed).length,
    failed: results.filter((item) => !item.passed).length,
    results,
  };
}

const pretty = process.argv.includes("--pretty");
const summary = await runAll();
if (pretty) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}
process.exit(summary.ok ? 0 : 1);
