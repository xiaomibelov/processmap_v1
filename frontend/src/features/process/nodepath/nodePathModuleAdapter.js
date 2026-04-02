import { buildNodePathComparableSnapshot } from "../../../components/sidebar/nodePathSyncState.js";

function asFunction(value) {
  return typeof value === "function" ? value : null;
}

export function createNodePathModuleAdapter({
  getSnapshot,
  applyNodePathAssignments,
} = {}) {
  const readSnapshot = asFunction(getSnapshot);
  const applyAssignments = asFunction(applyNodePathAssignments);

  function readSharedSnapshot(nodeId) {
    return buildNodePathComparableSnapshot(readSnapshot ? readSnapshot(nodeId) : null);
  }

  async function applyDraft({ nodeId, draft }) {
    const snapshot = buildNodePathComparableSnapshot(draft);
    if (!applyAssignments || !nodeId) {
      return { ok: false, error: "Node-path bridge недоступен.", snapshot };
    }
    const result = await Promise.resolve(
      applyAssignments([{
        node_id: nodeId,
        paths: snapshot.paths,
        sequence_key: snapshot.sequence_key || null,
        source: "manual",
      }], { source: "manual", from: "selected_node_paths_apply" }),
    );
    if (result && result.ok === false) {
      return { ok: false, error: String(result.error || "Не удалось сохранить разметку узла."), snapshot };
    }
    return { ok: true, snapshot };
  }

  async function clearSharedSnapshot({ nodeId }) {
    const snapshot = buildNodePathComparableSnapshot(null);
    if (!applyAssignments || !nodeId) {
      return { ok: false, error: "Node-path bridge недоступен.", snapshot };
    }
    const result = await Promise.resolve(
      applyAssignments([{
        node_id: nodeId,
        paths: [],
        sequence_key: null,
        source: "manual",
      }], { source: "manual", from: "selected_node_paths_reset" }),
    );
    if (result && result.ok === false) {
      return { ok: false, error: String(result.error || "Не удалось сбросить разметку узла."), snapshot };
    }
    return { ok: true, snapshot };
  }

  return {
    readSharedSnapshot,
    applyDraft,
    clearSharedSnapshot,
    read: readSharedSnapshot,
    apply: applyDraft,
    reset: clearSharedSnapshot,
  };
}
