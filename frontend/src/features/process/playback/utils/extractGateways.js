function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function isGatewayNode(nodeRaw) {
  const type = toText(asObject(nodeRaw)?.typeLower || asObject(nodeRaw)?.type).toLowerCase();
  return type.includes("gateway");
}

function normalizeGatewayName(node) {
  const name = toText(node?.name);
  if (name) return name;
  const id = toText(node?.id);
  if (!id) return "Gateway";
  return `Gateway_${id}`;
}

function buildOutgoingLabel(flow, target, index) {
  const flowName = toText(flow?.label || flow?.name);
  if (flowName) return flowName;
  const targetName = toText(target?.name);
  if (targetName) return targetName;
  const flowId = toText(flow?.id);
  if (flowId) return `Flow_${flowId}`;
  return `Выбор ${Number(index || 0) + 1}`;
}

function compareText(aRaw, bRaw) {
  return String(aRaw || "").localeCompare(String(bRaw || ""), "ru");
}

export function extractGateways(graphRaw = {}) {
  const graph = asObject(graphRaw);
  const nodesById = asObject(graph?.nodesById);
  const flowsById = asObject(graph?.flowsById);
  const gateways = Object.values(nodesById)
    .map((row) => asObject(row))
    .filter((node) => isGatewayNode(node))
    .map((gateway) => {
      const outgoing = asArray(gateway?.outgoingFlowIds)
        .map((flowIdRaw, index) => {
          const flowId = toText(flowIdRaw);
          const flow = asObject(flowsById[flowId]);
          if (!flowId || !Object.keys(flow).length) return null;
          const targetId = toText(flow?.targetId);
          const target = asObject(nodesById[targetId]);
          return {
            flow_id: flowId,
            label: buildOutgoingLabel(flow, target, index),
            target_id: targetId,
          };
        })
        .filter(Boolean)
        .sort((a, b) => compareText(a.label, b.label) || compareText(a.flow_id, b.flow_id));
      return {
        gateway_id: toText(gateway?.id),
        name: normalizeGatewayName(gateway),
        type: toText(gateway?.type || gateway?.typeLower),
        outgoing,
      };
    })
    .filter((gateway) => !!gateway.gateway_id)
    .sort((a, b) => compareText(a.name, b.name) || compareText(a.gateway_id, b.gateway_id));
  return gateways;
}

export default extractGateways;
