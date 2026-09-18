// commandToOps — маппинг commandStack.command → op[] по whitelist PLAN §3.1
// (контур feature/async-save-pipeline-step1).
//
// Единая точка наблюдения — commandStack.changed (createBpmnRuntime.js:201);
// mutation gateway подтверждён grep'ом baseline: все production-мутации идут
// через modeling-API → commandStack. Дескриптор команды —
// { command, action: "execute"|"undo"|"redo", context, source } — формируется
// рантайм-каскадом (payload расширен полями action/commandContext).
//
// Контракты:
//  - replay-эхо: context.__pmOpSource === "replay" → команда пропускается
//    полностью (ни одна replay-команда не становится op; счётчики не растут);
//  - вне whitelist → needsFullSave (существующий полный путь сохранения);
//  - undo → inverse-payload (compensating-op); step2 (наследие п.6): undo
//    create → compensating delete-op, undo reconnect → старые source/target;
//  - connection.reconnect/reconnectStart/reconnectEnd → одна нормализованная
//    op connection.reconnect {connectionId, source, target};
//  - coverage: window.__PM_OPS_COVERAGE__ = {total, mapped, fullSave}
//    инкрементится на каждую немuted команду (фундамент метрики ≥95%).

function asText(value) {
  return String(value || "").trim();
}

function elementIdOf(ref) {
  return asText(ref?.id || ref);
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Только сериализуемые скаляры/структуры: properties bpmn-js могут содержать
// moddle-refs (businessObject'ы, closure'ы) — в op они не попадают.
function sanitizeValue(value, depth = 0) {
  if (value === null || value === undefined) return null;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (t === "object" && depth < 4) {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, depth + 1)).filter((item) => item !== null);
    }
    if (isPlainObject(value)) {
      const out = {};
      for (const [key, item] of Object.entries(value)) {
        const clean = sanitizeValue(item, depth + 1);
        if (clean !== null) out[key] = clean;
      }
      return out;
    }
  }
  return null;
}

function sanitizeProperties(properties) {
  const clean = sanitizeValue(properties);
  return isPlainObject(clean) ? clean : {};
}

function point(value) {
  // bpmn-js waypoints — {x, y}; допускаем и пары [x, y] (тесты/e2e-хуки).
  const raw = Array.isArray(value) ? { x: value[0], y: value[1] } : value;
  const p = sanitizeValue(raw);
  return isPlainObject(p) && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))
    ? { x: Number(p.x), y: Number(p.y) }
    : null;
}

function bounds(value) {
  const b = sanitizeValue(value);
  if (!isPlainObject(b)) return null;
  const out = {
    x: Number(b.x) || 0,
    y: Number(b.y) || 0,
    width: Number(b.width) || 0,
    height: Number(b.height) || 0,
  };
  return out;
}

function waypoints(value) {
  if (!Array.isArray(value)) return null;
  const pts = value.map((wp) => point(wp)).filter(Boolean);
  return pts.length === value.length ? pts.map((p) => [p.x, p.y]) : null;
}

// ---------------------------------------------------------------------------
// Coverage recorder (метрика ≥95%, PLAN §3.1). В node-окружении (тесты)
// живёт во fallback-объекте; в браузере зеркалируется на window.
// ---------------------------------------------------------------------------

let fallbackCoverage = { total: 0, mapped: 0, fullSave: 0 };

function coverageTarget() {
  if (typeof window !== "undefined" && window) {
    if (!window.__PM_OPS_COVERAGE__ || typeof window.__PM_OPS_COVERAGE__ !== "object") {
      window.__PM_OPS_COVERAGE__ = { total: 0, mapped: 0, fullSave: 0 };
    }
    return window.__PM_OPS_COVERAGE__;
  }
  return fallbackCoverage;
}

export function getOpsCoverage() {
  const target = coverageTarget();
  return {
    total: Number(target.total) || 0,
    mapped: Number(target.mapped) || 0,
    fullSave: Number(target.fullSave) || 0,
  };
}

function recordCoverage(mapped, needsFullSave) {
  const target = coverageTarget();
  target.total = (Number(target.total) || 0) + 1;
  if (mapped) target.mapped = (Number(target.mapped) || 0) + 1;
  if (needsFullSave) target.fullSave = (Number(target.fullSave) || 0) + 1;
}

export function __resetOpsCoverageForTests() {
  fallbackCoverage = { total: 0, mapped: 0, fullSave: 0 };
  if (typeof window !== "undefined" && window) {
    window.__PM_OPS_COVERAGE__ = { total: 0, mapped: 0, fullSave: 0 };
  }
}

// ---------------------------------------------------------------------------
// Whitelist-мапперы. Каждый возвращает { op } либо { needsFullSave: true }.
// inverse === true — undo-путь (compensating-op из старых значений).
// ---------------------------------------------------------------------------

function makeOp(type, elementId, payload) {
  return {
    type,
    elementId: asText(elementId),
    ...payload,
    key: `${type}::${asText(elementId)}`,
  };
}

function mapUpdateProperties(context, inverse) {
  const elementId = elementIdOf(context?.element);
  if (!elementId) return { needsFullSave: true };
  if (!inverse) {
    return { op: makeOp("element.updateProperties", elementId, { properties: sanitizeProperties(context?.properties) }) };
  }
  if (!isPlainObject(context?.oldProperties)) return { needsFullSave: true };
  return { op: makeOp("element.updateProperties", elementId, { properties: sanitizeProperties(context.oldProperties) }) };
}

function mapUpdateLabel(context, inverse) {
  const elementId = elementIdOf(context?.element);
  if (!elementId) return { needsFullSave: true };
  const name = inverse ? asText(context?.oldLabel) : asText(context?.newLabel);
  return { op: makeOp("element.updateProperties", elementId, { properties: { name } }) };
}

function mapShapeMove(context, inverse) {
  const elementId = elementIdOf(context?.shape || context?.element);
  if (!elementId) return { needsFullSave: true };
  const delta = point(context?.delta);
  if (!delta) return { needsFullSave: true };
  const finalDelta = inverse ? { x: -delta.x, y: -delta.y } : delta;
  return { op: makeOp("shape.move", elementId, { delta: finalDelta }) };
}

function mapShapeResize(context, inverse) {
  const elementId = elementIdOf(context?.shape || context?.element);
  if (!elementId) return { needsFullSave: true };
  const source = inverse ? context?.oldBounds : context?.newBounds;
  const b = bounds(source);
  if (!b) return { needsFullSave: true };
  return { op: makeOp("shape.resize", elementId, { bounds: b }) };
}

function mapUpdateDi(context, inverse) {
  const elementId = elementIdOf(context?.connection || context?.shape || context?.element || context?.label);
  if (!elementId) return { needsFullSave: true };
  const wp = waypoints(inverse ? context?.oldWaypoints : context?.newWaypoints);
  if (wp) {
    return { op: makeOp("element.updateDi", elementId, { waypoints: wp }) };
  }
  const b = bounds(inverse ? context?.oldBounds : context?.newBounds);
  if (b) {
    return { op: makeOp("element.updateDi", elementId, { bounds: b }) };
  }
  return { needsFullSave: true };
}

function elementTypeOf(ref) {
  return asText(ref?.businessObject?.$type || ref?.businessType || ref?.type);
}

// Артефактные типы (pool/lane/data/annotation/association) не маппятся в
// ops-payload step1: консервативно требуем полное сохранение, иначе
// серверная apply-op потеряет artifactRef (#995).
const FULL_SAVE_REQUIRED_BPMN_TYPE_PATTERN =
  /(?:participant|lane|datastorereference|dataobjectreference|datainputassociation|dataoutputassociation|textannotation|association)/i;

function requiresFullSaveForBpmnType(typeRaw) {
  return FULL_SAVE_REQUIRED_BPMN_TYPE_PATTERN.test(String(typeRaw || ""));
}

function mapShapeCreate(context, inverse) {
  if (inverse) {
    // Undo create — compensating delete-op (наследие п.6 §3 PLAN step2): id
    // клиентский, сервер сохраняет его применение с сохранением id → delete
    // корректен независимо от того, ушёл ли create на сервер.
    const ref = context?.shape || context?.element;
    const elementId = elementIdOf(ref);
    if (!elementId) return { needsFullSave: true };
    return { op: makeOp("shape.delete", elementId, {}) };
  }
  // Рантайм-снапшот нормализует ref элемента в context.element (wire-форма:
  // bounds вложены в ref.bounds); нативная форма commandStack — context.shape
  // с плоскими x/y/width/height на самом элементе. elementId — клиентский id
  // bpmn-js: уходит в payload и сервер применяет create с сохранением id.
  const ref = context?.shape || context?.element;
  const elementId = elementIdOf(ref);
  const elementType = elementTypeOf(ref);
  const b = bounds(ref?.bounds || ref);
  if (!elementId || !elementType || !b) return { needsFullSave: true };
  if (requiresFullSaveForBpmnType(elementType)) return { needsFullSave: true };
  return {
    op: makeOp("shape.create", elementId, {
      elementType,
      bounds: b,
      parentId: elementIdOf(context?.parent) || "",
    }),
  };
}

function mapConnectionCreate(context, inverse) {
  if (inverse) {
    const connection = context?.connection || context?.element;
    const elementId = elementIdOf(connection);
    if (!elementId) return { needsFullSave: true };
    return { op: makeOp("connection.delete", elementId, {}) };
  }
  // Wire-форма несёт соединение в context.element (нативная — context.connection).
  const connection = context?.connection || context?.element;
  const elementId = elementIdOf(connection);
  const sourceId = elementIdOf(context?.source || connection?.source);
  const targetId = elementIdOf(context?.target || connection?.target);
  if (!elementId || !sourceId || !targetId) return { needsFullSave: true };
  // Association — артефактная связь вне ops-payload step1: полное сохранение.
  if (requiresFullSaveForBpmnType(elementTypeOf(connection))) {
    return { needsFullSave: true };
  }
  const wp = waypoints(connection?.waypoints);
  return {
    op: makeOp("connection.create", elementId, {
      elementType: elementTypeOf(connection) || "bpmn:SequenceFlow",
      sourceId,
      targetId,
      ...(wp ? { waypoints: wp } : {}),
      parentId: elementIdOf(context?.parent) || "",
    }),
  };
}

// reconnectStart/reconnectEnd — нормализация в одну op connection.reconnect
// (наследие п.6 §3 PLAN step2): rewrite source/target на сервере, ребро
// перелинковывается. Undo — compensating-op со старыми source/target.
function mapConnectionReconnect(context, inverse) {
  const connection = context?.connection || context?.element;
  const connectionId = elementIdOf(connection);
  if (!connectionId) return { needsFullSave: true };
  const sourceRef = inverse
    ? (context?.oldSource ?? context?.old_source ?? connection?.source)
    : (context?.source ?? connection?.source);
  const targetRef = inverse
    ? (context?.oldTarget ?? context?.old_target ?? connection?.target)
    : (context?.target ?? connection?.target);
  const source = elementIdOf(sourceRef);
  const target = elementIdOf(targetRef);
  if (!source || !target) return { needsFullSave: true };
  return {
    op: makeOp("connection.reconnect", connectionId, { connectionId, source, target }),
  };
}

function mapDelete(kind) {
  return (context, inverse) => {
    if (inverse) return { needsFullSave: true };
    const ref = context?.shape || context?.connection || context?.element;
    const elementId = elementIdOf(ref);
    if (!elementId) return { needsFullSave: true };
    return { op: makeOp(kind, elementId, {}) };
  };
}

const WHITELIST = Object.freeze({
  "element.updateProperties": mapUpdateProperties,
  "element.updateLabel": mapUpdateLabel,
  "shape.move": mapShapeMove,
  "shape.resize": mapShapeResize,
  "connection.updateWaypoints": mapUpdateDi,
  "label.move": mapUpdateDi,
  "shape.create": mapShapeCreate,
  "connection.create": mapConnectionCreate,
  "shape.delete": mapDelete("shape.delete"),
  "connection.delete": mapDelete("connection.delete"),
  "connection.reconnect": mapConnectionReconnect,
  "connection.reconnectStart": mapConnectionReconnect,
  "connection.reconnectEnd": mapConnectionReconnect,
});

export function isReplayCommand(descriptor) {
  const source = asText(readContext(descriptor)?.__pmOpSource).toLowerCase();
  // "replay" — собственный rebase-replay; "remote" — применение чужих ops
  // (ops_committed consumer). Оба не становятся op и не двигают coverage.
  return source === "replay" || source === "remote";
}

// Рантайм-каскад несёт сериализованный контекст в поле commandContext
// (createBpmnRuntime notifyChange); тесты и AI-пути могут передавать context.
function readContext(descriptor) {
  const direct = descriptor?.context;
  if (direct && typeof direct === "object") return direct;
  const fromRuntime = descriptor?.commandContext;
  if (fromRuntime && typeof fromRuntime === "object") return fromRuntime;
  return {};
}

/**
 * Маппинг одной команды в op-лист.
 * @param {Object} descriptor - { command, action, context | commandContext, source }
 * @returns {{ops: Array, needsFullSave: boolean, replay: boolean, action: string, command: string}}
 */
export function mapCommandToOps(descriptor) {
  const command = asText(descriptor?.command);
  const action = asText(descriptor?.action) || "execute";
  const context = readContext(descriptor);

  if (isReplayCommand(descriptor)) {
    return { ops: [], needsFullSave: false, replay: true, action, command };
  }

  const mapper = WHITELIST[command];
  if (!mapper) {
    recordCoverage(false, true);
    return { ops: [], needsFullSave: true, replay: false, action, command };
  }

  const inverse = action === "undo";
  const mapped = mapper(context, inverse);
  if (!mapped?.op) {
    recordCoverage(false, true);
    return { ops: [], needsFullSave: true, replay: false, action, command };
  }

  // Порядок spread: payload маппера побеждает — connection.reconnect несёт
  // endpoint-ids в source/target (wire-контракт applier'а), provenance
  // (user|agent|e2e) остаётся дефолтом для остальных op-типов.
  const op = {
    source: asText(descriptor?.source) || "user",
    ...mapped.op,
  };
  recordCoverage(true, false);
  return { ops: [op], needsFullSave: false, replay: false, action, command };
}
