function asInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clampInt(value, min, max, fallback) {
  const n = asInt(value, fallback);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function escAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function waypointPath(fromBounds, toBounds) {
  const x1 = Number(fromBounds.x || 0) + Number(fromBounds.width || 0);
  const y1 = Number(fromBounds.y || 0) + Number(fromBounds.height || 0) / 2;
  const x2 = Number(toBounds.x || 0);
  const y2 = Number(toBounds.y || 0) + Number(toBounds.height || 0) / 2;
  if (Math.abs(y1 - y2) < 4) {
    return [
      { x: Math.round(x1), y: Math.round(y1) },
      { x: Math.round(x2), y: Math.round(y2) },
    ];
  }
  const midX = Math.round((x1 + x2) / 2);
  return [
    { x: Math.round(x1), y: Math.round(y1) },
    { x: midX, y: Math.round(y1) },
    { x: midX, y: Math.round(y2) },
    { x: Math.round(x2), y: Math.round(y2) },
  ];
}

export function makeBigDiagramXml(options = {}) {
  const seed = asInt(options.seed, 20260220);
  const poolCount = clampInt(options.pools, 1, 4, 2);
  const laneCount = clampInt(options.lanes, 1, 6, 3);
  const tasksPerPool = clampInt(options.tasks, 1, 32, 7);
  const requestedEdges = clampInt(options.edges, tasksPerPool + 1, tasksPerPool + 24, tasksPerPool + 3);
  const annotationsPerPool = clampInt(options.annotations, 0, tasksPerPool, 2);
  const runRand = mulberry32(seed);

  const laneHeight = 170;
  const poolGap = 64;
  const leftX = 90;
  const taskDx = 172;
  const processWidth = 380 + taskDx * (tasksPerPool + 1);
  const participantWidth = Math.max(1480, processWidth);
  const participantInnerX = leftX + 36;

  const boundsByElement = new Map();
  const processChunks = [];
  const participantShapes = [];
  const laneShapes = [];
  const flowEdges = [];
  const associationEdges = [];
  const nodeShapes = [];
  const annotationShapes = [];
  const participantRefs = [];

  for (let p = 1; p <= poolCount; p += 1) {
    const processId = `Process_${p}`;
    const participantId = `Participant_${p}`;
    const participantName = `Pool ${p}`;
    const laneSetId = `LaneSet_${p}`;
    const startId = `StartEvent_${p}`;
    const endId = `EndEvent_${p}`;
    const participantY = 44 + (p - 1) * (laneCount * laneHeight + poolGap);
    const participantHeight = laneCount * laneHeight;

    participantRefs.push(`<bpmn:participant id="${participantId}" name="${escAttr(participantName)}" processRef="${processId}" />`);
    participantShapes.push(
      `<bpmndi:BPMNShape id="${participantId}_di" bpmnElement="${participantId}" isHorizontal="true"><dc:Bounds x="${leftX}" y="${participantY}" width="${participantWidth}" height="${participantHeight}" /></bpmndi:BPMNShape>`,
    );
    boundsByElement.set(participantId, { x: leftX, y: participantY, width: participantWidth, height: participantHeight });

    const laneIds = [];
    const laneNodeRefs = new Map();
    for (let l = 1; l <= laneCount; l += 1) {
      const laneId = `Lane_${p}_${l}`;
      laneIds.push(laneId);
      laneNodeRefs.set(laneId, []);
      const laneY = participantY + (l - 1) * laneHeight;
      laneShapes.push(
        `<bpmndi:BPMNShape id="${laneId}_di" bpmnElement="${laneId}" isHorizontal="true"><dc:Bounds x="${participantInnerX}" y="${laneY}" width="${participantWidth - 36}" height="${laneHeight}" /></bpmndi:BPMNShape>`,
      );
      boundsByElement.set(laneId, { x: participantInnerX, y: laneY, width: participantWidth - 36, height: laneHeight });
    }

    laneNodeRefs.get(laneIds[0]).push(startId);
    laneNodeRefs.get(laneIds[laneIds.length - 1]).push(endId);

    const taskIds = [];
    const nodeDefs = [];
    const flowDefs = [];
    for (let t = 1; t <= tasksPerPool; t += 1) {
      const taskId = `Task_${p}_${t}`;
      taskIds.push(taskId);
      const laneId = laneIds[(t - 1) % laneIds.length];
      laneNodeRefs.get(laneId).push(taskId);
    }

    const linearNodes = [startId, ...taskIds, endId];
    for (let i = 0; i < linearNodes.length - 1; i += 1) {
      const flowId = `Flow_${p}_${i + 1}`;
      flowDefs.push({
        id: flowId,
        sourceRef: linearNodes[i],
        targetRef: linearNodes[i + 1],
        name: "",
      });
    }

    const flowPairs = new Set(flowDefs.map((it) => `${it.sourceRef}->${it.targetRef}`));
    let extraFlowIdx = flowDefs.length + 1;
    for (let t = 1; t <= tasksPerPool && flowDefs.length < requestedEdges; t += 1) {
      const source = taskIds[t - 1];
      const target = taskIds[Math.min(tasksPerPool - 1, t + 1)];
      const pair = `${source}->${target}`;
      if (!source || !target || source === target || flowPairs.has(pair)) continue;
      flowPairs.add(pair);
      flowDefs.push({
        id: `Flow_${p}_${extraFlowIdx}`,
        sourceRef: source,
        targetRef: target,
        name: `skip_${p}_${t}`,
      });
      extraFlowIdx += 1;
    }

    const laneXml = laneIds
      .map((laneId, idx) => {
        const refs = laneNodeRefs.get(laneId) || [];
        const refsXml = refs.map((ref) => `<bpmn:flowNodeRef>${ref}</bpmn:flowNodeRef>`).join("");
        return `<bpmn:lane id="${laneId}" name="Lane ${p}.${idx + 1}">${refsXml}</bpmn:lane>`;
      })
      .join("");

    nodeDefs.push(
      `<bpmn:startEvent id="${startId}" name="Start ${p}"><bpmn:outgoing>${flowDefs[0].id}</bpmn:outgoing></bpmn:startEvent>`,
    );
    for (let t = 1; t <= tasksPerPool; t += 1) {
      const taskId = taskIds[t - 1];
      const incoming = flowDefs.filter((f) => f.targetRef === taskId).map((f) => `<bpmn:incoming>${f.id}</bpmn:incoming>`).join("");
      const outgoing = flowDefs.filter((f) => f.sourceRef === taskId).map((f) => `<bpmn:outgoing>${f.id}</bpmn:outgoing>`).join("");
      nodeDefs.push(
        `<bpmn:task id="${taskId}" name="Task ${p}.${t}">${incoming}${outgoing}</bpmn:task>`,
      );
    }
    nodeDefs.push(
      `<bpmn:endEvent id="${endId}" name="End ${p}"><bpmn:incoming>${flowDefs[flowDefs.length - 1].id}</bpmn:incoming></bpmn:endEvent>`,
    );

    const textAnnotations = [];
    const associations = [];
    for (let a = 1; a <= annotationsPerPool; a += 1) {
      const targetTask = taskIds[(a - 1) % taskIds.length];
      const annotationId = `TextAnnotation_${p}_${a}`;
      const associationId = `Association_${p}_${a}`;
      const randomToken = Math.floor(runRand() * 10000)
        .toString()
        .padStart(4, "0");
      textAnnotations.push(
        `<bpmn:textAnnotation id="${annotationId}"><bpmn:text>Auto note p${p}-a${a}-s${seed}-${randomToken}</bpmn:text></bpmn:textAnnotation>`,
      );
      associations.push(
        `<bpmn:association id="${associationId}" sourceRef="${targetTask}" targetRef="${annotationId}" />`,
      );
    }

    const flowXml = flowDefs
      .map((it) => (
        `<bpmn:sequenceFlow id="${it.id}" sourceRef="${it.sourceRef}" targetRef="${it.targetRef}"${
          it.name ? ` name="${escAttr(it.name)}"` : ""
        } />`
      ))
      .join("");
    processChunks.push(
      `<bpmn:process id="${processId}" isExecutable="false"><bpmn:laneSet id="${laneSetId}">${laneXml}</bpmn:laneSet>${nodeDefs.join("")}${flowXml}${textAnnotations.join("")}${associations.join("")}</bpmn:process>`,
    );

    const laneCenterY = (laneId) => {
      const laneBounds = boundsByElement.get(laneId);
      return Number(laneBounds?.y || 0) + Number(laneBounds?.height || 0) / 2;
    };
    const startLaneId = laneIds[0];
    const endLaneId = laneIds[laneIds.length - 1];
    const startBounds = { x: participantInnerX + 70, y: laneCenterY(startLaneId) - 18, width: 36, height: 36 };
    const endBounds = {
      x: participantInnerX + 220 + tasksPerPool * taskDx,
      y: laneCenterY(endLaneId) - 18,
      width: 36,
      height: 36,
    };
    boundsByElement.set(startId, startBounds);
    boundsByElement.set(endId, endBounds);

    nodeShapes.push(
      `<bpmndi:BPMNShape id="${startId}_di" bpmnElement="${startId}"><dc:Bounds x="${Math.round(startBounds.x)}" y="${Math.round(startBounds.y)}" width="${startBounds.width}" height="${startBounds.height}" /></bpmndi:BPMNShape>`,
    );
    nodeShapes.push(
      `<bpmndi:BPMNShape id="${endId}_di" bpmnElement="${endId}"><dc:Bounds x="${Math.round(endBounds.x)}" y="${Math.round(endBounds.y)}" width="${endBounds.width}" height="${endBounds.height}" /></bpmndi:BPMNShape>`,
    );

    for (let t = 1; t <= tasksPerPool; t += 1) {
      const taskId = taskIds[t - 1];
      const laneId = laneIds[(t - 1) % laneIds.length];
      const bounds = {
        x: participantInnerX + 200 + (t - 1) * taskDx,
        y: laneCenterY(laneId) - 40,
        width: 140,
        height: 80,
      };
      boundsByElement.set(taskId, bounds);
      nodeShapes.push(
        `<bpmndi:BPMNShape id="${taskId}_di" bpmnElement="${taskId}"><dc:Bounds x="${Math.round(bounds.x)}" y="${Math.round(bounds.y)}" width="${bounds.width}" height="${bounds.height}" /></bpmndi:BPMNShape>`,
      );
    }

    for (const f of flowDefs) {
      const sourceBounds = boundsByElement.get(f.sourceRef);
      const targetBounds = boundsByElement.get(f.targetRef);
      if (!sourceBounds || !targetBounds) continue;
      const points = waypointPath(sourceBounds, targetBounds)
        .map((pt) => `<di:waypoint x="${pt.x}" y="${pt.y}" />`)
        .join("");
      flowEdges.push(`<bpmndi:BPMNEdge id="${f.id}_di" bpmnElement="${f.id}">${points}</bpmndi:BPMNEdge>`);
    }

    for (let a = 1; a <= annotationsPerPool; a += 1) {
      const targetTask = taskIds[(a - 1) % taskIds.length];
      const annotationId = `TextAnnotation_${p}_${a}`;
      const associationId = `Association_${p}_${a}`;
      const taskBounds = boundsByElement.get(targetTask);
      if (!taskBounds) continue;
      const annBounds = {
        x: Number(taskBounds.x || 0) + 20,
        y: participantY - 52 - ((a - 1) % 2) * 32,
        width: 150,
        height: 48,
      };
      boundsByElement.set(annotationId, annBounds);
      annotationShapes.push(
        `<bpmndi:BPMNShape id="${annotationId}_di" bpmnElement="${annotationId}"><dc:Bounds x="${Math.round(annBounds.x)}" y="${Math.round(annBounds.y)}" width="${annBounds.width}" height="${annBounds.height}" /></bpmndi:BPMNShape>`,
      );

      const sourcePoint = {
        x: Math.round(Number(taskBounds.x || 0) + Number(taskBounds.width || 0) / 2),
        y: Math.round(Number(taskBounds.y || 0)),
      };
      const targetPoint = {
        x: Math.round(Number(annBounds.x || 0)),
        y: Math.round(Number(annBounds.y || 0) + Number(annBounds.height || 0) / 2),
      };
      associationEdges.push(
        `<bpmndi:BPMNEdge id="${associationId}_di" bpmnElement="${associationId}"><di:waypoint x="${sourcePoint.x}" y="${sourcePoint.y}" /><di:waypoint x="${targetPoint.x}" y="${targetPoint.y}" /></bpmndi:BPMNEdge>`,
      );
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    ${participantRefs.join("\n    ")}
  </bpmn:collaboration>
  ${processChunks.join("\n  ")}
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      ${participantShapes.join("\n      ")}
      ${laneShapes.join("\n      ")}
      ${nodeShapes.join("\n      ")}
      ${annotationShapes.join("\n      ")}
      ${flowEdges.join("\n      ")}
      ${associationEdges.join("\n      ")}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

  return xml;
}

export function makeMatrixCases() {
  return [
    {
      id: "chain_01",
      sequence: ["Diagram", "XML", "Diagram", "Interview", "Diagram"],
    },
    {
      id: "chain_02",
      sequence: ["Diagram", "Interview", "XML", "Diagram", "XML", "Diagram"],
    },
    {
      id: "chain_03",
      sequence: ["Diagram", "XML", "Interview", "Diagram", "Interview", "XML", "Diagram"],
    },
  ];
}

export function hasDiMarkers(xmlText) {
  const xml = String(xmlText || "");
  return xml.includes("<bpmndi:BPMNShape") && xml.includes("<bpmndi:BPMNEdge");
}

export async function makeBigDiagramXmlOptional(options = {}) {
  const endpoint = String(process.env.E2E_BPMN_MCP_URL || "").trim();
  const localXml = makeBigDiagramXml(options);
  if (!endpoint) {
    return {
      xml: localXml,
      source: "local",
    };
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "big_bpmn_fixture",
        options,
      }),
    });
    if (!response.ok) {
      return {
        xml: localXml,
        source: "local_fallback",
      };
    }
    const body = await response.json().catch(() => ({}));
    const xml = String(body?.xml || "");
    if (!xml.trim() || !hasDiMarkers(xml)) {
      return {
        xml: localXml,
        source: "local_fallback",
      };
    }
    return {
      xml,
      source: "mcp",
    };
  } catch {
    return {
      xml: localXml,
      source: "local_fallback",
    };
  }
}

export { fnv1aHex };
