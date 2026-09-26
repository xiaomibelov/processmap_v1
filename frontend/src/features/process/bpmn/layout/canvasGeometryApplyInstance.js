// canvasGeometryApplyInstance.js — bpmn-js-вайринг «Применить к схеме»
// (контур fix/canvas-apply-persist-validation: функции перенесены из
// BpmnStage.jsx без изменения математики; правки — только слой
// persist-контракта и moddle-безопасность DI, см. FIX.md контура).
//
// Зависимости направлены строго в одну сторону:
//   canvasGeometryApplyInstance → canvasGeometryApply, canvasGeometry
// (циклов нет; React/вайринг сюда не импортируются — модуль тестируем
// headless-без bpmn-js через mock-inst и с bpmn-js через vitest).

import { computeGeometryApplyPlan } from "./canvasGeometryApply.js";
import { getCanvasGeometry } from "./canvasGeometry.js";

function isLayoutableFlowNode(element) {
  if (!element) return false;
  const type = String(element.type || element.$type || "").toLowerCase();
  if (!type.startsWith("bpmn:")) return false;
  if (type.includes("sequenceflow")) return false;
  if (type.includes("lane")) return false;
  if (type.includes("participant")) return false;
  if (type.includes("label")) return false;
  if (type.includes("definitions")) return false;
  if (type.includes("process")) return false;
  if (Array.isArray(element.waypoints) && element.waypoints.length > 0) return false;
  if (!Number.isFinite(Number(element.x)) || !Number.isFinite(Number(element.y))) return false;
  if (!(Number(element.width || 0) > 0) || !(Number(element.height || 0) > 0)) return false;
  return true;
}

// Контейнер выравнивания: lane, иначе participant (pool), иначе дефолт.
// Пересадка между lane/pool исключена конструкцией: группировка и кламп
// идут строго внутри этого контейнера.
function readAlignContainerForElement(el) {
  let cur = (el && el.parent) || null;
  while (cur) {
    const bo = cur.businessObject || {};
    const type = String(bo.$type || cur.type || "").toLowerCase();
    if (type.includes("lane") || type.includes("participant")) {
      const bounds = Number.isFinite(Number(cur.x)) && Number(cur.width) > 0 && Number(cur.height) > 0
        ? { x: Number(cur.x), y: Number(cur.y), width: Number(cur.width), height: Number(cur.height) }
        : null;
      return { key: String(cur.id || type), bounds };
    }
    cur = cur.parent || null;
  }
  return { key: "__default__", bounds: null };
}

// Экстрактор входа плана apply — зеркало registry bpmn-js. Раньше жил в
// BpmnStage.jsx; перенесён сюда, чтобы интеграционные тесты могли прогонять
// apply на реальном headless-modeler без импорта React-компонента.
function computeGeometryApplyPlanFromRegistry(registry) {
  const all = Array.isArray(registry?.getAll?.()) ? registry.getAll() : [];
  const elements = all.filter(isLayoutableFlowNode);
  const nodes = elements.map((el) => {
    const container = readAlignContainerForElement(el);
    return {
      id: el.id,
      type: el.type || el.$type,
      x: Number(el.x || 0),
      y: Number(el.y || 0),
      width: Number(el.width || 0),
      height: Number(el.height || 0),
      laneKey: container.key,
      laneBounds: container.bounds,
      attachedTo: el.host?.id || null,
    };
  });
  const connections = all
    .filter((el) => Array.isArray(el?.waypoints) && el.waypoints.length > 0)
    .map((el) => ({
      id: el.id,
      sourceId: el.source?.id || el.businessObject?.sourceRef?.id || null,
      targetId: el.target?.id || el.businessObject?.targetRef?.id || null,
      waypoints: el.waypoints,
    }));
  return computeGeometryApplyPlan({ nodes, connections }, getCanvasGeometry());
}

// moddle-безопасная фабрика DI-waypoint (fix/canvas-apply-persist-validation).
// moddle-xml writer сериализует только элементы с $descriptor: замена
// bpmndi:waypoint plain-объектами {x,y} ломала saveXML
// ("Cannot read properties of undefined (reading 'isGeneric')") — apply
// падал ДО persist. Тип берём из дескриптора существующего waypoint
// (dc:Point), model — из его $model; нет moddle — честный plain-фолбэк.
function diWaypointFactory(template) {
  const model = template && template.$model;
  const type = template && template.$descriptor && template.$descriptor.name;
  if (model && type && typeof model.create === "function") {
    return (x, y) => {
      try {
        return model.create(type, { x, y });
      } catch {
        return { x, y };
      }
    };
  }
  return (x, y) => ({ x, y });
}

// Один commandStack-хендлер на все мутации align/applyGeometry → один шаг undo/redo.
// Прямые мутации геометрии + DI (без modeling.*): стрелки либо транслируются
// (op {dx,dy}), либо полностью переразводятся (op {waypoints} — контур
// fix/canvas-geometry-apply-topology); layoutConnection не вызывается.
function FpcAlignDiagramHandler() {}
FpcAlignDiagramHandler.prototype.execute = function execute(context) {
  const changed = [];
  context.records = [];
  for (const op of context.shapeOps || []) {
    const el = op.element;
    const di = el.di || null;
    const diBounds = di && di.bounds ? di.bounds : null;
    context.records.push({
      kind: "shape",
      el,
      x: el.x, y: el.y, width: el.width, height: el.height,
      di: diBounds
        ? { x: diBounds.x, y: diBounds.y, width: diBounds.width, height: diBounds.height }
        : null,
    });
    el.x = op.x; el.y = op.y; el.width = op.width; el.height = op.height;
    if (diBounds) {
      diBounds.x = op.x; diBounds.y = op.y; diBounds.width = op.width; diBounds.height = op.height;
    }
    changed.push(el);
  }
  for (const op of context.connectionOps || []) {
    const conn = op.element;
    const di = conn.di || null;
    const diWaypoints = di && Array.isArray(di.waypoint) ? di.waypoint : null;
    const diTemplate = diWaypoints && diWaypoints.length ? diWaypoints[0] : null;
    context.records.push({
      kind: "connection",
      el: conn,
      replace: Array.isArray(op.waypoints),
      waypoints: conn.waypoints.map((p) => ({
        x: p.x, y: p.y,
        original: p.original ? { x: p.original.x, y: p.original.y } : undefined,
      })),
      diWaypoints: diWaypoints ? diWaypoints.map((p) => ({ x: p.x, y: p.y })) : null,
      diTemplate,
    });
    if (Array.isArray(op.waypoints)) {
      // Переразводка: полная замена waypoints (длина может отличаться).
      // DI-waypoint создаём через moddle (см. diWaypointFactory) — иначе
      // saveXML падает на сериализации DI.
      const waypoint = diWaypointFactory(diTemplate);
      const next = op.waypoints.map((p) => ({ x: p.x, y: p.y }));
      conn.waypoints.splice(0, conn.waypoints.length, ...next.map((p) => ({ ...p })));
      if (diWaypoints) diWaypoints.splice(0, diWaypoints.length, ...next.map((p) => waypoint(p.x, p.y)));
    } else {
      for (const p of conn.waypoints) {
        p.x += op.dx; p.y += op.dy;
        if (p.original) { p.original.x += op.dx; p.original.y += op.dy; }
      }
      if (diWaypoints) {
        for (const p of diWaypoints) { p.x += op.dx; p.y += op.dy; }
      }
    }
    changed.push(conn);
  }
  return changed;
};
FpcAlignDiagramHandler.prototype.revert = function revert(context) {
  const changed = [];
  for (const rec of context.records || []) {
    if (rec.kind === "shape") {
      rec.el.x = rec.x; rec.el.y = rec.y; rec.el.width = rec.width; rec.el.height = rec.height;
      if (rec.di && rec.el.di && rec.el.di.bounds) {
        const b = rec.el.di.bounds;
        b.x = rec.di.x; b.y = rec.di.y; b.width = rec.di.width; b.height = rec.di.height;
      }
    } else if (rec.kind === "connection") {
      if (rec.replace) {
        // Восстановление после переразводки: возвращаем записанный массив целиком.
        // DI-waypoint снова через moddle (после undo saveXML обязан остаться
        // валидным — redo/сохранение идут дальше).
        const waypoint = diWaypointFactory(rec.diTemplate);
        rec.el.waypoints.splice(0, rec.el.waypoints.length, ...rec.waypoints.map((p) => ({
          x: p.x, y: p.y,
          original: p.original ? { x: p.original.x, y: p.original.y } : undefined,
        })));
        if (rec.diWaypoints && rec.el.di && Array.isArray(rec.el.di.waypoint)) {
          rec.el.di.waypoint.splice(0, rec.el.di.waypoint.length, ...rec.diWaypoints.map((p) => waypoint(p.x, p.y)));
        }
      } else {
        rec.el.waypoints.forEach((p, i) => {
          const old = rec.waypoints[i];
          if (!old) return;
          p.x = old.x; p.y = old.y;
          if (p.original && old.original) { p.original.x = old.original.x; p.original.y = old.original.y; }
        });
        if (rec.diWaypoints && rec.el.di && Array.isArray(rec.el.di.waypoint)) {
          rec.el.di.waypoint.forEach((p, i) => {
            const old = rec.diWaypoints[i];
            if (!old) return;
            p.x = old.x; p.y = old.y;
          });
        }
      }
    }
    changed.push(rec.el);
  }
  return changed;
};

// «Применить к схеме» (canvas-geometry-apply): ресайз всех тасков до настроек
// (центр-якорь) + ЛОКАЛЬНАЯ нормализация зазоров вдоль потока (контур
// fix/canvas-geometry-apply-topology: глобальная перекладка рядов удалена —
// она ломала длинные цепочки; y узлов не меняются, вертикальные ветки едут
// с родителем, boundary следует за хостом). Стрелки: общая дельта →
// трансляция, разные дельты → переразводка waypoints. Математика — в
// canvasGeometryApply.js; здесь только bpmn-js-вайринг по паттерну align:
// один commandStack.execute (хендлер FpcAlignDiagramHandler), DI только el.di/conn.di.
async function applyGeometryOnInstance(inst, options = {}) {
  if (!inst) return { ok: false, error: "modeler_not_ready" };
  try {
    const registry = inst.get("elementRegistry");
    const canvas = inst.get("canvas");

    const layout = computeGeometryApplyPlanFromRegistry(registry);

    const shapeOps = [];
    for (const [id, pos] of layout.positions) {
      const element = registry.get(id);
      if (!element) continue;
      if (
        Number(element.x) === pos.x && Number(element.y) === pos.y &&
        Number(element.width) === pos.width && Number(element.height) === pos.height
      ) continue;
      shapeOps.push({ element, x: pos.x, y: pos.y, width: pos.width, height: pos.height });
    }
    const connectionOps = [];
    for (const [id, tr] of layout.connectionTranslations) {
      if (!tr.dx && !tr.dy) continue;
      const conn = registry.get(id);
      if (!conn || !Array.isArray(conn.waypoints) || conn.waypoints.length === 0) continue;
      connectionOps.push({ element: conn, dx: tr.dx, dy: tr.dy });
    }
    for (const [id, pts] of layout.connectionWaypoints || []) {
      if (!Array.isArray(pts) || pts.length < 2) continue;
      const conn = registry.get(id);
      if (!conn || !Array.isArray(conn.waypoints) || conn.waypoints.length === 0) continue;
      connectionOps.push({ element: conn, waypoints: pts });
    }
    if (shapeOps.length === 0 && connectionOps.length === 0) {
      return { ok: true, noop: true, xml: null, stats: layout.stats || null };
    }

    const commandStack = inst.get("commandStack");
    if (!commandStack) return { ok: false, error: "command_stack_unavailable" };
    if (!commandStack.__fpcApplyGeometryHandlerRegistered && typeof commandStack.registerHandler === "function") {
      commandStack.registerHandler("fpc.applyGeometry", FpcAlignDiagramHandler);
      commandStack.__fpcApplyGeometryHandlerRegistered = true;
    }
    commandStack.execute("fpc.applyGeometry", { shapeOps, connectionOps });

    if (canvas && typeof canvas.zoom === "function") {
      canvas.zoom("fit-viewport");
      const z = canvas.zoom();
      if (!Number.isFinite(z) || z <= 0) canvas.zoom(1);
    }

    // Сериализация не удалась → это сбой persist-пути: откатываем команду,
    // apply не остаётся применённым (контракт undo-on-persist-failure #1043;
    // раньше exception улетал во внешний catch БЕЗ undo — схема оставалась
    // применённой без единого PUT).
    let saved;
    try {
      saved = await inst.saveXML({ format: true });
    } catch (saveError) {
      try { commandStack.undo(); } catch { /* undo guard */ }
      return { ok: false, error: String(saveError?.message || saveError || "apply_geometry_serialize_failed") };
    }
    const xml = String(saved?.xml || "");

    // Тот же persist-контракт, что у align: снапшот «до» + full-PUT;
    // не удалось → откатываем команду, применение не остаётся.
    const persistXml = typeof options.persistXml === "function" ? options.persistXml : null;
    if (persistXml) {
      const put = await persistXml(xml, { sourceAction: "align" });
      if (!put || put.ok === false) {
        try { commandStack.undo(); } catch { /* undo guard */ }
        return { ok: false, error: String(put?.error || "apply_geometry_save_failed") };
      }
      // ok:true без bpmnVersionSnapshot — штатный ответ серверного no-op
      // guard'а (этот XML уже закоммичен конкурентным писателем — тот сам
      // создал версию-снапшот; откат к предыдущей версии не теряется). Это
      // УСПЕХ persist'а: undo здесь ложный
      // (fix/canvas-apply-persist-validation, FIX C).
    }

    return { ok: true, xml, stats: layout.stats || null };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || "apply_geometry_failed") };
  }
}

export {
  FpcAlignDiagramHandler,
  applyGeometryOnInstance,
  computeGeometryApplyPlanFromRegistry,
  diWaypointFactory,
  isLayoutableFlowNode,
  readAlignContainerForElement,
};
