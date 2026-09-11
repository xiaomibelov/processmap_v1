// RED-тесты контура fix/canvas-editing-stability (этап 1, TDD red).
//
// Контракт версионирования сохранения (продолжение пп. 8–11 из model-diff.test.mjs):
//   12a. Save pipeline берёт base из casVersionTracker В МОМЕНТ ОТПРАВКИ —
//        даже если внешний getter/option устарели (устаревшая React-стейт база).
//   12b. После разрешения конфликта resolveConflict(sid, "overwrite")
//        getTrackedDiagramStateVersion возвращает серверную версию — повторный
//        save использует её и НЕ получает повторный 409 на той же базе.
//   13. Метаданные/presence: PATCH с ключами title/notes/roles/status и
//       presence-heartbeat НЕ проходят diagram-CAS gate и НЕ выставляют
//       dirty-флаг диаграммы. Пин поведения: gate-модуль hasDiagramPatchKeys
//       пока ОТСУТСТВУЕТ (появится в этапе 2) — тест 13 падает с
//       ERR_MODULE_NOT_FOUND, это и есть RED (как modelDiff.js в прошлом контуре).
//
// Запуск (host без node):
//   docker run --rm -v <worktree>/frontend:/app -w /app node:20 \
//     node --test src/features/session/saveVersion.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { saveCoordinator } from "./saveCoordinator.js";
import {
  __resetForTests as resetCasVersionTracker,
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
} from "../../lib/casVersionTracker.js";
import {
  resolveSessionPatchBaseAtSendTime,
  enqueueSessionPatchCasWrite,
} from "../process/stage/utils/sessionPatchCasCoordinator.js";
import { saveBpmnState } from "../process/save/saveBpmnState.js";

test.beforeEach(() => {
  saveCoordinator.clearSession();
  resetCasVersionTracker();
});

// ---------------------------------------------------------------------------
// 12a. base из трекера в момент отправки (getter/option устарели)
// ---------------------------------------------------------------------------

test("12a: xml save pipeline takes base from casVersionTracker at send time even when getter/option are stale", async () => {
  const sid = "sid_12a_xml";
  // Трекер знает свежую базу (например, после гидратации из PUT /bpmn ack),
  // а внешний getter и option зафиксировали устаревшее значение до правки.
  setTrackedDiagramStateVersion(sid, 5);

  const seenBases = [];
  const result = await saveBpmnState({
    operation: "session_save",
    sessionId: sid,
    xml: "<bpmn:definitions xmlns:bpmn='http://www.omg.org/spec/BPMN/20100524/MODEL' id='D_12a' />",
    baseDiagramStateVersion: 2, // stale option
    getBaseDiagramStateVersion: () => 3, // stale getter
    apiPutBpmnXml: async (_sid, _xml, opts) => {
      seenBases.push(Number(opts?.baseDiagramStateVersion));
      return { ok: true, diagramStateVersion: 6 };
    },
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(
    seenBases,
    [5],
    `transport must receive tracked base 5, got: ${JSON.stringify(seenBases)}`,
  );
});

test("12a: session-PATCH pipeline prefers tracked base over stale getter/fallback at send time", async () => {
  const sid = "sid_12a_patch";
  setTrackedDiagramStateVersion(sid, 9);

  const staleGetter = () => 4;
  assert.equal(
    resolveSessionPatchBaseAtSendTime({
      sessionId: sid,
      getBaseDiagramStateVersion: staleGetter,
      fallbackBaseDiagramStateVersion: 7,
    }),
    9,
    "tracked version must win over stale getter and fallback",
  );

  // Сквозная проверка enqueue: transport видит base из трекера, а не из patch.
  const seenPatchBodies = [];
  const ack = await enqueueSessionPatchCasWrite({
    sessionId: sid,
    patch: { notes: "n", base_diagram_state_version: 4 },
    apiPatchSession: async (_sid, patchBody) => {
      seenPatchBodies.push({ ...patchBody });
      return { ok: true, session: { id: sid, diagram_state_version: 10 } };
    },
    getBaseDiagramStateVersion: staleGetter,
  });

  assert.equal(ack.ok, true, JSON.stringify(ack));
  assert.deepEqual(
    seenPatchBodies.map((body) => Number(body.base_diagram_state_version)),
    [9],
    `PATCH transport must receive tracked base 9, got: ${JSON.stringify(seenPatchBodies)}`,
  );
});

// ---------------------------------------------------------------------------
// 12b. после resolveConflict(sid, "overwrite") повторный save без повторного 409
// ---------------------------------------------------------------------------

test("12b: after resolveConflict(sid, \"overwrite\") tracked base adopts server version and retry save does not 409", async () => {
  const sid = "sid_12b";
  setTrackedDiagramStateVersion(sid, 3);

  let calls = 0;
  saveCoordinator.registerPipeline("test_12b_xml", {
    getBaseVersion: (sessionId) => getTrackedDiagramStateVersion(sessionId),
    transport: async (_sessionId, payload) => {
      calls += 1;
      const base = Number(payload?.base_diagram_state_version);
      if (calls === 1) {
        // Первая отправка со stale base=3 → сервер уже на 7.
        assert.equal(base, 3);
        return {
          ok: false,
          status: 409,
          error: "DIAGRAM_STATE_CONFLICT",
          data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 7 } },
        };
      }
      // Повторная отправка: если base не синхронизирован с сервером (7),
      // сервер снова ответил бы 409 — моделируем это как провал теста.
      if (base !== 7) {
        return {
          ok: false,
          status: 409,
          error: `DIAGRAM_STATE_CONFLICT: retry used stale base ${base}`,
          data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 7 } },
        };
      }
      return { ok: true, diagram_state_version: 8 };
    },
    debounceMs: 0,
    retryCount: 0,
  });

  const first = await saveCoordinator.execute("test_12b_xml", { sessionId: sid });
  assert.equal(first.ok, false);
  assert.equal(first.status, 409);
  assert.ok(saveCoordinator.getConflict(sid), "conflict gate must be armed after real 409");

  const resolution = saveCoordinator.resolveConflict(sid, "overwrite");
  assert.equal(resolution.ok, true, JSON.stringify(resolution));
  assert.equal(
    getTrackedDiagramStateVersion(sid),
    7,
    "tracked base must adopt the server version after explicit overwrite ack",
  );

  const second = await saveCoordinator.execute("test_12b_xml", { sessionId: sid });
  assert.equal(
    second.ok,
    true,
    `retry save after overwrite must succeed without a second 409, got: ${JSON.stringify(second)}`,
  );
  assert.equal(calls, 2);
});

// ---------------------------------------------------------------------------
// 13. hasDiagramPatchKeys gate: метаданные/presence НЕ diagram-CAS, НЕ dirty.
//     Модуля ./patchKeys.js пока нет — динамический import падает с
//     ERR_MODULE_NOT_FOUND: это и есть ожидаемый RED этапа 1.
// ---------------------------------------------------------------------------

test("13: metadata-only PATCH keys (title/notes/roles/status) bypass the diagram CAS gate", async () => {
  const { hasDiagramPatchKeys } = await import("./patchKeys.js");

  assert.equal(
    hasDiagramPatchKeys({ title: "Новое название" }),
    false,
    "title is metadata, not a diagram patch",
  );
  assert.equal(hasDiagramPatchKeys({ notes: "черновик" }), false);
  assert.equal(hasDiagramPatchKeys({ roles: ["Оператор"], start_role: "Оператор" }), false);
  assert.equal(hasDiagramPatchKeys({ status: "in_progress" }), false);
  assert.equal(
    hasDiagramPatchKeys({ title: "x", status: "done", notes: "n" }),
    false,
    "combined metadata keys are still metadata-only",
  );
});

test("13: diagram keys are gated as diagram patches", async () => {
  const { hasDiagramPatchKeys } = await import("./patchKeys.js");

  assert.equal(hasDiagramPatchKeys({ nodes: [{ id: "n1" }] }), true, "nodes bump diagram truth");
  assert.equal(hasDiagramPatchKeys({ edges: [{ id: "e1" }] }), true, "edges bump diagram truth");
  assert.equal(hasDiagramPatchKeys({ interview: { steps: [] } }), true, "interview bumps diagram truth");
  assert.equal(hasDiagramPatchKeys({ bpmn_xml: "<xml/>" }), true, "explicit bpmn_xml is a diagram patch");
});

test("13: presence heartbeat payload bypasses the diagram CAS gate (Redis-only, version untouched)", async () => {
  const { hasDiagramPatchKeys } = await import("./patchKeys.js");

  // Формат тела apiTouchSessionPresence (lib/api.js: apiTouchSessionPresence):
  // POST /api/sessions/{id}/presence { client_id, surface }.
  assert.equal(
    hasDiagramPatchKeys({ client_id: "ctx-b", surface: "process_stage" }),
    false,
    "presence heartbeat must not pass the diagram CAS gate",
  );
});

test("13: classification exposes dirty-flag routing — metadata/presence must not mark the diagram dirty", async () => {
  const { classifySessionPatch } = await import("./patchKeys.js");

  const metadata = classifySessionPatch({ title: "x", notes: "n" });
  assert.equal(metadata.isDiagramPatch, false);
  assert.equal(metadata.marksDiagramDirty, false, "metadata PATCH must not set the diagram dirty flag");

  const presence = classifySessionPatch({ client_id: "ctx-b", surface: "process_stage" });
  assert.equal(presence.isDiagramPatch, false);
  assert.equal(presence.marksDiagramDirty, false, "presence heartbeat must not set the diagram dirty flag");

  const diagram = classifySessionPatch({ nodes: [{ id: "n1" }] });
  assert.equal(diagram.isDiagramPatch, true);
  assert.equal(diagram.marksDiagramDirty, true);
});
