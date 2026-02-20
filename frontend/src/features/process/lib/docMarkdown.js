import { normalizeElementNotesMap } from "../../notes/elementNotes";

function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeLoose(value) {
  return toText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function mdCell(value) {
  const raw = toText(value).replaceAll("|", "\\|").replace(/\s+/g, " ");
  return raw || "—";
}

function oneLine(value) {
  return toText(value).replace(/\s+/g, " ");
}

function xmlLocalName(node) {
  const local = toText(node?.localName);
  if (local) return local.toLowerCase();
  const nodeName = toText(node?.nodeName);
  if (!nodeName) return "";
  return nodeName.split(":").pop().toLowerCase();
}

function getElementsByLocalNames(root, names) {
  if (!root || typeof root.getElementsByTagName !== "function") return [];
  const nameSet = new Set(toArray(names).map((x) => normalizeLoose(x)));
  if (!nameSet.size) return [];
  return Array.from(root.getElementsByTagName("*")).filter((el) => nameSet.has(xmlLocalName(el)));
}

function findAncestorByLocalName(node, name) {
  const expected = normalizeLoose(name);
  let cur = node?.parentElement || null;
  while (cur) {
    if (xmlLocalName(cur) === expected) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function humanBpmnType(localType) {
  const key = normalizeLoose(localType);
  const labels = {
    task: "Task",
    usertask: "UserTask",
    servicetask: "ServiceTask",
    sendtask: "SendTask",
    receivetask: "ReceiveTask",
    manualtask: "ManualTask",
    scripttask: "ScriptTask",
    businessruletask: "BusinessRuleTask",
    callactivity: "CallActivity",
    subprocess: "SubProcess",
    startevent: "StartEvent",
    endevent: "EndEvent",
    intermediatecatchevent: "IntermediateCatchEvent",
    intermediatethrowevent: "IntermediateThrowEvent",
    boundaryevent: "BoundaryEvent",
    exclusivegateway: "ExclusiveGateway",
    parallelgateway: "ParallelGateway",
    inclusivegateway: "InclusiveGateway",
    eventbasedgateway: "EventBasedGateway",
    complexgateway: "ComplexGateway",
  };
  return labels[key] || localType || "Element";
}

const BPMN_NODE_LOCAL_NAMES = [
  "task",
  "usertask",
  "servicetask",
  "sendtask",
  "receivetask",
  "manualtask",
  "scripttask",
  "businessruletask",
  "callactivity",
  "subprocess",
  "startevent",
  "endevent",
  "intermediatecatchevent",
  "intermediatethrowevent",
  "boundaryevent",
  "exclusivegateway",
  "parallelgateway",
  "inclusivegateway",
  "eventbasedgateway",
  "complexgateway",
];

function parseBpmnArtifacts(xmlText) {
  const raw = toText(xmlText);
  const empty = {
    nodes: [],
    nodeById: {},
    flows: [],
    lanes: [],
    pools: [],
    annotationsByTarget: {},
    unboundAnnotations: [],
  };
  if (!raw || typeof DOMParser === "undefined") return empty;

  let doc;
  try {
    doc = new DOMParser().parseFromString(raw, "application/xml");
  } catch {
    return empty;
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return empty;

  const processNameById = {};
  getElementsByLocalNames(doc, ["process"]).forEach((processEl, idx) => {
    const processId = toText(processEl.getAttribute("id")) || `process_${idx + 1}`;
    const processName = toText(processEl.getAttribute("name")) || processId;
    processNameById[processId] = processName;
  });

  const pools = [];
  const poolsByProcessId = {};
  getElementsByLocalNames(doc, ["participant"]).forEach((participantEl, idx) => {
    const processRef = toText(participantEl.getAttribute("processRef"));
    if (!processRef) return;
    const poolId = toText(participantEl.getAttribute("id")) || `pool_${idx + 1}`;
    const poolName =
      toText(participantEl.getAttribute("name"))
      || toText(processNameById[processRef])
      || poolId;
    const row = {
      poolId,
      poolName,
      processId: processRef,
      order: idx + 1,
    };
    pools.push(row);
    if (!poolsByProcessId[processRef]) poolsByProcessId[processRef] = [];
    poolsByProcessId[processRef].push(row);
  });

  const lanes = [];
  const laneByNodeId = {};
  getElementsByLocalNames(doc, ["lane"]).forEach((laneEl, idx) => {
    const processEl = findAncestorByLocalName(laneEl, "process");
    const processId = toText(processEl?.getAttribute("id"));
    const poolRow = toArray(poolsByProcessId[processId])[0] || null;
    const laneId = toText(laneEl.getAttribute("id")) || `lane_${idx + 1}`;
    const laneName =
      toText(laneEl.getAttribute("name"))
      || laneId;
    const nodeIds = getElementsByLocalNames(laneEl, ["flowNodeRef"])
      .map((refEl) => toText(refEl.textContent))
      .filter(Boolean);
    const laneRow = {
      laneId,
      laneName,
      processId,
      poolId: toText(poolRow?.poolId),
      poolName: toText(poolRow?.poolName),
      nodeIds,
      order: idx + 1,
    };
    lanes.push(laneRow);
    nodeIds.forEach((nodeId) => {
      if (!laneByNodeId[nodeId]) laneByNodeId[nodeId] = laneRow;
    });
  });

  const nodeById = {};
  const nodes = [];
  getElementsByLocalNames(doc, BPMN_NODE_LOCAL_NAMES).forEach((nodeEl, idx) => {
    const nodeId = toText(nodeEl.getAttribute("id"));
    if (!nodeId || nodeById[nodeId]) return;
    const processEl = findAncestorByLocalName(nodeEl, "process");
    const processId = toText(processEl?.getAttribute("id"));
    const laneRow = laneByNodeId[nodeId] || null;
    const poolRow =
      laneRow
      || toArray(poolsByProcessId[processId])[0]
      || null;
    const localType = xmlLocalName(nodeEl);
    const row = {
      id: nodeId,
      name: toText(nodeEl.getAttribute("name")) || nodeId,
      type: humanBpmnType(localType),
      typeRaw: localType,
      processId,
      laneId: toText(laneRow?.laneId),
      laneName: toText(laneRow?.laneName),
      poolId: toText(poolRow?.poolId),
      poolName: toText(poolRow?.poolName),
      order: idx + 1,
    };
    nodeById[nodeId] = row;
    nodes.push(row);
  });

  const flows = getElementsByLocalNames(doc, ["sequenceflow"]).map((flowEl, idx) => {
    const id = toText(flowEl.getAttribute("id")) || `flow_${idx + 1}`;
    const sourceRef = toText(flowEl.getAttribute("sourceRef"));
    const targetRef = toText(flowEl.getAttribute("targetRef"));
    const label = toText(flowEl.getAttribute("name"));
    const conditionEl = getElementsByLocalNames(flowEl, ["conditionExpression"])[0];
    const condition = toText(conditionEl?.textContent);
    return {
      id,
      sourceRef,
      targetRef,
      label,
      condition,
      order: idx + 1,
    };
  }).filter((flow) => flow.sourceRef && flow.targetRef);

  const annotationById = {};
  let annotationOrder = 0;
  getElementsByLocalNames(doc, ["textannotation"]).forEach((annEl) => {
    const annotationId = toText(annEl.getAttribute("id"));
    if (!annotationId) return;
    const textEl = getElementsByLocalNames(annEl, ["text"])[0];
    const text = toText(textEl?.textContent);
    if (!text) return;
    annotationOrder += 1;
    annotationById[annotationId] = {
      annotationId,
      text,
      createdOrder: annotationOrder,
    };
  });

  const annotationsByTarget = {};
  const annotationBoundIds = new Set();
  const seenBinding = new Set();
  function bindAnnotation(targetElementId, annotation, associationId) {
    const targetId = toText(targetElementId);
    const annId = toText(annotation?.annotationId);
    const text = toText(annotation?.text);
    if (!targetId || !annId || !text) return;
    const key = `${targetId}::${annId}`;
    if (seenBinding.has(key)) return;
    seenBinding.add(key);
    annotationBoundIds.add(annId);
    if (!annotationsByTarget[targetId]) annotationsByTarget[targetId] = [];
    annotationsByTarget[targetId].push({
      annotationId: annId,
      text,
      createdOrder: Number(annotation?.createdOrder) || 0,
      associationId: toText(associationId),
    });
  }

  getElementsByLocalNames(doc, ["association"]).forEach((assocEl, idx) => {
    const sourceRef = toText(assocEl.getAttribute("sourceRef"));
    const targetRef = toText(assocEl.getAttribute("targetRef"));
    if (!sourceRef || !targetRef) return;
    const associationId = toText(assocEl.getAttribute("id")) || `assoc_${idx + 1}`;
    const sourceAnnotation = annotationById[sourceRef];
    const targetAnnotation = annotationById[targetRef];
    if (sourceAnnotation && !annotationById[targetRef]) {
      bindAnnotation(targetRef, sourceAnnotation, associationId);
    }
    if (targetAnnotation && !annotationById[sourceRef]) {
      bindAnnotation(sourceRef, targetAnnotation, associationId);
    }
  });

  Object.keys(annotationsByTarget).forEach((targetId) => {
    annotationsByTarget[targetId].sort((a, b) => {
      const ao = Number(a?.createdOrder) || 0;
      const bo = Number(b?.createdOrder) || 0;
      if (ao !== bo) return ao - bo;
      return toText(a?.annotationId).localeCompare(toText(b?.annotationId), "ru");
    });
  });

  const unboundAnnotations = Object.values(annotationById)
    .filter((annotation) => !annotationBoundIds.has(annotation.annotationId))
    .sort((a, b) => {
      const ao = Number(a?.createdOrder) || 0;
      const bo = Number(b?.createdOrder) || 0;
      if (ao !== bo) return ao - bo;
      return toText(a?.annotationId).localeCompare(toText(b?.annotationId), "ru");
    });

  return {
    nodes,
    nodeById,
    flows,
    lanes,
    pools: pools.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    annotationsByTarget,
    unboundAnnotations,
  };
}

function normalizeActors(actorsRaw) {
  return toArray(actorsRaw)
    .map((actor, index) => {
      const row = asObject(actor);
      const actorId = toText(row.actorId || row.id);
      const poolName = toText(row.poolName || row.pool_name || row.poolId || row.pool_id);
      const laneName = toText(row.name || row.laneName || row.lane_name || row.laneId || row.lane_id);
      if (!actorId && !laneName && !poolName) return null;
      return {
        actorId: actorId || `actor_${index + 1}`,
        poolName: poolName || "—",
        laneName: laneName || "—",
        order: toNumber(row.order, index + 1),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      if (a.poolName !== b.poolName) return a.poolName.localeCompare(b.poolName, "ru");
      if (a.laneName !== b.laneName) return a.laneName.localeCompare(b.laneName, "ru");
      return a.actorId.localeCompare(b.actorId, "ru");
    });
}

function normalizeActorsFromArtifacts(actorsRaw, artifacts) {
  const normalized = normalizeActors(actorsRaw);
  if (normalized.length) return normalized;
  return toArray(artifacts?.lanes)
    .map((lane, index) => ({
      actorId: toText(lane?.laneId) || `actor_${index + 1}`,
      poolName: toText(lane?.poolName) || "—",
      laneName: toText(lane?.laneName) || "—",
      order: Number(lane?.order || index + 1),
    }))
    .filter((x) => x.laneName !== "—");
}

function normalizeSteps(interviewRaw) {
  const interview = asObject(interviewRaw);
  return toArray(interview.steps)
    .map((step, index) => {
      const row = asObject(step);
      const seq = toNumber(row.seq, index + 1);
      const id = toText(row.id) || `step_${index + 1}`;
      const nodeId = toText(row.node_bind_id || row.node_id || row.nodeId || row.nodeBindId);
      return {
        idx: index,
        id,
        seq,
        tPlus: toText(row.t_plus),
        lane: toText(row.lane_name || row.role || row.area),
        type: toText(row.type),
        action: toText(row.action || row.title || row.name),
        nodeId,
        subprocess: toText(row.subprocess || row.subprocess_name),
      };
    })
    .sort((a, b) => {
      if (a.seq !== b.seq) return a.seq - b.seq;
      if (a.idx !== b.idx) return a.idx - b.idx;
      return a.id.localeCompare(b.id, "ru");
    });
}

function collectSubprocesses(interviewRaw, steps) {
  const interview = asObject(interviewRaw);
  const byName = new Map();
  function add(nameRaw, seqValue = null) {
    const name = toText(nameRaw);
    if (!name) return;
    if (!byName.has(name)) byName.set(name, { name, count: 0, seq: [] });
    const entry = byName.get(name);
    entry.count += 1;
    if (Number.isFinite(Number(seqValue)) && Number(seqValue) > 0) entry.seq.push(Number(seqValue));
  }
  toArray(interview.subprocesses).forEach((name) => add(name, null));
  toArray(steps).forEach((step) => add(step.subprocess, step.seq));
  return Array.from(byName.values())
    .map((entry) => ({
      ...entry,
      seq: Array.from(new Set(entry.seq)).sort((a, b) => a - b),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function buildNodeTitleById(draft, artifacts) {
  const map = {};
  toArray(artifacts?.nodes).forEach((node) => {
    const id = toText(node?.id);
    if (!id) return;
    map[id] = toText(node?.name || id);
  });
  toArray(draft?.nodes).forEach((node) => {
    const row = asObject(node);
    const id = toText(row.id);
    if (!id) return;
    const title = toText(row.title || row.name || row.label || id);
    if (!map[id]) map[id] = title;
  });
  return map;
}

function collectNotesSections(draft, steps, nodeTitleById) {
  const notesMap = normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId);
  const stepByNodeId = {};
  toArray(steps).forEach((step) => {
    const nodeId = toText(step.nodeId);
    if (!nodeId || stepByNodeId[nodeId]) return;
    stepByNodeId[nodeId] = step;
  });
  return Object.keys(notesMap)
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((elementId) => {
      const entry = asObject(notesMap[elementId]);
      const items = toArray(entry.items)
        .map((item, index) => {
          const row = asObject(item);
          return {
            id: toText(row.id) || `note_${index + 1}`,
            text: toText(row.text || row.note),
            createdAt: toNumber(row.createdAt || row.created_at, 0),
          };
        })
        .filter((item) => item.text)
        .sort((a, b) => {
          if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
          return a.id.localeCompare(b.id, "ru");
        });
      if (!items.length) return null;
      const step = stepByNodeId[elementId];
      const fallbackTitle = step ? step.action : "";
      const title = toText(nodeTitleById[elementId] || fallbackTitle || elementId);
      return {
        elementId,
        title,
        items,
      };
    })
    .filter(Boolean);
}

function buildFlowBuckets(flows) {
  const incomingByNode = {};
  const outgoingByNode = {};
  toArray(flows).forEach((flow) => {
    const sourceId = toText(flow?.sourceRef);
    const targetId = toText(flow?.targetRef);
    if (sourceId && targetId) {
      if (!outgoingByNode[sourceId]) outgoingByNode[sourceId] = [];
      if (!incomingByNode[targetId]) incomingByNode[targetId] = [];
      outgoingByNode[sourceId].push(flow);
      incomingByNode[targetId].push(flow);
    }
  });
  return { incomingByNode, outgoingByNode };
}

function dedupAnnotations(list) {
  const seen = new Set();
  const out = [];
  toArray(list).forEach((item, index) => {
    const row = asObject(item);
    const annId = toText(row.annotationId) || `annotation_${index + 1}`;
    const text = toText(row.text);
    if (!text) return;
    const key = `${annId}::${normalizeLoose(text)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      annotationId: annId,
      text,
      associationId: toText(row.associationId),
      createdOrder: Number(row.createdOrder || index + 1),
    });
  });
  return out.sort((a, b) => {
    const ao = Number(a?.createdOrder || 0);
    const bo = Number(b?.createdOrder || 0);
    if (ao !== bo) return ao - bo;
    return toText(a?.annotationId).localeCompare(toText(b?.annotationId), "ru");
  });
}

export function buildSessionDocMarkdown({ sessionId, draft }) {
  const d = asObject(draft);
  const sid = toText(sessionId || d.id || d.session_id) || "—";
  const processTitle = toText(d.title || d.name) || "Без названия";
  const bpmnXml = toText(d.bpmn_xml || d.bpmnXml);
  const artifacts = parseBpmnArtifacts(bpmnXml);
  const actors = normalizeActorsFromArtifacts(d.actors_derived, artifacts);
  const steps = normalizeSteps(d.interview);
  const subprocesses = collectSubprocesses(d.interview, steps);
  const nodeTitleById = buildNodeTitleById(d, artifacts);
  const notes = collectNotesSections(d, steps, nodeTitleById);
  const annotationsByTarget = artifacts.annotationsByTarget || {};
  const { incomingByNode, outgoingByNode } = buildFlowBuckets(artifacts.flows);
  const updatedAt = toText(d.updated_at || d.updatedAt || d.modified_at || d.modifiedAt);

  const lines = [];
  lines.push("# Документ процесса");
  lines.push("");
  lines.push(`- Процесс: ${processTitle}`);
  lines.push(`- Сессия: ${sid}`);
  if (updatedAt) lines.push(`- Обновлено: ${updatedAt}`);
  lines.push(`- BPMN-узлов: ${toArray(artifacts.nodes).length}`);
  lines.push(`- Переходов BPMN: ${toArray(artifacts.flows).length}`);
  lines.push(`- Аннотаций BPMN: ${Object.values(annotationsByTarget).reduce((sum, list) => sum + toArray(list).length, 0) + toArray(artifacts.unboundAnnotations).length}`);
  lines.push(`- Акторов (pool/lane): ${actors.length}`);
  lines.push(`- Шагов Interview: ${steps.length}`);
  lines.push(`- Подпроцессов: ${subprocesses.length}`);
  lines.push(`- Разделов с заметками: ${notes.length}`);
  lines.push("");

  lines.push("## Акторы (пулы и лайны)");
  if (!actors.length) {
    lines.push("- Пока нет акторов, полученных из BPMN.");
  } else {
    lines.push("| # | Пул | Лайн | ID актора |");
    lines.push("|---:|---|---|---|");
    actors.forEach((actor, index) => {
      lines.push(`| ${index + 1} | ${mdCell(actor.poolName)} | ${mdCell(actor.laneName)} | ${mdCell(actor.actorId)} |`);
    });
  }
  lines.push("");

  lines.push("## Узлы BPMN");
  if (!toArray(artifacts.nodes).length) {
    lines.push("- Узлы BPMN не найдены.");
  } else {
    lines.push("| # | ID | Тип | Название | Лайн | Пул |");
    lines.push("|---:|---|---|---|---|---|");
    toArray(artifacts.nodes)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      .forEach((node, index) => {
        lines.push(
          `| ${index + 1} | ${mdCell(node.id)} | ${mdCell(node.type)} | ${mdCell(node.name)} | ${mdCell(node.laneName)} | ${mdCell(node.poolName)} |`,
        );
      });
  }
  lines.push("");

  lines.push("## Переходы BPMN (sequenceFlow)");
  if (!toArray(artifacts.flows).length) {
    lines.push("- Переходы BPMN не найдены.");
  } else {
    lines.push("| # | From | To | Условие/подпись | ID |");
    lines.push("|---:|---|---|---|---|");
    toArray(artifacts.flows).forEach((flow, index) => {
      const fromTitle = toText(nodeTitleById[flow.sourceRef] || flow.sourceRef);
      const toTitle = toText(nodeTitleById[flow.targetRef] || flow.targetRef);
      const conditionOrLabel = toText(flow.condition || flow.label);
      lines.push(
        `| ${index + 1} | ${mdCell(`${fromTitle} (${flow.sourceRef})`)} | ${mdCell(`${toTitle} (${flow.targetRef})`)} | ${mdCell(conditionOrLabel || "—")} | ${mdCell(flow.id)} |`,
      );
    });
  }
  lines.push("");

  lines.push("## Шаги (Interview + BPMN)");
  if (!steps.length) {
    lines.push("- Шаги интервью пока не заполнены.");
  } else {
    steps.forEach((step) => {
      const stepTitle = oneLine(step.action) || "Без названия";
      const nodeId = toText(step.nodeId);
      const nodeTitle = toText(nodeTitleById[nodeId] || nodeId || "—");
      const incoming = toArray(incomingByNode[nodeId]);
      const outgoing = toArray(outgoingByNode[nodeId]);
      const stepAnnotations = dedupAnnotations(annotationsByTarget[nodeId]);
      lines.push(`### Шаг ${step.seq}. ${stepTitle}`);
      lines.push(`- Лайн/актор: ${toText(step.lane) || "—"}`);
      lines.push(`- Тип шага: ${toText(step.type) || "—"}`);
      lines.push(`- BPMN-узел: ${nodeId ? `${nodeTitle} (${nodeId})` : "—"}`);
      lines.push(`- Подпроцесс: ${toText(step.subprocess) || "—"}`);
      lines.push(`- T+: ${toText(step.tPlus) || "—"}`);
      if (incoming.length) {
        lines.push(`- Входящие переходы (${incoming.length}):`);
        incoming.forEach((flow) => {
          const sourceTitle = toText(nodeTitleById[flow.sourceRef] || flow.sourceRef);
          const conditionOrLabel = toText(flow.condition || flow.label);
          lines.push(`  - ${sourceTitle} -> ${nodeTitle}${conditionOrLabel ? ` [${conditionOrLabel}]` : ""}`);
        });
      } else {
        lines.push("- Входящие переходы: —");
      }
      if (outgoing.length) {
        lines.push(`- Исходящие переходы (${outgoing.length}):`);
        outgoing.forEach((flow) => {
          const targetTitle = toText(nodeTitleById[flow.targetRef] || flow.targetRef);
          const conditionOrLabel = toText(flow.condition || flow.label);
          lines.push(`  - ${nodeTitle} -> ${targetTitle}${conditionOrLabel ? ` [${conditionOrLabel}]` : ""}`);
        });
      } else {
        lines.push("- Исходящие переходы: —");
      }
      if (stepAnnotations.length) {
        lines.push(`- Аннотации BPMN (${stepAnnotations.length}):`);
        stepAnnotations.forEach((annotation, index) => {
          lines.push(`  ${index + 1}. ${oneLine(annotation.text)}`);
        });
      } else {
        lines.push("- Аннотации BPMN: —");
      }
      lines.push("");
    });
  }

  lines.push("## Подпроцессы");
  if (!subprocesses.length) {
    lines.push("- Подпроцессы не указаны.");
  } else {
    subprocesses.forEach((subprocess, index) => {
      const seq = subprocess.seq.length ? subprocess.seq.join(", ") : "—";
      lines.push(`${index + 1}. ${subprocess.name} (шагов: ${subprocess.count}, seq: ${seq})`);
    });
  }
  lines.push("");

  lines.push("## Аннотации BPMN по узлам");
  const boundTargets = Object.keys(annotationsByTarget)
    .sort((a, b) => {
      const ao = Number(asObject(artifacts.nodeById[a]).order || Number.MAX_SAFE_INTEGER);
      const bo = Number(asObject(artifacts.nodeById[b]).order || Number.MAX_SAFE_INTEGER);
      if (ao !== bo) return ao - bo;
      return a.localeCompare(b, "ru");
    });
  if (!boundTargets.length) {
    lines.push("- Привязанных аннотаций нет.");
  } else {
    boundTargets.forEach((targetId) => {
      const title = toText(nodeTitleById[targetId] || targetId);
      const annotations = dedupAnnotations(annotationsByTarget[targetId]);
      lines.push(`### ${title} (${targetId})`);
      annotations.forEach((annotation, index) => {
        lines.push(`${index + 1}. ${annotation.text}`);
      });
      lines.push("");
    });
  }

  lines.push("## Глобальные аннотации BPMN (без привязки)");
  const unbound = dedupAnnotations(artifacts.unboundAnnotations);
  if (!unbound.length) {
    lines.push("- Нет аннотаций без привязки.");
  } else {
    unbound.forEach((annotation, index) => {
      lines.push(`${index + 1}. ${annotation.text} (${annotation.annotationId})`);
    });
  }
  lines.push("");

  lines.push("## Заметки по BPMN-элементам");
  if (!notes.length) {
    lines.push("- Заметки по элементам пока отсутствуют.");
  } else {
    notes.forEach((section) => {
      lines.push(`### ${section.title} (${section.elementId})`);
      section.items.forEach((note, index) => {
        lines.push(`${index + 1}. ${note.text}`);
      });
      lines.push("");
    });
  }

  return lines.join("\n").trim();
}
