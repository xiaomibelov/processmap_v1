function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function toText(v) {
  return String(v || "").trim();
}

function highlightChangedElements(inst, ids = []) {
  if (!inst) return;
  const uniqueIds = Array.from(new Set(asArray(ids).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!uniqueIds.length) return;
  try {
    const registry = inst.get("elementRegistry");
    const selection = inst.get("selection");
    const canvas = inst.get("canvas");
    const selected = uniqueIds
      .map((id) => registry.get(id))
      .filter(Boolean);
    if (selected.length) selection.select(selected);
    uniqueIds.forEach((id) => {
      try {
        canvas.addMarker(id, "fpcElementSelected");
      } catch {
      }
    });
    window.setTimeout(() => {
      uniqueIds.forEach((id) => {
        try {
          canvas.removeMarker(id, "fpcElementSelected");
        } catch {
        }
      });
    }, 1200);
  } catch {
  }
}

export function createCommandOpsAdapter(deps = {}) {
  const getModelerOrEnsure = typeof deps.getModelerOrEnsure === "function"
    ? deps.getModelerOrEnsure
    : null;
  const applyOpsToModeler = typeof deps.applyOpsToModeler === "function"
    ? deps.applyOpsToModeler
    : null;
  const emitDiagramMutation = typeof deps.emitDiagramMutation === "function"
    ? deps.emitDiagramMutation
    : null;

  async function applyCommandOpsOnModeler(payload = {}) {
    const inst = await getModelerOrEnsure?.();
    if (!inst) {
      return {
        ok: false,
        applied: 0,
        failed: 0,
        changedIds: [],
        results: [],
        error: "modeler_not_ready",
      };
    }
    const ops = asArray(payload?.ops);
    if (!ops.length) {
      return {
        ok: false,
        applied: 0,
        failed: 0,
        changedIds: [],
        results: [],
        error: "empty_ops",
      };
    }

    const result = await applyOpsToModeler(inst, ops, {
      selectedElementId: toText(payload?.selectedElementId || ""),
    });

    if (result?.changedIds?.length) {
      highlightChangedElements(inst, result.changedIds);
    }

    if (result?.applied > 0) {
      emitDiagramMutation?.("diagram.ai_command_ops", {
        applied: Number(result?.applied || 0),
        failed: Number(result?.failed || 0),
      });
    }

    return result;
  }

  return {
    applyCommandOpsOnModeler,
  };
}

export default createCommandOpsAdapter;
