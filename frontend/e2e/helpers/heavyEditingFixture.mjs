// Фикстура контура fix/canvas-250-editing-performance:
// валидный BPMN XML с 250+ элементами (pools/lanes/tasks/gateways/flows).
//
// Структура: 1 participant, 4 lanes, на lane цепочка:
//   start → 26 tasks (после каждых 5 — exclusiveGateway) → end
// Итого: 136 flow nodes + 128 sequence flows + 4 lanes + 1 participant = 269.

function escAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function makeHeavyEditingDiagramXml({ lanes = 4, tasksPerLane = 26 } = {}) {
  const participantId = "Participant_1";
  const processId = "Process_1";
  const participantX = 60;
  const participantY = 60;
  const laneHeight = 140;
  const participantHeight = lanes * laneHeight;
  const chainStep = 170;
  const firstX = 200;

  const laneXmlList = [];
  const nodeXmlList = [];
  const flowXmlList = [];
  const laneShapeList = [];
  const nodeShapeList = [];
  const edgeShapeList = [];

  for (let l = 0; l < lanes; l += 1) {
    const laneId = `Lane_${l + 1}`;
    const cy = participantY + l * laneHeight + 70;

    const chain = [];
    const bounds = new Map();
    const startId = `StartEvent_${l + 1}`;
    const endId = `EndEvent_${l + 1}`;
    bounds.set(startId, { x: firstX, y: cy - 18, w: 36, h: 36 });
    bounds.set(endId, { x: firstX + chainStep * (tasksPerLane + 6), y: cy - 18, w: 36, h: 36 });
    chain.push({ id: startId, kind: "start" });
    for (let t = 1; t <= tasksPerLane; t += 1) {
      const taskId = `Task_${l + 1}_${t}`;
      chain.push({ id: taskId, kind: "task" });
      bounds.set(taskId, { x: firstX + chainStep * (chain.length - 1), y: cy - 40, w: 120, h: 80 });
      if (t % 5 === 0 && t < tasksPerLane) {
        const gwId = `Gateway_${l + 1}_${t / 5}`;
        chain.push({ id: gwId, kind: "gateway" });
        bounds.set(gwId, { x: firstX + chainStep * (chain.length - 1), y: cy - 25, w: 50, h: 50 });
      }
    }
    chain.push({ id: endId, kind: "end" });

    const refs = chain.map((n) => `<bpmn:flowNodeRef>${n.id}</bpmn:flowNodeRef>`).join("");
    laneXmlList.push(`<bpmn:lane id="${laneId}" name="Линия ${l + 1}">${refs}</bpmn:lane>`);
    laneShapeList.push(
      `<bpmndi:BPMNShape id="${laneId}_di" bpmnElement="${laneId}" isHorizontal="true"><dc:Bounds x="${participantX + 30}" y="${participantY + l * laneHeight}" width="${firstX + chainStep * (tasksPerLane + 6) + 210}" height="${laneHeight}" /></bpmndi:BPMNShape>`,
    );

    for (let i = 0; i < chain.length; i += 1) {
      const node = chain[i];
      if (node.kind === "task") {
        nodeXmlList.push(`<bpmn:task id="${node.id}" name="${escAttr(`Задача ${l + 1}.${i}`)}" />`);
      } else if (node.kind === "gateway") {
        nodeXmlList.push(`<bpmn:exclusiveGateway id="${node.id}" name="${escAttr(`Шлюз ${l + 1}.${i}`)}" />`);
      } else if (node.kind === "start") {
        nodeXmlList.push(`<bpmn:startEvent id="${node.id}" name="${escAttr(`Старт ${l + 1}`)}" />`);
      } else {
        nodeXmlList.push(`<bpmn:endEvent id="${node.id}" name="${escAttr(`Финиш ${l + 1}`)}" />`);
      }
      const b = bounds.get(node.id);
      nodeShapeList.push(
        `<bpmndi:BPMNShape id="${node.id}_di" bpmnElement="${node.id}"><dc:Bounds x="${Math.round(b.x)}" y="${Math.round(b.y)}" width="${b.w}" height="${b.h}" /></bpmndi:BPMNShape>`,
      );
      if (i > 0) {
        const prev = chain[i - 1];
        const flowId = `Flow_${l + 1}_${i}`;
        flowXmlList.push(`<bpmn:sequenceFlow id="${flowId}" sourceRef="${prev.id}" targetRef="${node.id}" />`);
        const sb = bounds.get(prev.id);
        const tb = bounds.get(node.id);
        edgeShapeList.push(
          `<bpmndi:BPMNEdge id="${flowId}_di" bpmnElement="${flowId}"><di:waypoint x="${Math.round(sb.x + sb.w)}" y="${Math.round(sb.y + sb.h / 2)}" /><di:waypoint x="${Math.round(tb.x)}" y="${Math.round(tb.y + tb.h / 2)}" /></bpmndi:BPMNEdge>`,
        );
      }
    }
  }

  const width = firstX + chainStep * (tasksPerLane + 6) + 240;
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_heavy_editing"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="${participantId}" name="Heavy Pool" processRef="${processId}" />
  </bpmn:collaboration>
  <bpmn:process id="${processId}" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">${laneXmlList.join("")}</bpmn:laneSet>
    ${nodeXmlList.join("")}
    ${flowXmlList.join("")}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="${participantId}_di" bpmnElement="${participantId}" isHorizontal="true"><dc:Bounds x="${participantX}" y="${participantY}" width="${width}" height="${participantHeight}" /></bpmndi:BPMNShape>
      ${laneShapeList.join("")}
      ${nodeShapeList.join("")}
      ${edgeShapeList.join("")}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}
