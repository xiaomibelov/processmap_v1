function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function isConnectionElement(el) {
  return !!el && Array.isArray(el?.waypoints);
}

function readDiagramPointFromClient(inst, clientXRaw, clientYRaw) {
  const canvas = inst?.get?.("canvas");
  const container = canvas?._container;
  const rect = container?.getBoundingClientRect?.();
  const vb = canvas?.viewbox?.() || {};
  const scale = Number(vb?.scale || canvas?.zoom?.() || 1) || 1;
  const clientX = Number(clientXRaw || 0);
  const clientY = Number(clientYRaw || 0);
  const relX = clientX - Number(rect?.left || 0);
  const relY = clientY - Number(rect?.top || 0);
  return {
    x: Number(vb?.x || 0) + relX / scale,
    y: Number(vb?.y || 0) + relY / scale,
  };
}

async function copyToClipboard(rawValue) {
  const text = toText(rawValue);
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }

  if (typeof document !== "undefined") {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch {
      document.body.removeChild(ta);
    }
  }

  return false;
}

function selectAndEmitElement({
  inst,
  element,
  source = "context_menu_action",
  emitElementSelection,
  buildInsertBetweenCandidate,
}) {
  if (!inst || !element) return false;
  const elementId = toText(element?.id);
  if (!elementId) return false;
  try {
    const selection = inst.get("selection");
    selection?.select?.([element]);
  } catch {
  }
  if (typeof emitElementSelection === "function") {
    emitElementSelection(element, source, {
      selectedIds: [elementId],
      insertBetween: typeof buildInsertBetweenCandidate === "function"
        ? buildInsertBetweenCandidate(inst, [element])
        : null,
    });
  }
  return true;
}

function createConnectedTaskFromAnchor({
  inst,
  anchor,
  offsetY = 0,
  emitElementSelection,
  buildInsertBetweenCandidate,
}) {
  if (!inst || !anchor) return { ok: false, error: "anchor_not_found" };
  const modeling = inst.get("modeling");
  const elementFactory = inst.get("elementFactory");
  const x = Number(anchor?.x || 0);
  const y = Number(anchor?.y || 0);
  const width = Number(anchor?.width || 120);
  const height = Number(anchor?.height || 80);
  const parent = anchor?.parent || inst.get("canvas")?.getRootElement?.();

  const task = modeling.createShape(
    elementFactory.createShape({ type: "bpmn:Task" }),
    {
      x: Math.round(x + width + 220),
      y: Math.round(y + height / 2 + Number(offsetY || 0)),
    },
    parent,
  );
  modeling.connect(anchor, task, { type: "bpmn:SequenceFlow" });

  selectAndEmitElement({
    inst,
    element: task,
    source: "context_menu_add_next",
    emitElementSelection,
    buildInsertBetweenCandidate,
  });

  return {
    ok: true,
    changedIds: [toText(anchor?.id), toText(task?.id)].filter(Boolean),
    createdId: toText(task?.id),
  };
}

export async function executeBpmnContextMenuAction({
  payloadRaw = {},
  modelerRef,
  ensureModeler,
  emitDiagramMutation,
  emitElementSelection,
  buildInsertBetweenCandidate,
} = {}) {
  const payload = asObject(payloadRaw);
  const actionId = toText(payload.actionId);
  if (!actionId) return { ok: false, error: "missing_action_id" };

  const inst = modelerRef?.current || await Promise.resolve(
    typeof ensureModeler === "function" ? ensureModeler() : null,
  );
  if (!inst) return { ok: false, error: "modeler_not_ready" };

  const targetMeta = asObject(payload.target);
  const targetId = toText(targetMeta.id);
  const registry = inst.get("elementRegistry");
  const modeling = inst.get("modeling");
  const elementFactory = inst.get("elementFactory");
  const canvas = inst.get("canvas");
  const selection = inst.get("selection");
  const directEditing = inst.get?.("directEditing");
  const root = canvas?.getRootElement?.();
  const target = targetId ? registry?.get?.(targetId) : null;
  const point = readDiagramPointFromClient(inst, Number(payload.clientX || 0), Number(payload.clientY || 0));

  const emitMutation = (meta = {}) => {
    if (typeof emitDiagramMutation === "function") {
      emitDiagramMutation("diagram.context_menu_action", {
        actionId,
        ...asObject(meta),
      });
    }
  };

  const createOnCanvas = (type) => {
    const shape = modeling.createShape(
      elementFactory.createShape({ type }),
      { x: Math.round(point.x), y: Math.round(point.y) },
      root,
    );
    selectAndEmitElement({
      inst,
      element: shape,
      source: "context_menu_create",
      emitElementSelection,
      buildInsertBetweenCandidate,
    });
    emitMutation({ type });
    return {
      ok: true,
      createdId: toText(shape?.id),
      changedIds: [toText(shape?.id)].filter(Boolean),
    };
  };

  try {
    if (actionId === "create_task") return createOnCanvas("bpmn:Task");
    if (actionId === "create_gateway") return createOnCanvas("bpmn:ExclusiveGateway");
    if (actionId === "create_start_event") return createOnCanvas("bpmn:StartEvent");
    if (actionId === "create_end_event") return createOnCanvas("bpmn:EndEvent");
    if (actionId === "create_subprocess") return createOnCanvas("bpmn:SubProcess");
    if (actionId === "add_annotation") return createOnCanvas("bpmn:TextAnnotation");

    if (actionId === "paste") {
      const copyPaste = inst.get?.("copyPaste");
      if (!copyPaste || typeof copyPaste.paste !== "function") {
        return { ok: false, error: "paste_unavailable" };
      }
      const pasted = copyPaste.paste({
        element: root,
        point: { x: Math.round(point.x), y: Math.round(point.y) },
      });
      const ids = asArray(pasted)
        .map((item) => toText(item?.id || item?.element?.id))
        .filter(Boolean);
      if (ids[0]) {
        const first = registry?.get?.(ids[0]);
        if (first) selection?.select?.([first]);
      }
      emitMutation({ count: ids.length });
      return { ok: true, changedIds: ids };
    }

    if (!target) return { ok: false, error: "target_not_found" };

    if (actionId === "rename" || actionId === "edit_label") {
      if (directEditing && typeof directEditing.activate === "function") {
        directEditing.activate(target);
        return { ok: true, changedIds: [toText(target.id)].filter(Boolean) };
      }
      return { ok: false, error: "direct_editing_unavailable" };
    }

    if (actionId === "open_properties") {
      selectAndEmitElement({
        inst,
        element: target,
        source: "context_menu_properties",
        emitElementSelection,
        buildInsertBetweenCandidate,
      });
      return { ok: true, changedIds: [toText(target.id)].filter(Boolean) };
    }

    if (actionId === "add_next_step") {
      const result = createConnectedTaskFromAnchor({
        inst,
        anchor: target,
        emitElementSelection,
        buildInsertBetweenCandidate,
      });
      if (result.ok) emitMutation({ targetId });
      return result;
    }

    if (actionId === "add_outgoing_branch") {
      const outgoingCount = asArray(target?.outgoing).filter((row) => isConnectionElement(row)).length;
      const offsetY = outgoingCount <= 0 ? 0 : ((outgoingCount % 4) - 1.5) * 96;
      const result = createConnectedTaskFromAnchor({
        inst,
        anchor: target,
        offsetY,
        emitElementSelection,
        buildInsertBetweenCandidate,
      });
      if (result.ok) emitMutation({ targetId });
      return result;
    }

    if (actionId === "duplicate") {
      return { ok: false, error: "duplicate_disabled_for_semantic_safety" };
    }

    if (actionId === "copy_name") {
      const name = toText(target?.businessObject?.name);
      if (!name) return { ok: false, error: "name_empty" };
      const ok = await copyToClipboard(name);
      return { ok, error: ok ? "" : "clipboard_unavailable", message: ok ? `Copied: ${name}` : "" };
    }

    if (actionId === "copy_id") {
      const id = toText(target?.id);
      if (!id) return { ok: false, error: "id_empty" };
      const ok = await copyToClipboard(id);
      return { ok, error: ok ? "" : "clipboard_unavailable", message: ok ? `Copied: ${id}` : "" };
    }

    if (actionId === "open_inside") {
      const drilldown = inst.get?.("drilldown");
      if (drilldown && typeof drilldown.open === "function") {
        drilldown.open(target);
      } else {
        selectAndEmitElement({
          inst,
          element: target,
          source: "context_menu_open_inside",
          emitElementSelection,
          buildInsertBetweenCandidate,
        });
        canvas?.scrollToElement?.(target);
      }
      return { ok: true, changedIds: [toText(target.id)].filter(Boolean) };
    }

    if (actionId === "delete") {
      if (isConnectionElement(target)) modeling.removeConnection(target);
      else modeling.removeShape(target);
      emitMutation({ targetId });
      return { ok: true, changedIds: [targetId].filter(Boolean) };
    }

    return { ok: false, error: "unsupported_action" };
  } catch (error) {
    return {
      ok: false,
      error: toText(error?.message || error || "context_action_failed"),
    };
  }
}
