function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asText(value) {
  return String(value || "").trim();
}

function typeLower(typeRaw) {
  return asText(typeRaw).toLowerCase();
}

function readConditionText(flowBoRaw) {
  const flowBo = asObject(flowBoRaw);
  const cond = flowBo?.conditionExpression;
  if (!cond) return "";
  if (typeof cond === "string") return asText(cond);
  const condObj = asObject(cond);
  return asText(
    condObj?.body
    || condObj?.value
    || condObj?.text
    || condObj?.$body,
  );
}

function findParentSubprocessId(boRaw) {
  let bo = asObject(boRaw);
  if (!Object.keys(bo).length) return "";
  while (bo && typeof bo === "object") {
    const parent = asObject(bo?.$parent);
    if (!Object.keys(parent).length) return "";
    const pType = typeLower(parent?.$type);
    if (pType.includes("subprocess")) return asText(parent?.id);
    bo = parent;
  }
  return "";
}

function readLinkEventMeta(boRaw, boTypeRaw) {
  const bo = asObject(boRaw);
  const boType = typeLower(boTypeRaw || bo?.$type);
  const isThrow = boType.includes("intermediatethrowevent");
  const isCatch = boType.includes("intermediatecatchevent");
  if (!isThrow && !isCatch) {
    return {
      linkEventKind: "",
      linkEventName: "",
    };
  }
  const linkDef = asArray(bo?.eventDefinitions)
    .map((item) => asObject(item))
    .find((item) => typeLower(item?.$type).includes("linkeventdefinition"));
  if (!Object.keys(asObject(linkDef)).length) {
    return {
      linkEventKind: "",
      linkEventName: "",
    };
  }
  return {
    linkEventKind: isThrow ? "throw" : "catch",
    linkEventName: asText(linkDef?.name || bo?.name),
  };
}

function readEventContractMeta(boRaw, boTypeRaw) {
  const bo = asObject(boRaw);
  const boType = typeLower(boTypeRaw || bo?.$type);
  const defs = asArray(bo?.eventDefinitions).map((item) => asObject(item));
  const messageDef = defs.find((item) => typeLower(item?.$type).includes("messageeventdefinition"));
  if (messageDef) {
    return {
      eventContractKind: boType.includes("throw") || boType.includes("sendtask")
        ? "message_throw"
        : "message_catch",
      eventContractRef: asText(messageDef?.messageRef?.id || messageDef?.messageRef || bo?.messageRef?.id || bo?.messageRef),
    };
  }
  const signalDef = defs.find((item) => typeLower(item?.$type).includes("signaleventdefinition"));
  if (signalDef) {
    return {
      eventContractKind: "signal",
      eventContractRef: asText(signalDef?.signalRef?.id || signalDef?.signalRef || bo?.signalRef?.id || bo?.signalRef),
    };
  }
  return {
    eventContractKind: "",
    eventContractRef: "",
  };
}

function flowSortKey(flowRaw, nodeById, outgoingOrderById) {
  const flow = asObject(flowRaw);
  const label = asText(flow?.label);
  const condition = asText(flow?.conditionText);
  const targetId = asText(flow?.targetId);
  const targetName = asText(asObject(nodeById[targetId])?.name).toLowerCase();
  const hasSemanticLabel = label || condition ? 0 : 1;
  const outgoingOrder = Number(outgoingOrderById[asText(flow?.id)]);
  return {
    hasSemanticLabel,
    outgoingOrder: Number.isFinite(outgoingOrder) ? outgoingOrder : 1_000_000,
    targetName,
    targetId,
    id: asText(flow?.id),
  };
}

function compareFlowSortKey(aRaw, bRaw) {
  const a = asObject(aRaw);
  const b = asObject(bRaw);
  if (a.hasSemanticLabel !== b.hasSemanticLabel) return a.hasSemanticLabel - b.hasSemanticLabel;
  if (a.outgoingOrder !== b.outgoingOrder) return a.outgoingOrder - b.outgoingOrder;
  const byTargetName = String(a.targetName || "").localeCompare(String(b.targetName || ""), "ru");
  if (byTargetName !== 0) return byTargetName;
  const byTarget = String(a.targetId || "").localeCompare(String(b.targetId || ""), "ru");
  if (byTarget !== 0) return byTarget;
  return String(a.id || "").localeCompare(String(b.id || ""), "ru");
}

export function buildExecutionGraphFromInstance(instance) {
  if (!instance) {
    return {
      ok: false,
      reason: "instance_missing",
      nodesById: {},
      flowsById: {},
      startNodeIds: [],
      topLevelStartNodeIds: [],
    };
  }
  try {
    const registry = instance.get("elementRegistry");
    const all = asArray(registry?.getAll?.());
    const nodesById = {};
    const flowsById = {};

    all.forEach((elementRaw) => {
      const element = asObject(elementRaw);
      const bo = asObject(element?.businessObject);
      const id = asText(bo?.id || element?.id);
      const boType = asText(bo?.$type || element?.type);
      const t = typeLower(boType);
      if (!id || !t) return;
      if (t === "bpmn:sequenceflow") {
        const sourceId = asText(bo?.sourceRef?.id || element?.source?.id);
        const targetId = asText(bo?.targetRef?.id || element?.target?.id);
        if (!sourceId || !targetId) return;
        const conditionText = readConditionText(bo);
        flowsById[id] = {
          id,
          sourceId,
          targetId,
          label: asText(bo?.name),
          conditionText,
          hasSemanticLabel: !!(asText(bo?.name) || conditionText),
          boType,
        };
        return;
      }
      if (t === "bpmn:messageflow") {
        const sourceId = asText(bo?.sourceRef?.id || element?.source?.id);
        const targetId = asText(bo?.targetRef?.id || element?.target?.id);
        if (!sourceId || !targetId) return;
        flowsById[id] = {
          id,
          sourceId,
          targetId,
          label: asText(bo?.name),
          conditionText: "",
          hasSemanticLabel: !!asText(bo?.name),
          boType,
          flowKind: "message",
        };
        return;
      }
      if (t === "label") return;
      const linkMeta = readLinkEventMeta(bo, boType);
      const eventContractMeta = readEventContractMeta(bo, boType);
      nodesById[id] = {
        id,
        type: boType,
        typeLower: t,
        name: asText(bo?.name || element?.name || id),
        incomingFlowIds: [],
        outgoingFlowIds: [],
        parentSubprocessId: findParentSubprocessId(bo),
        linkEventKind: asText(linkMeta?.linkEventKind),
        linkEventName: asText(linkMeta?.linkEventName),
        eventContractKind: asText(eventContractMeta?.eventContractKind),
        eventContractRef: asText(eventContractMeta?.eventContractRef),
      };
    });

    Object.values(flowsById).forEach((flowRaw) => {
      const flow = asObject(flowRaw);
      const sourceId = asText(flow?.sourceId);
      const targetId = asText(flow?.targetId);
      if (!nodesById[sourceId]) {
        nodesById[sourceId] = {
          id: sourceId,
          type: "bpmn:Unknown",
          typeLower: "bpmn:unknown",
          name: sourceId,
          incomingFlowIds: [],
          outgoingFlowIds: [],
          parentSubprocessId: "",
          linkEventKind: "",
          linkEventName: "",
        };
      }
      if (!nodesById[targetId]) {
        nodesById[targetId] = {
          id: targetId,
          type: "bpmn:Unknown",
          typeLower: "bpmn:unknown",
          name: targetId,
          incomingFlowIds: [],
          outgoingFlowIds: [],
          parentSubprocessId: "",
          linkEventKind: "",
          linkEventName: "",
        };
      }
      const flowKind = asText(flow?.flowKind || "sequence");
      if (flowKind === "sequence") {
        nodesById[sourceId].outgoingFlowIds.push(asText(flow?.id));
        nodesById[targetId].incomingFlowIds.push(asText(flow?.id));
      }
    });

    Object.values(nodesById).forEach((nodeRaw) => {
      const node = asObject(nodeRaw);
      const id = asText(node?.id);
      const element = asObject(registry?.get?.(id));
      const bo = asObject(element?.businessObject);
      const outgoingOrderById = {};
      asArray(bo?.outgoing).forEach((flowRefRaw, index) => {
        const flowRef = asObject(flowRefRaw);
        const flowId = asText(flowRef?.id);
        if (!flowId || flowId in outgoingOrderById) return;
        outgoingOrderById[flowId] = index;
      });

      const outgoingSorted = asArray(node?.outgoingFlowIds)
        .filter((flowId) => !!flowsById[flowId])
        .map((flowId) => ({
          flowId,
          key: flowSortKey(flowsById[flowId], nodesById, outgoingOrderById),
        }))
        .sort((a, b) => compareFlowSortKey(a.key, b.key))
        .map((row) => String(row.flowId));
      nodesById[id] = {
        ...node,
        outgoingFlowIds: outgoingSorted,
        incomingFlowIds: asArray(node?.incomingFlowIds).filter((flowId) => !!flowsById[flowId]),
      };
    });

    const allStartNodeIds = Object.values(nodesById)
      .filter((nodeRaw) => typeLower(nodeRaw?.type).includes("startevent") && asArray(nodeRaw?.incomingFlowIds).length === 0)
      .map((nodeRaw) => asText(nodeRaw?.id))
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b), "ru"));

    const topLevelStartNodeIds = allStartNodeIds
      .filter((nodeId) => !asText(asObject(nodesById[nodeId])?.parentSubprocessId))
      .sort((a, b) => String(a).localeCompare(String(b), "ru"));

    let startNodeIds = topLevelStartNodeIds.length
      ? topLevelStartNodeIds
      : allStartNodeIds;

    if (!startNodeIds.length) {
      const topLevelZeroIncoming = Object.values(nodesById)
        .filter((nodeRaw) => asArray(nodeRaw?.incomingFlowIds).length === 0 && !asText(nodeRaw?.parentSubprocessId))
        .map((nodeRaw) => asText(nodeRaw?.id))
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b), "ru"));
      startNodeIds = topLevelZeroIncoming.length
        ? topLevelZeroIncoming
        : Object.values(nodesById)
        .filter((nodeRaw) => asArray(nodeRaw?.incomingFlowIds).length === 0)
        .map((nodeRaw) => asText(nodeRaw?.id))
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b), "ru"));
    }

    return {
      ok: true,
      reason: "",
      nodesById,
      flowsById,
      startNodeIds,
      topLevelStartNodeIds,
    };
  } catch (error) {
    return {
      ok: false,
      reason: asText(error?.message || error || "graph_build_failed"),
      nodesById: {},
      flowsById: {},
      startNodeIds: [],
      topLevelStartNodeIds: [],
    };
  }
}
