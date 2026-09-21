// ---------------------------------------------------------------------------
// Positional snapshot helpers (createBpmnRuntime снапшот-слой).
// Вынесены из createBpmnRuntime.js (fix/canvas-move-di-desync-409-tracker S1)
// ради прямой unit-тестируемости enrichment: функции чистые, instance рантайма
// не нужен. Поведение — байт-в-байт перенос, изменений семантики нет.
// ---------------------------------------------------------------------------

function asText(value) {
  return String(value || "");
}

function snapshotPoint(value) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function snapshotBounds(value) {
  if (!value || typeof value !== "object") return null;
  return {
    x: Number(value.x) || 0,
    y: Number(value.y) || 0,
    width: Number(value.width) || 0,
    height: Number(value.height) || 0,
  };
}

function snapshotWaypoints(value) {
  if (!Array.isArray(value)) return null;
  const pts = value.map((wp) => snapshotPoint(wp)).filter(Boolean);
  return pts.length === value.length && pts.length > 0 ? pts.map((p) => [p.x, p.y]) : null;
}

function snapshotElementRef(ref) {
  if (!ref || typeof ref !== "object") return null;
  const out = { id: asText(ref.id) };
  if (!out.id) return null;
  const boType = asText(ref?.businessObject?.$type);
  out.type = boType || asText(ref.type);
  const bounds = snapshotBounds(ref);
  if (bounds) out.bounds = bounds;
  const name = asText(ref?.businessObject?.$type ? ref.businessObject.name : ref.name);
  if (name) out.name = name;
  // connection.create wire-op требует waypoints на сервере: тащим маршрут
  // соединения на ref, чтобы сериализованный контекст его не терял.
  const refWaypoints = snapshotWaypoints(ref.waypoints);
  if (refWaypoints) out.waypoints = refWaypoints;
  // S7 (undo-completeness): recreate-пayload для compensating create-op
  // (undo delete → shape.create/connection.create с сохранением id).
  // parentId — всегда (нужен recreate-опам); endpoints — для connection-
  // refs; text — для textAnnotation (дочерний <bpmn:text>, golden S4).
  const parentId = asText(ref?.parent?.id);
  if (parentId) out.parentId = parentId;
  const sourceId = asText(ref?.source?.id);
  const targetId = asText(ref?.target?.id);
  if (sourceId) out.sourceId = sourceId;
  if (targetId) out.targetId = targetId;
  const textValue = ref?.businessObject && "text" in ref.businessObject
    ? ref.businessObject.text
    : (typeof ref?.text === "string" ? ref.text : "");
  if (asText(textValue)) out.text = asText(textValue);
  return out;
}

// S3 (op wave A): affected-connections enrichment для positional-батчей.
// Вложенные connection-обновления diagram-js «тихие» (commandStack.changed
// фаерится только на outermost action — _popAction), поэтому рантайн
// доснимает финальные waypoints сам: elements.move — closure.allConnections
// (fallback — incoming/outgoing shapes), spaceTool — инцидентные связи
// moving∪resizing, shape.move/shape.resize (S1) — инцидентные связи шейпа.
// На undo-changed снапшот снимается с post-undo состояния — captured
// waypoints корректны для обоих направлений.
function collectIncidentConnections(rawShapes) {
  const seen = new Map();
  for (const shape of rawShapes) {
    for (const list of [shape?.incoming, shape?.outgoing]) {
      if (!Array.isArray(list)) continue;
      for (const conn of list) {
        if (conn && asText(conn.id) && !seen.has(conn.id)) seen.set(conn.id, conn);
      }
    }
  }
  return [...seen.values()];
}

// S1 (fix/canvas-move-di-desync-409-tracker): одиночный drag фаерит
// shape.move, resize — shape.resize; без enrichment серверный DI стрелок
// устаревает (F1/F2 аудита canvas-move-di-desync-422) → растянутые стрелки
// после reload. Паритет с elements.move/spaceTool: те же инцидентные связи
// с актуальными (post-action / post-undo) waypoints.
function enrichPositionalSnapshot(commandRaw, rawContext, snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  const command = asText(commandRaw);
  let connections = null;
  if (command === "elements.move") {
    const closureConns = rawContext?.closure?.allConnections;
    if (closureConns && typeof closureConns === "object") {
      connections = Object.values(closureConns);
    } else {
      connections = collectIncidentConnections(
        Array.isArray(rawContext?.shapes) ? rawContext.shapes : [],
      );
    }
  } else if (command === "spaceTool") {
    connections = collectIncidentConnections([
      ...(Array.isArray(rawContext?.movingShapes) ? rawContext.movingShapes : []),
      ...(Array.isArray(rawContext?.resizingShapes) ? rawContext.resizingShapes : []),
    ]);
  } else if (command === "shape.move" || command === "shape.resize") {
    connections = collectIncidentConnections(
      rawContext?.shape ? [rawContext.shape] : [],
    );
  }
  if (!connections || connections.length === 0) return;
  const snapshotConns = connections
    .map((ref) => snapshotElementRef(ref))
    .filter(Boolean);
  if (snapshotConns.length > 0) {
    snapshot.affectedConnections = snapshotConns;
  }
}

export {
  snapshotPoint,
  snapshotBounds,
  snapshotWaypoints,
  snapshotElementRef,
  collectIncidentConnections,
  enrichPositionalSnapshot,
};
