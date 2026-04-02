function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function toLower(value) {
  return toText(value).toLowerCase();
}

function toInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeTier(rawTier) {
  const tier = toText(rawTier).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "";
}

function round1(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function isFilled(value) {
  return value !== null && value !== undefined && toText(value) !== "";
}

function makeExplainability({
  code,
  label,
  description,
  whatChecked,
  howCalculated,
  source,
  impact,
  severity = "info",
  isBlocking = false,
  isCanonical = null,
  kind = "",
}) {
  return {
    code: toText(code),
    label: toText(label),
    description: toText(description),
    whatChecked: toText(whatChecked),
    howCalculated: toText(howCalculated),
    source: toText(source),
    impact: toText(impact),
    severity: toText(severity || "info"),
    isBlocking: !!isBlocking,
    isCanonical: typeof isCanonical === "boolean" ? isCanonical : null,
    kind: toText(kind || ""),
  };
}

function sectionStatus({ percent, blockersCount }) {
  if (blockersCount > 0) return "Warning";
  if (percent >= 95) return "OK";
  if (percent >= 75) return "Warning";
  if (percent >= 45) return "Partial";
  return "Weak";
}

function summarizeSignals(signalsRaw) {
  const signals = asArray(signalsRaw).map((row) => asObject(row));
  const totalWeight = signals.reduce((sum, signal) => {
    const weight = Number(signal.weight);
    return sum + (Number.isFinite(weight) && weight > 0 ? weight : 1);
  }, 0);
  const passWeight = signals.reduce((sum, signal) => {
    const weight = Number(signal.weight);
    const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 1;
    const score = Number(signal.score);
    if (Number.isFinite(score)) {
      const normalized = Math.max(0, Math.min(100, score)) / 100;
      return sum + (safeWeight * normalized);
    }
    return sum + (signal.pass ? safeWeight : 0);
  }, 0);
  const percent = totalWeight > 0 ? clampPercent((passWeight / totalWeight) * 100) : 0;
  const blockersCount = signals.filter((signal) => signal.pass === false && signal.isBlocking === true).length;
  const failedSignals = signals.filter((signal) => signal.pass === false);
  return {
    percent,
    blockersCount,
    failedSignals,
  };
}

function pickAutoPassStatus({ autoPassResult, autoPassJobState }) {
  const jobStatus = toLower(asObject(autoPassJobState).status);
  if (jobStatus && jobStatus !== "idle") return jobStatus;
  const result = asObject(autoPassResult);
  return toLower(result?.status || result?.job_status);
}

function readNodeEquipmentCount(nodeRaw) {
  const node = asObject(nodeRaw);
  const direct = asArray(node?.equipment);
  if (direct.length > 0) return direct.length;
  const params = asObject(node?.parameters);
  const fromParams = asArray(params?.equipment);
  if (fromParams.length > 0) return fromParams.length;
  if (isFilled(params?.equipment)) return 1;
  return 0;
}

function hasDispositionData(nodeRaw) {
  const node = asObject(nodeRaw);
  const direct = asObject(node?.disposition);
  const nested = asObject(asObject(node?.parameters)?.disposition);
  return Object.keys(direct).length > 0 || Object.keys(nested).length > 0;
}

function hasLossData(nodeRaw) {
  const node = asObject(nodeRaw);
  const params = asObject(node?.parameters);
  const disposition = asObject(node?.disposition);
  const nestedDisposition = asObject(params?.disposition);
  return (
    asArray(node?.losses).length > 0
    || asArray(params?.losses).length > 0
    || isFilled(node?.loss)
    || isFilled(node?.loss_type)
    || isFilled(params?.loss)
    || isFilled(params?.loss_type)
    || isFilled(disposition?.loss)
    || isFilled(disposition?.loss_type)
    || isFilled(nestedDisposition?.loss)
    || isFilled(nestedDisposition?.loss_type)
  );
}

function normalizeOpenStatus(statusRaw) {
  const status = toLower(statusRaw);
  if (!status) return "open";
  if (status === "done" || status === "resolved" || status === "closed" || status === "ok") return "done";
  return "open";
}

function collectDeletedNodeIds(interviewRaw) {
  const interview = asObject(interviewRaw);
  const out = [];
  const seen = new Set();
  const add = (valueRaw) => {
    const value = toText(valueRaw);
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };
  asArray(interview?.__deleted_node_ids).forEach(add);
  asArray(interview?.deleted_node_ids).forEach(add);
  asArray(interview?.deletedNodeIds).forEach(add);
  return out;
}

function collectAuditEvents(draftRaw) {
  const draft = asObject(draftRaw);
  const audit = asObject(draft?.audit);
  const fromKnownArrays = [
    ...asArray(draft?.audit_events),
    ...asArray(draft?.auditEvents),
    ...asArray(draft?.audit_log),
    ...asArray(draft?.auditLog),
    ...asArray(draft?.audit_trail),
    ...asArray(draft?.auditTrail),
    ...asArray(audit?.events),
    ...asArray(audit?.items),
    ...asArray(audit?.trail),
  ].map((row) => asObject(row));

  const dedup = [];
  const seen = new Set();
  fromKnownArrays.forEach((rowRaw, idx) => {
    const row = asObject(rowRaw);
    const key = toText(row?.id || row?.event_id || row?.key || row?.code || `${idx}:${toText(row?.action)}:${toText(row?.ts)}`);
    if (!key || seen.has(key)) return;
    seen.add(key);
    dedup.push(row);
  });
  return dedup;
}

function hasExplicitAuditContainer(draftRaw) {
  const draft = asObject(draftRaw);
  return (
    Object.prototype.hasOwnProperty.call(draft, "audit_events")
    || Object.prototype.hasOwnProperty.call(draft, "auditEvents")
    || Object.prototype.hasOwnProperty.call(draft, "audit_log")
    || Object.prototype.hasOwnProperty.call(draft, "auditLog")
    || Object.prototype.hasOwnProperty.call(draft, "audit_trail")
    || Object.prototype.hasOwnProperty.call(draft, "auditTrail")
    || Object.prototype.hasOwnProperty.call(draft, "audit")
  );
}

function buildStepCompletenessSection({ snapshot, draft, coverageMatrix }) {
  const interviewSteps = asArray(snapshot?.interview_steps);
  const rawSteps = asArray(asObject(draft).interview?.steps);
  const nodes = asArray(asObject(draft).nodes);
  const nodeById = {};
  nodes.forEach((rawNode) => {
    const node = asObject(rawNode);
    const nodeId = toText(node?.id);
    if (!nodeId) return;
    nodeById[nodeId] = node;
  });

  const stepRawById = {};
  rawSteps.forEach((rawStep) => {
    const step = asObject(rawStep);
    const stepId = toText(step?.id);
    if (!stepId) return;
    stepRawById[stepId] = step;
  });

  const totalSteps = interviewSteps.length;
  const dodScores = interviewSteps
    .map((step) => Number(asObject(step?.dod).score))
    .filter((score) => Number.isFinite(score));
  const avgDodScore = dodScores.length > 0
    ? clampPercent(dodScores.reduce((sum, score) => sum + score, 0) / dodScores.length)
    : 0;
  const stepsWithRequiredMiss = interviewSteps.filter((step) => asArray(asObject(step?.dod).requiredMissingKeys).length > 0);
  const requiredMissingCount = stepsWithRequiredMiss.reduce((sum, step) => {
    return sum + asArray(asObject(step?.dod).requiredMissingKeys).length;
  }, 0);
  const coreScore = clampPercent(avgDodScore - Math.min(30, stepsWithRequiredMiss.length * 5));

  let missingRole = 0;
  let missingEquipment = 0;
  let missingDisposition = 0;
  let missingLoss = 0;
  let dispositionRelevantCount = 0;
  let lossRelevantCount = 0;

  interviewSteps.forEach((stepRaw) => {
    const step = asObject(stepRaw);
    const stepId = toText(step?.step_id || step?.stepId || step?.id);
    const boundNodeId = toText(step?.bpmn_ref || asObject(stepRawById[stepId]).node_id || asObject(stepRawById[stepId]).bpmn_ref);
    const sourceStep = asObject(stepRawById[stepId]);
    const node = asObject(nodeById[boundNodeId]);

    const roleFromStep = toText(sourceStep?.role || sourceStep?.area || sourceStep?.lane_name || step?.lane_name);
    const roleFromNode = toText(node?.actor_role || node?.role);
    if (!roleFromStep && !roleFromNode) missingRole += 1;

    const equipmentFromStep = isFilled(sourceStep?.equipment) || isFilled(sourceStep?.resource) || isFilled(sourceStep?.resources);
    const equipmentFromNode = readNodeEquipmentCount(node) > 0;
    if (!equipmentFromStep && !equipmentFromNode) missingEquipment += 1;

    const dispositionAvailable = hasDispositionData(node);
    if (dispositionAvailable) {
      dispositionRelevantCount += 1;
    } else {
      missingDisposition += 1;
    }

    const lossAvailable = hasLossData(node);
    if (lossAvailable) {
      lossRelevantCount += 1;
    } else {
      missingLoss += 1;
    }
  });

  const roleCoverage = totalSteps > 0 ? clampPercent((1 - (missingRole / totalSteps)) * 100) : 0;
  const equipmentCoverage = totalSteps > 0 ? clampPercent((1 - (missingEquipment / totalSteps)) * 100) : 0;
  const dispositionCoverage = totalSteps > 0 ? clampPercent((1 - (missingDisposition / totalSteps)) * 100) : 0;
  const lossCoverage = totalSteps > 0 ? clampPercent((1 - (missingLoss / totalSteps)) * 100) : 0;
  const hasDispositionOrLossSignals = dispositionRelevantCount > 0 || lossRelevantCount > 0;
  const roleEquipmentScore = hasDispositionOrLossSignals
    ? clampPercent((roleCoverage * 0.35) + (equipmentCoverage * 0.3) + (dispositionCoverage * 0.2) + (lossCoverage * 0.15))
    : clampPercent((roleCoverage * 0.55) + (equipmentCoverage * 0.45));

  const coverage = asObject(coverageMatrix);
  const coverageSummary = asObject(coverage?.summary);
  const coverageTotal = Number(coverageSummary?.total || 0);
  const missingNotes = Number(coverageSummary?.missingNotes || 0);
  const missingAiQuestions = Number(coverageSummary?.missingAiQuestions || 0);
  const missingDurationQuality = Number(coverageSummary?.missingDurationQuality || 0);
  const notesAiScore = coverageTotal > 0
    ? clampPercent((1 - ((missingNotes + missingAiQuestions) / Math.max(1, coverageTotal * 2))) * 100)
    : 100;
  const durationQualityScore = coverageTotal > 0
    ? clampPercent((1 - (missingDurationQuality / Math.max(1, coverageTotal))) * 100)
    : 100;

  const questionsRaw = asArray(asObject(draft).questions);
  const stepValidatorOpen = questionsRaw.filter((qRaw) => {
    const q = asObject(qRaw);
    if (normalizeOpenStatus(q?.status) !== "open") return false;
    const issueType = toLower(q?.issue_type || q?.issueType);
    const textBag = `${issueType} ${toLower(q?.question || q?.text)}`;
    const hasStepNode = !!toText(q?.node_id || q?.nodeId);
    const looksStepRelated = (
      textBag.includes("coverage")
      || textBag.includes("resource")
      || textBag.includes("role")
      || textBag.includes("equipment")
      || textBag.includes("disposition")
      || textBag.includes("loss")
      || textBag.includes("duration")
      || textBag.includes("notes")
      || textBag.includes("ai")
      || textBag.includes("step")
      || textBag.includes("шаг")
    );
    return hasStepNode || looksStepRelated;
  });
  const validatorCriticalCount = stepValidatorOpen.filter((qRaw) => {
    const issueType = toLower(asObject(qRaw)?.issue_type || asObject(qRaw)?.issueType);
    return issueType === "critical";
  }).length;
  const validatorScore = stepValidatorOpen.length <= 0
    ? 100
    : clampPercent(100 - (validatorCriticalCount * 30) - (stepValidatorOpen.length * 4));

  const signals = [
    {
      code: "STEP_001",
      pass: coreScore >= 75,
      score: coreScore,
      weight: 4,
      severity: "warning",
      isBlocking: false,
      issue: totalSteps <= 0
        ? "Шаги интервью не найдены."
        : `Средний core-check: ${avgDodScore}% · шагов с required пропусками: ${stepsWithRequiredMiss.length} (${requiredMissingCount} полей).`,
      where: "Таймлайн / Шаги",
      explainability: makeExplainability({
        code: "STEP_001",
        label: "Core step DoD checks",
        description: "Базовая полнота шага на основе встроенных step DoD checks.",
        whatChecked: "title, incoming/outgoing, duration, lane/notes/AI (по типу узла).",
        howCalculated: "Агрегация `interview_steps[].dod.score` и requiredMissingKeys.",
        source: "computeDodSnapshot.interview_steps",
        impact: "Мягкий сигнал; влияет на score полноты шагов.",
        severity: "warning",
        isBlocking: false,
      }),
    },
    {
      code: "STEP_002",
      pass: roleEquipmentScore >= 70,
      score: roleEquipmentScore,
      weight: 3,
      severity: "warning",
      isBlocking: false,
      issue: hasDispositionOrLossSignals
        ? `Покрытие role/equipment/disposition/loss: ${roleEquipmentScore}% (role miss ${missingRole}, equipment miss ${missingEquipment}, disposition miss ${missingDisposition}, loss miss ${missingLoss}).`
        : `Покрытие role/equipment: ${roleEquipmentScore}% (role miss ${missingRole}, equipment miss ${missingEquipment}); disposition/loss пока ограниченно доступны.`,
      where: "Таймлайн / Ресурсы",
      explainability: makeExplainability({
        code: "STEP_002",
        label: "Role / equipment / disposition / loss coverage",
        description: "Проверка ресурсной и операционной полноты шага.",
        whatChecked: hasDispositionOrLossSignals
          ? "Наличие role, equipment, disposition и loss-related полей у шагов."
          : "Наличие role и equipment; disposition/loss пока учитываются частично.",
        howCalculated: "Сопоставление `interview_steps` с `draft.nodes` (actor_role/equipment/disposition/loss).",
        source: "timeline/interview steps + nodes",
        impact: "Мягкий сигнал описательной полноты.",
        severity: "warning",
        isBlocking: false,
      }),
    },
    {
      code: "STEP_003",
      pass: notesAiScore >= 70,
      score: notesAiScore,
      weight: 2,
      severity: "info",
      isBlocking: false,
      issue: `Покрытие notes/AI: ${notesAiScore}% (без notes: ${missingNotes}, без AI: ${missingAiQuestions}).`,
      where: "Таймлайн / Coverage",
      explainability: makeExplainability({
        code: "STEP_003",
        label: "Notes / AI coverage",
        description: "Проверка пояснений и AI-покрытия шагов.",
        whatChecked: "Наличие заметок и AI-вопросов по шагам/узлам.",
        howCalculated: "По `coverageMatrix.summary` (missingNotes/missingAiQuestions).",
        source: "coverage matrix (notes + ai)",
        impact: "Мягкий сигнал, влияет на document richness.",
        severity: "info",
        isBlocking: false,
      }),
    },
    {
      code: "STEP_004",
      pass: durationQualityScore >= 65,
      score: durationQualityScore,
      weight: 2,
      severity: "info",
      isBlocking: false,
      issue: `Покрытие duration/quality: ${durationQualityScore}% (пропуски: ${missingDurationQuality}).`,
      where: "Таймлайн / Coverage",
      explainability: makeExplainability({
        code: "STEP_004",
        label: "Duration / quality coverage",
        description: "Проверка наличия duration и quality сигналов для шагов.",
        whatChecked: "Пустые duration/quality поля для step-like узлов.",
        howCalculated: "По `coverageMatrix.summary.missingDurationQuality`.",
        source: "coverage matrix",
        impact: "Мягкий сигнал; не блокирует hard-ready flow.",
        severity: "info",
        isBlocking: false,
      }),
    },
    {
      code: "STEP_005",
      pass: validatorScore >= 75,
      score: validatorScore,
      weight: 1,
      severity: "info",
      isBlocking: false,
      issue: stepValidatorOpen.length > 0
        ? `Открытые step-related validator вопросы: ${stepValidatorOpen.length} (critical: ${validatorCriticalCount}).`
        : "Открытых step-related validator вопросов не найдено.",
      where: "Валидаторы / Clarify",
      explainability: makeExplainability({
        code: "STEP_005",
        label: "Question/validator coverage",
        description: "Учитывает открытые step-related validator вопросы.",
        whatChecked: "Открытые coverage/resources/disposition/loss/role/equipment вопросы.",
        howCalculated: "Агрегация `draft.questions` по open status и step-related issue_type/text.",
        source: "session questions (validators)",
        impact: "Мягкий сигнал, снижает score до закрытия пробелов.",
        severity: "info",
        isBlocking: false,
      }),
    },
  ];

  const summary = summarizeSignals(signals);
  const sectionPercent = summary.percent;
  const section = {
    id: "steps_completeness",
    section: "Полнота шагов",
    weight: 20,
    percent: sectionPercent,
    contribution: round1((20 * sectionPercent) / 100),
    type: "Мягкий",
    status: sectionStatus({ percent: sectionPercent, blockersCount: 0 }),
    action: "Открыть coverage",
    sourceKind: "real",
    explainability: makeExplainability({
      code: "SEC_004",
      label: "Полнота шагов",
      description: "Real soft-layer для качества и полноты шагов.",
      whatChecked: "STEP_001..STEP_005 (core + coverage + validators).",
      howCalculated: "Взвешенная агрегация доступных step-level сигналов.",
      source: "interview_steps + coverageMatrix + session questions",
      impact: "Мягкий раздел, влияет на score без hard-block.",
      severity: "warning",
      isBlocking: false,
    }),
    signals,
    diagnostics: {
      totalSteps,
      avgDodScore,
      requiredMissingCount,
      stepsWithRequiredMiss: stepsWithRequiredMiss.length,
      missingRole,
      missingEquipment,
      missingDisposition,
      missingLoss,
      coverageTotal,
      missingNotes,
      missingAiQuestions,
      missingDurationQuality,
      validatorOpenTotal: stepValidatorOpen.length,
      validatorCriticalCount,
    },
  };
  return section;
}

function buildTraceabilityAuditSection({ snapshot, draft, context }) {
  const draftObj = asObject(draft);
  const ctx = asObject(context);
  const interview = asObject(draftObj?.interview);

  const orgId = toText(ctx?.orgId || draftObj?.org_id || draftObj?.orgId);
  const workspaceId = toText(ctx?.workspaceId || draftObj?.workspace_id || draftObj?.workspaceId);
  const folderId = toText(ctx?.folderId || draftObj?.folder_id || draftObj?.folderId);
  const projectId = toText(ctx?.projectId || draftObj?.project_id || draftObj?.projectId);
  const sessionId = toText(ctx?.sessionId || draftObj?.session_id || draftObj?.id);
  const folderResolved = !!folderId || !!workspaceId;
  const traceSegments = [
    { id: "org", ok: !!orgId },
    { id: "workspace", ok: !!workspaceId },
    { id: "folder", ok: folderResolved },
    { id: "project", ok: !!projectId },
    { id: "session", ok: !!sessionId },
  ];
  const traceScore = clampPercent((traceSegments.filter((seg) => seg.ok).length / traceSegments.length) * 100);
  const missingTraceSegments = traceSegments.filter((seg) => !seg.ok).map((seg) => seg.id);

  const snapshotInterviewSteps = asArray(snapshot?.interview_steps);
  const totalInterviewSteps = snapshotInterviewSteps.length;
  const boundSteps = snapshotInterviewSteps.filter((step) => !!toText(step?.bpmn_ref));
  const boundStepsCount = boundSteps.length;
  const bindPercent = totalInterviewSteps > 0 ? clampPercent((boundStepsCount / totalInterviewSteps) * 100) : 0;
  const aiBoundCount = boundSteps.filter((step) => {
    const ai = asObject(step?.ai);
    return Number(ai?.questionsCount || step?.ai_count || 0) > 0;
  }).length;
  const notesBoundCount = boundSteps.filter((step) => {
    const notes = asObject(step?.notes);
    return Number(notes?.elementCount || step?.notes_count || 0) > 0;
  }).length;
  const bindingCoverageScore = totalInterviewSteps > 0
    ? clampPercent((bindPercent * 0.75) + ((((aiBoundCount + notesBoundCount) / Math.max(1, boundStepsCount * 2)) * 100) * 0.25))
    : 0;

  const auditEvents = collectAuditEvents(draftObj);
  const explicitAuditContainer = hasExplicitAuditContainer(draftObj);
  const lifecycleCreatedAt = toInt(draftObj?.created_at);
  const lifecycleUpdatedAt = toInt(draftObj?.updated_at);
  const lifecycleHasActor = !!toText(draftObj?.created_by || draftObj?.updated_by || draftObj?.owner_user_id);
  const lifecycleTrailAvailable = lifecycleCreatedAt > 0 && lifecycleUpdatedAt > 0;
  const minimalAuditTrailAvailable = lifecycleTrailAvailable && lifecycleHasActor;
  let auditPass = false;
  let auditScore = 0;
  let auditSeverity = "warning";
  let auditBlocking = false;
  let auditIssue = "Аудит-трейл недоступен.";
  if (auditEvents.length > 0) {
    auditPass = true;
    auditScore = 100;
    auditSeverity = "hard";
    auditIssue = `Доступен audit trail (${auditEvents.length} events).`;
  } else if (minimalAuditTrailAvailable) {
    auditPass = false;
    auditScore = 68;
    auditSeverity = "warning";
    auditIssue = "Доступен только базовый lifecycle trail (created/updated); событийный audit partial.";
  } else if (explicitAuditContainer) {
    auditPass = false;
    auditScore = 20;
    auditSeverity = "hard";
    auditBlocking = true;
    auditIssue = "Audit контейнер присутствует, но валидных audit events не найдено.";
  } else {
    auditPass = false;
    auditScore = 35;
    auditSeverity = "warning";
    auditIssue = "Audit events пока не подключены в сессионный payload.";
  }

  const bpmnNodeIds = new Set(
    asArray(snapshot?.bpmn_nodes)
      .map((nodeRaw) => toText(asObject(nodeRaw)?.bpmn_id || asObject(nodeRaw)?.id || asObject(nodeRaw)?.nodeId))
      .filter(Boolean),
  );
  const draftNodeIds = new Set(
    asArray(draftObj?.nodes)
      .map((nodeRaw) => toText(asObject(nodeRaw)?.id || asObject(nodeRaw)?.node_id || asObject(nodeRaw)?.nodeId))
      .filter(Boolean),
  );
  const knownNodeIds = new Set([...bpmnNodeIds, ...draftNodeIds]);
  const interviewStepsRaw = asArray(interview?.steps);
  const transitionsRaw = asArray(interview?.transitions);
  const questionsRaw = asArray(draftObj?.questions);
  const aiByElement = asObject(interview?.ai_questions_by_element || interview?.aiQuestionsByElementId);
  const deletedNodeIds = collectDeletedNodeIds(interview);

  const invalidStepRefs = interviewStepsRaw.filter((stepRaw) => {
    const step = asObject(stepRaw);
    const nodeId = toText(step?.node_id || step?.nodeId || step?.bpmn_ref);
    if (!nodeId) return false;
    return !knownNodeIds.has(nodeId);
  });
  const invalidTransitionRefs = transitionsRaw.filter((trRaw) => {
    const tr = asObject(trRaw);
    const fromId = toText(tr?.from_node_id || tr?.from || tr?.source_id || tr?.sourceId);
    const toId = toText(tr?.to_node_id || tr?.to || tr?.target_id || tr?.targetId);
    if (!fromId || !toId) return false;
    return !knownNodeIds.has(fromId) || !knownNodeIds.has(toId);
  });
  const invalidQuestionRefs = questionsRaw.filter((qRaw) => {
    const q = asObject(qRaw);
    const nodeId = toText(q?.node_id || q?.nodeId);
    if (!nodeId) return false;
    return !knownNodeIds.has(nodeId);
  });
  const invalidAiBindings = Object.keys(aiByElement).filter((rawElementId) => {
    const elementId = toText(rawElementId);
    if (!elementId) return false;
    return !knownNodeIds.has(elementId);
  });
  const staleRefsTotal = (
    invalidStepRefs.length
    + invalidTransitionRefs.length
    + invalidQuestionRefs.length
    + invalidAiBindings.length
  );
  const staleCleanupScore = staleRefsTotal <= 0 ? 100 : clampPercent(100 - (staleRefsTotal * 16));

  const signals = [
    {
      code: "TRACE_001",
      pass: missingTraceSegments.length === 0,
      score: traceScore,
      weight: 4,
      severity: "hard",
      isBlocking: missingTraceSegments.length > 0,
      issue: missingTraceSegments.length > 0
        ? `Неполная trace-цепочка контекста: отсутствует ${missingTraceSegments.join(", ")}.`
        : "Trace-цепочка org → workspace → folder → project → session доступна.",
      where: "Контекст сессии",
      explainability: makeExplainability({
        code: "TRACE_001",
        label: "Org → Workspace → Folder → Project → Session trace",
        description: "Проверка иерархии владения и контекста сессии.",
        whatChecked: "Наличие org/workspace/folder/project/session связки.",
        howCalculated: "Проверка id из session draft + process context.",
        source: "session draft + ProcessStage context",
        impact: "Hard сигнал трассируемости контекста.",
        severity: "hard",
        isBlocking: missingTraceSegments.length > 0,
      }),
    },
    {
      code: "TRACE_003",
      pass: auditPass,
      score: auditScore,
      weight: 3,
      severity: auditSeverity,
      isBlocking: auditBlocking,
      issue: auditIssue,
      where: "Audit trail",
      explainability: makeExplainability({
        code: "TRACE_003",
        label: "Audit events",
        description: "Проверка доступности журналирования действий.",
        whatChecked: "Наличие audit events и/или lifecycle history created/updated.",
        howCalculated: "Проверка audit arrays в session payload + lifecycle fields.",
        source: "session audit fields (events/lifecycle)",
        impact: auditBlocking
          ? "Near-hard сигнал при пустом audit контейнере."
          : "Mixed сигнал для audit profile.",
        severity: auditSeverity,
        isBlocking: auditBlocking,
      }),
    },
    {
      code: "TRACE_004",
      pass: staleRefsTotal === 0,
      score: staleCleanupScore,
      weight: 4,
      severity: "hard",
      isBlocking: staleRefsTotal > 0,
      issue: staleRefsTotal > 0
        ? `Найдены stale refs: steps ${invalidStepRefs.length}, transitions ${invalidTransitionRefs.length}, questions ${invalidQuestionRefs.length}, ai_bindings ${invalidAiBindings.length}.`
        : "Битые ссылки после BPMN изменений не обнаружены.",
      where: "Meta / Bindings",
      explainability: makeExplainability({
        code: "TRACE_004",
        label: "Stale reference cleanup",
        description: "Проверка отсутствия битых ссылок в meta/bindings после BPMN changes.",
        whatChecked: "Невалидные node refs в steps/transitions/questions/ai bindings.",
        howCalculated: "Сверка interview/questions bindings с текущим набором узлов.",
        source: "draft.interview + draft.questions + snapshot.bpmn_nodes",
        impact: "Hard сигнал consistency модели.",
        severity: "hard",
        isBlocking: staleRefsTotal > 0,
      }),
    },
    {
      code: "TRACE_002",
      pass: bindingCoverageScore >= 75,
      score: bindingCoverageScore,
      weight: 2,
      severity: "info",
      isBlocking: false,
      issue: totalInterviewSteps <= 0
        ? "Интервью-шаги отсутствуют; node/interview binding оценён как partial."
        : `Node↔Interview binding: ${bindPercent}% · notes/AI на bound-шагах: notes ${notesBoundCount}, ai ${aiBoundCount}.`,
      where: "Interview / AI bindings",
      explainability: makeExplainability({
        code: "TRACE_002",
        label: "Node ↔ Interview ↔ AI binding",
        description: "Partial/soft проверка связности узлов, интервью и AI-контекста.",
        whatChecked: "Привязка шагов к bpmn_ref и покрытие notes/AI по связанным шагам.",
        howCalculated: "Агрегация bind coverage и notes/ai presence в interview_steps.",
        source: "computeDodSnapshot.interview_steps + coverage bindings",
        impact: "Soft/partial сигнал explainability и audit richness.",
        severity: "info",
        isBlocking: false,
      }),
    },
  ];

  const summary = summarizeSignals(signals);
  const sectionPercent = summary.percent;
  return {
    id: "traceability_audit",
    section: "Трассируемость / Аудит",
    weight: 15,
    percent: sectionPercent,
    contribution: round1((15 * sectionPercent) / 100),
    type: "Смешанный",
    status: sectionStatus({ percent: sectionPercent, blockersCount: summary.blockersCount }),
    action: "Открыть трассировку",
    sourceKind: "real",
    explainability: makeExplainability({
      code: "SEC_005",
      label: "Трассируемость / Аудит",
      description: "Real mixed-layer по traceability и audit consistency.",
      whatChecked: "TRACE_001, TRACE_003, TRACE_004, TRACE_002(partial).",
      howCalculated: "Взвешенная агрегация trace chain + audit trail + stale refs + bindings.",
      source: "session context + interview/meta bindings + audit/lifecycle fields",
      impact: "Mixed раздел: часть сигналов hard, часть soft/partial.",
      severity: summary.blockersCount > 0 ? "hard" : "warning",
      isBlocking: summary.blockersCount > 0,
    }),
    signals,
    diagnostics: {
      orgId,
      workspaceId,
      folderId: folderId || "__workspace_root__",
      projectId,
      sessionId,
      missingTraceSegments,
      auditEventsCount: auditEvents.length,
      explicitAuditContainer,
      lifecycleCreatedAt,
      lifecycleUpdatedAt,
      lifecycleHasActor,
      staleRefsTotal,
      invalidStepRefs: invalidStepRefs.length,
      invalidTransitionRefs: invalidTransitionRefs.length,
      invalidQuestionRefs: invalidQuestionRefs.length,
      invalidAiBindings: invalidAiBindings.length,
      deletedNodeIdsCount: deletedNodeIds.length,
      boundStepsCount,
      totalInterviewSteps,
      aiBoundCount,
      notesBoundCount,
      bindPercent,
      bindingCoverageScore,
    },
  };
}

function buildReadinessArtifactsSection({ snapshot, draft, autoPassPrecheck, autoPassJobState }) {
  const draftObj = asObject(draft);
  const bpmnMeta = asObject(draftObj?.bpmn_meta);
  const interview = asObject(draftObj?.interview);
  const flowMeta = asObject(bpmnMeta?.flow_meta);
  const nodePathMeta = asObject(bpmnMeta?.node_path_meta);
  const autoPassMeta = asObject(bpmnMeta?.auto_pass_v1);
  const drawioMeta = asObject(bpmnMeta?.drawio);
  const hybridV2 = asObject(bpmnMeta?.hybrid_v2);
  const hybridByElement = asObject(bpmnMeta?.hybrid_layer_by_element_id);

  const bpmnNodes = asArray(snapshot?.bpmn_nodes);
  const bpmnFlows = asArray(snapshot?.bpmn_flows);
  const interviewSteps = asArray(snapshot?.interview_steps);

  const bpmnXmlPresent = !!toText(draftObj?.bpmn_xml || draftObj?.bpmnXml);
  const flowMetaCount = Object.keys(flowMeta).length;
  const nodePathMetaCount = Object.keys(nodePathMeta).length;
  const flowTierAssignedCount = bpmnFlows.filter((flowRaw) => !!normalizeTier(asObject(flowRaw)?.tier)).length;
  const taggedPathNodesCount = Object.keys(nodePathMeta).filter((nodeIdRaw) => {
    const entry = asObject(nodePathMeta[nodeIdRaw]);
    return asArray(entry?.paths).some((tierRaw) => !!normalizeTier(tierRaw));
  }).length;

  const autoPassPrecheckKnown = typeof asObject(autoPassPrecheck)?.canRun === "boolean";
  const autoPassStatus = pickAutoPassStatus({ autoPassResult: autoPassMeta, autoPassJobState });
  const autoPassArtifactPresent = Object.keys(autoPassMeta).length > 0 || autoPassPrecheckKnown;

  const interviewStepsRaw = asArray(interview?.steps);
  const interviewArtifactPresent = interviewStepsRaw.length > 0 || interviewSteps.length > 0;
  const reportBuildDebug = asObject(interview?.report_build_debug);
  const reportVersionsByPath = asObject(interview?.report_versions);
  const pathReportsByPath = asObject(interview?.path_reports);
  const reportVersionsCount = Object.keys(reportVersionsByPath).reduce((sum, pathIdRaw) => {
    return sum + asArray(reportVersionsByPath[pathIdRaw]).length;
  }, 0);
  const hasPathReports = Object.keys(pathReportsByPath).some((pathIdRaw) => {
    return Object.keys(asObject(pathReportsByPath[pathIdRaw])).length > 0;
  });
  const reportArtifactPresent = reportVersionsCount > 0 || hasPathReports || Object.keys(reportBuildDebug).length > 0;

  const bpmnMetaPresent = Object.keys(bpmnMeta).length > 0;
  const drawioElementsCount = asArray(drawioMeta?.drawio_elements_v1).length;
  const hybridV2ElementsCount = asArray(hybridV2?.elements).length;
  const hybridLegacyElementsCount = Object.keys(hybridByElement).length;
  const hasDrawioHybridArtifact = (
    !!toText(drawioMeta?.doc_xml)
    || drawioElementsCount > 0
    || hybridV2ElementsCount > 0
    || hybridLegacyElementsCount > 0
  );

  const bpmnArtifactScore = bpmnXmlPresent
    ? clampPercent((bpmnNodes.length > 0 && bpmnFlows.length > 0) ? 100 : 68)
    : 20;
  const pathsArtifactScore = (flowMetaCount > 0 || nodePathMetaCount > 0)
    ? clampPercent(
      (flowTierAssignedCount > 0 ? 45 : 20)
      + (taggedPathNodesCount > 0 ? 40 : 15)
      + (nodePathMetaCount > 0 ? 15 : 0),
    )
    : 25;
  const autoPassArtifactScore = autoPassArtifactPresent
    ? clampPercent(autoPassStatus ? 100 : 82)
    : 20;
  const interviewArtifactScore = interviewArtifactPresent
    ? clampPercent(interviewStepsRaw.length > 0 ? 100 : 80)
    : 35;
  const reportsArtifactScore = reportArtifactPresent ? 100 : 42;
  const bpmnMetaScore = bpmnMetaPresent ? 100 : 25;

  const signals = [
    {
      code: "ART_001",
      kind: "canonical_supporting",
      isCanonical: true,
      pass: bpmnXmlPresent && bpmnNodes.length > 0 && bpmnFlows.length > 0,
      score: bpmnArtifactScore,
      weight: 3,
      severity: "warning",
      isBlocking: false,
      issue: bpmnXmlPresent
        ? `BPMN artifact: xml present · nodes ${bpmnNodes.length} · flows ${bpmnFlows.length}.`
        : "BPMN XML отсутствует в сессии.",
      where: "BPMN",
      explainability: makeExplainability({
        code: "ART_001",
        label: "BPMN присутствует",
        description: "Проверка наличия канонической BPMN-модели в сессии.",
        whatChecked: "Наличие bpmn_xml и базовой структуры nodes/flows.",
        howCalculated: "Проверка `draft.bpmn_xml` + `snapshot.bpmn_nodes/bpmn_flows`.",
        source: "session BPMN data",
        impact: "Canonical-supporting artifact; влияет на готовность артефактного слоя.",
        severity: "warning",
        isBlocking: false,
        isCanonical: true,
        kind: "canonical_supporting",
      }),
    },
    {
      code: "ART_002",
      kind: "canonical_supporting",
      isCanonical: true,
      pass: flowMetaCount > 0 || taggedPathNodesCount > 0,
      score: pathsArtifactScore,
      weight: 2.5,
      severity: "warning",
      isBlocking: false,
      issue: `Path artifacts: flow_meta ${flowMetaCount}, node_path_meta ${nodePathMetaCount}, tagged_nodes ${taggedPathNodesCount}.`,
      where: "bpmn_meta / paths",
      explainability: makeExplainability({
        code: "ART_002",
        label: "Paths mapped",
        description: "Проверка наличия path/tier артефактов в metadata.",
        whatChecked: "Наличие flow_meta/node_path_meta и path-тегов.",
        howCalculated: "Анализ `bpmn_meta.flow_meta` и `bpmn_meta.node_path_meta`.",
        source: "bpmn_meta path fields",
        impact: "Canonical-supporting artifact для path/automation readiness.",
        severity: "warning",
        isBlocking: false,
        isCanonical: true,
        kind: "canonical_supporting",
      }),
    },
    {
      code: "ART_003",
      kind: "canonical_supporting",
      isCanonical: true,
      pass: autoPassArtifactPresent,
      score: autoPassArtifactScore,
      weight: 2,
      severity: "warning",
      isBlocking: false,
      issue: autoPassArtifactPresent
        ? `AutoPass artifact присутствует (status: ${autoPassStatus || "n/a"}).`
        : "AutoPass artifact отсутствует.",
      where: "bpmn_meta.auto_pass_v1",
      explainability: makeExplainability({
        code: "ART_003",
        label: "AutoPass artifact",
        description: "Проверка наличия persisted/derived AutoPass состояния.",
        whatChecked: "Наличие auto_pass_v1 и/или precheck state.",
        howCalculated: "Проверка `bpmn_meta.auto_pass_v1` и precheck availability.",
        source: "auto_pass_v1 + precheck state",
        impact: "Canonical-supporting artifact execution readiness.",
        severity: "warning",
        isBlocking: false,
        isCanonical: true,
        kind: "canonical_supporting",
      }),
    },
    {
      code: "ART_004",
      kind: "secondary",
      isCanonical: false,
      pass: interviewArtifactPresent,
      score: interviewArtifactScore,
      weight: 1.5,
      severity: "info",
      isBlocking: false,
      issue: interviewArtifactPresent
        ? `Interview artifact: steps raw ${interviewStepsRaw.length}, snapshot ${interviewSteps.length}.`
        : "Interview artifact отсутствует.",
      where: "interview snapshot",
      explainability: makeExplainability({
        code: "ART_004",
        label: "Interview artifact",
        description: "Проверка наличия interview snapshot для документной полноты.",
        whatChecked: "Наличие шагов interview в raw/snapshot представлении.",
        howCalculated: "Проверка `draft.interview.steps` и `snapshot.interview_steps`.",
        source: "interview derived data",
        impact: "Secondary artifact: улучшает explainability/document coverage.",
        severity: "info",
        isBlocking: false,
        isCanonical: false,
        kind: "secondary",
      }),
    },
    {
      code: "ART_005",
      kind: "secondary",
      isCanonical: false,
      pass: reportArtifactPresent,
      score: reportsArtifactScore,
      weight: 1.5,
      severity: "info",
      isBlocking: false,
      issue: reportArtifactPresent
        ? `Report artifacts доступны (versions: ${reportVersionsCount}, path_reports: ${hasPathReports ? 1 : 0}).`
        : "Report artifacts пока не сформированы.",
      where: "interview reports",
      explainability: makeExplainability({
        code: "ART_005",
        label: "Report artifact",
        description: "Проверка наличия report-артефактов в рамках сессии.",
        whatChecked: "Наличие report_versions/path_reports/report_build_debug.",
        howCalculated: "Анализ `interview.report_versions`, `interview.path_reports`, `interview.report_build_debug`.",
        source: "session interview report artifacts",
        impact: "Secondary artifact: влияет на audit/document explainability.",
        severity: "info",
        isBlocking: false,
        isCanonical: false,
        kind: "secondary",
      }),
    },
    {
      code: "ART_006",
      kind: "canonical_supporting",
      isCanonical: true,
      pass: bpmnMetaPresent,
      score: bpmnMetaScore,
      weight: 1.5,
      severity: "warning",
      isBlocking: false,
      issue: bpmnMetaPresent
        ? "BPMN meta artifact присутствует."
        : "BPMN meta artifact отсутствует.",
      where: "bpmn_meta",
      explainability: makeExplainability({
        code: "ART_006",
        label: "Meta artifact",
        description: "Проверка наличия bpmn_meta как supporting контейнера.",
        whatChecked: "Наличие bpmn_meta с базовыми readiness ветками.",
        howCalculated: "Проверка ключей `draft.bpmn_meta`.",
        source: "session bpmn_meta",
        impact: "Canonical-supporting artifact для производных readiness слоёв.",
        severity: "warning",
        isBlocking: false,
        isCanonical: true,
        kind: "canonical_supporting",
      }),
    },
    {
      code: "ART_007",
      kind: "non_canonical",
      isCanonical: false,
      pass: true,
      score: 100,
      weight: 0.5,
      severity: "info",
      isBlocking: false,
      issue: hasDrawioHybridArtifact
        ? "Draw.io / hybrid artifacts обнаружены (non-canonical, informational only)."
        : "Draw.io / hybrid artifacts отсутствуют (BPMN-first норма).",
      where: "drawio/hybrid",
      explainability: makeExplainability({
        code: "ART_007",
        label: "Draw.io / hybrid presence",
        description: "Информационный сигнал о наличии визуальных overlay-артефактов.",
        whatChecked: "Наличие drawio/hybrid payload в bpmn_meta.",
        howCalculated: "Проверка drawio/hybrid веток и элементов в metadata.",
        source: "session bpmn_meta.drawio/hybrid",
        impact: "Non-canonical informational signal; не участвует в hard truth.",
        severity: "info",
        isBlocking: false,
        isCanonical: false,
        kind: "non_canonical",
      }),
    },
  ];

  const summary = summarizeSignals(signals);
  const sectionPercent = summary.percent;
  return {
    id: "readiness_artifacts",
    section: "Артефакты готовности",
    weight: 10,
    percent: sectionPercent,
    contribution: round1((10 * sectionPercent) / 100),
    type: "Мягкий",
    status: sectionStatus({ percent: sectionPercent, blockersCount: 0 }),
    action: "Открыть артефакты",
    sourceKind: "real",
    explainability: makeExplainability({
      code: "SEC_006",
      label: "Артефакты готовности",
      description: "Реальный derived слой readiness artifacts.",
      whatChecked: "ART_001..ART_007 (canonical-supporting + secondary + non-canonical info).",
      howCalculated: "Взвешенная агрегация доступных artifact сигналов.",
      source: "session draft + dodSnapshot",
      impact: "Soft слой: supporting indicators без подмены BPMN truth.",
      severity: "info",
      isBlocking: false,
      isCanonical: false,
      kind: "secondary",
    }),
    signals,
    diagnostics: {
      bpmnXmlPresent,
      bpmnNodesCount: bpmnNodes.length,
      bpmnFlowsCount: bpmnFlows.length,
      flowMetaCount,
      nodePathMetaCount,
      flowTierAssignedCount,
      taggedPathNodesCount,
      autoPassArtifactPresent,
      autoPassStatus: autoPassStatus || "idle",
      interviewStepsRawCount: interviewStepsRaw.length,
      interviewStepsSnapshotCount: interviewSteps.length,
      reportArtifactPresent,
      reportVersionsCount,
      hasPathReports,
      bpmnMetaPresent,
      hasDrawioHybridArtifact,
      drawioElementsCount,
      hybridV2ElementsCount,
      hybridLegacyElementsCount,
    },
  };
}

function buildStructureSection({ snapshot }) {
  const quality = asObject(snapshot?.quality);
  const bpmnNodes = asArray(snapshot?.bpmn_nodes);
  const startCount = bpmnNodes.filter((row) => toLower(row?.type) === "startevent").length;
  const endCount = bpmnNodes.filter((row) => toLower(row?.type) === "endevent").length;
  const orphanCount = asArray(quality?.orphan_bpmn_nodes).length;
  const deadEndCount = asArray(quality?.dead_end_bpmn_nodes).length;
  const gatewayUnjoinedCount = asArray(quality?.gateway_unjoined).length;

  const signals = [
    {
      code: "STR_001",
      pass: startCount > 0 && endCount > 0,
      weight: 3,
      severity: "hard",
      isBlocking: true,
      issue: `StartEvent: ${startCount}, EndEvent: ${endCount}.`,
      where: "Диаграмма",
      explainability: makeExplainability({
        code: "STR_001",
        label: "Start/End presence",
        description: "Проверка наличия стартовых и конечных событий.",
        whatChecked: "В BPMN должны присутствовать StartEvent и EndEvent.",
        howCalculated: "Подсчёт узлов startevent/endevent в bpmn_xml.",
        source: "bpmn_xml",
        impact: "Жёсткий сигнал структуры.",
        severity: "hard",
        isBlocking: true,
      }),
    },
    {
      code: "STR_002",
      pass: orphanCount === 0,
      weight: 3,
      severity: "hard",
      isBlocking: true,
      issue: orphanCount > 0
        ? `Обнаружены недостижимые узлы: ${orphanCount}.`
        : "Недостижимых узлов не найдено.",
      where: "Диаграмма",
      explainability: makeExplainability({
        code: "STR_002",
        label: "Reachability / orphan",
        description: "Проверка достижимости BPMN-узлов от StartEvent.",
        whatChecked: "Наличие orphan узлов вне достижимого графа.",
        howCalculated: "Обход графа и сравнение с полным набором узлов.",
        source: "bpmn_xml + graph traversal",
        impact: "Жёсткий сигнал структуры.",
        severity: "hard",
        isBlocking: true,
      }),
    },
    {
      code: "STR_003",
      pass: deadEndCount === 0,
      weight: 4,
      severity: "hard",
      isBlocking: true,
      issue: deadEndCount > 0
        ? `Найдены тупиковые узлы без EndEvent: ${deadEndCount}.`
        : "Тупиковых узлов вне EndEvent нет.",
      where: "Диаграмма",
      explainability: makeExplainability({
        code: "STR_003",
        label: "Dead-end non-end",
        description: "Проверка узлов, которые обрывают поток без EndEvent.",
        whatChecked: "Узлы без исходящих sequenceFlow, не являющиеся EndEvent.",
        howCalculated: "Анализ outgoing для достижимых узлов графа.",
        source: "bpmn_xml + graph traversal",
        impact: "Жёсткий блокер структуры.",
        severity: "hard",
        isBlocking: true,
      }),
    },
    {
      code: "STR_004",
      pass: gatewayUnjoinedCount === 0,
      weight: 2,
      severity: "soft",
      isBlocking: false,
      issue: gatewayUnjoinedCount > 0
        ? `Gateway split без join: ${gatewayUnjoinedCount}.`
        : "Развилки gateway корректно закрыты join.",
      where: "Диаграмма",
      explainability: makeExplainability({
        code: "STR_004",
        label: "Gateway correctness",
        description: "Проверка корректности split/join у gateway.",
        whatChecked: "Split gateway без ожидаемого join.",
        howCalculated: "Проверка ветвлений и наличия join-пути.",
        source: "bpmn_xml + gateway traversal",
        impact: "Сигнал качества структуры; обычно soft.",
        severity: "soft",
        isBlocking: false,
      }),
    },
  ];

  const summary = summarizeSignals(signals);
  const sectionPercent = summary.percent;
  const section = {
    id: "structure_graph",
    section: "Структура / Граф",
    weight: 20,
    percent: sectionPercent,
    contribution: round1((20 * sectionPercent) / 100),
    type: "Жёсткий",
    status: sectionStatus({ percent: sectionPercent, blockersCount: summary.blockersCount }),
    action: "Открыть проверки",
    sourceKind: "real",
    explainability: makeExplainability({
      code: "SEC_001",
      label: "Структура / Граф",
      description: "Реальный раздел на базе BPMN-графа.",
      whatChecked: "Start/End, reachability, dead-end, gateway корректность.",
      howCalculated: "Агрегация сигналов STR_001..STR_004.",
      source: "bpmn_xml",
      impact: "Жёсткий раздел DoD V1.",
      severity: "hard",
      isBlocking: summary.blockersCount > 0,
    }),
    signals,
  };

  return section;
}

function buildPathsSection({ snapshot, draft }) {
  const bpmnFlows = asArray(snapshot?.bpmn_flows);
  const bpmnNodes = asArray(snapshot?.bpmn_nodes);
  const flowMeta = asObject(asObject(asObject(draft).bpmn_meta).flow_meta);
  const nodePathMeta = asObject(asObject(asObject(draft).bpmn_meta).node_path_meta);

  const flowTotal = bpmnFlows.length;
  const tierAssignedCount = bpmnFlows.filter((flow) => !!normalizeTier(flow?.tier)).length;
  const missingTierCount = Math.max(0, flowTotal - tierAssignedCount);

  const taggedNodeIds = Object.keys(nodePathMeta).filter((nodeIdRaw) => {
    const entry = asObject(nodePathMeta[nodeIdRaw]);
    return asArray(entry?.paths).some((tierRaw) => !!normalizeTier(tierRaw));
  });
  const taggedNodesCount = taggedNodeIds.length;
  const missingSequenceNodes = taggedNodeIds.filter((nodeId) => !toText(asObject(nodePathMeta[nodeId]).sequence_key));
  const missingSequenceCount = missingSequenceNodes.length;

  const xorGateways = bpmnNodes
    .filter((node) => toLower(node?.type) === "exclusivegateway")
    .map((node) => toText(node?.bpmn_id || node?.nodeId || node?.id))
    .filter(Boolean);
  const xorConflicts = [];
  xorGateways.forEach((gatewayId) => {
    const outgoing = bpmnFlows.filter((flow) => toText(flow?.from_id || flow?.sourceId) === gatewayId);
    const tierCounters = { P0: 0, P1: 0 };
    outgoing.forEach((flow) => {
      const tier = normalizeTier(flow?.tier);
      if (tier === "P0" || tier === "P1") tierCounters[tier] += 1;
    });
    if (tierCounters.P0 > 1 || tierCounters.P1 > 1) {
      xorConflicts.push({
        gatewayId,
        p0: tierCounters.P0,
        p1: tierCounters.P1,
      });
    }
  });

  const signals = [
    {
      code: "PATH_001",
      pass: flowTotal > 0 && missingTierCount === 0,
      weight: 2,
      severity: "soft",
      isBlocking: false,
      issue: missingTierCount > 0
        ? `Для ${missingTierCount} flow не назначен tier (из ${flowTotal}).`
        : "Tier назначен для всех flow.",
      where: "Пути / Flow tiers",
      explainability: makeExplainability({
        code: "PATH_001",
        label: "Flow tier assignment",
        description: "Проверка назначения P0/P1/P2 на sequenceFlow.",
        whatChecked: "Наличие tier на flow в маршруте.",
        howCalculated: "Сопоставление bpmn_flows и flow_meta.tier.",
        source: "bpmn_meta.flow_meta + bpmn_xml",
        impact: "Сигнал качества path-слоя.",
        severity: "soft",
        isBlocking: false,
      }),
    },
    {
      code: "PATH_002",
      pass: taggedNodesCount > 0 && missingSequenceCount === 0,
      weight: 4,
      severity: "hard",
      isBlocking: true,
      issue: taggedNodesCount <= 0
        ? "Не найдено node_path_meta с path-тегами."
        : (missingSequenceCount > 0
          ? `У ${missingSequenceCount} path-узлов отсутствует sequence_key.`
          : "Node path assignment и sequence_key заполнены."),
      where: "Узлы / Пути",
      explainability: makeExplainability({
        code: "PATH_002",
        label: "Node path assignment + sequence_key",
        description: "Проверка стабильной path-модели на узлах.",
        whatChecked: "Наличие paths и sequence_key в node_path_meta.",
        howCalculated: "Анализ bpmn_meta.node_path_meta по tagged узлам.",
        source: "bpmn_meta.node_path_meta",
        impact: "Жёсткий сигнал устойчивости path-логики.",
        severity: "hard",
        isBlocking: true,
      }),
    },
    {
      code: "PATH_003",
      pass: xorConflicts.length === 0,
      weight: 3,
      severity: "hard",
      isBlocking: true,
      issue: xorConflicts.length > 0
        ? `Найдены XOR-конфликты tier у ${xorConflicts.length} gateway.`
        : "XOR tier-конфликтов не найдено.",
      where: "XOR / Пути",
      explainability: makeExplainability({
        code: "PATH_003",
        label: "XOR tier conflict guard",
        description: "Проверка конфликтов tier в исходящих XOR-ветках.",
        whatChecked: "Повторная установка P0/P1 на несколько исходов одной XOR.",
        howCalculated: "Анализ outgoing flow tiers для exclusiveGateway.",
        source: "bpmn_xml + bpmn_meta.flow_meta",
        impact: "Жёсткий guard path-контракта.",
        severity: "hard",
        isBlocking: true,
      }),
    },
  ];

  const summary = summarizeSignals(signals);
  const sectionPercent = summary.percent;
  const section = {
    id: "paths_sequence",
    section: "Пути / Последовательность",
    weight: 20,
    percent: sectionPercent,
    contribution: round1((20 * sectionPercent) / 100),
    type: "Жёсткий",
    status: sectionStatus({ percent: sectionPercent, blockersCount: summary.blockersCount }),
    action: "Открыть Paths",
    sourceKind: "real",
    explainability: makeExplainability({
      code: "SEC_002",
      label: "Пути / Последовательность",
      description: "Реальный раздел по path/tier/sequence контрактам.",
      whatChecked: "PATH_001..PATH_003.",
      howCalculated: "Агрегация flow tiers + node_path_meta + XOR guard.",
      source: "bpmn_meta + bpmn_xml",
      impact: "Жёсткий раздел DoD V1.",
      severity: "hard",
      isBlocking: summary.blockersCount > 0,
    }),
    signals,
    diagnostics: {
      flowTotal,
      tierAssignedCount,
      missingTierCount,
      taggedNodesCount,
      missingSequenceCount,
      xorConflictCount: xorConflicts.length,
      flowMetaEntries: Object.keys(flowMeta).length,
    },
  };

  return section;
}

function buildExecutionSection({ draft, autoPassPrecheck, autoPassJobState }) {
  const autoPassResult = asObject(asObject(asObject(draft).bpmn_meta).auto_pass_v1);
  const precheck = asObject(autoPassPrecheck);
  const runStatus = pickAutoPassStatus({ autoPassResult, autoPassJobState });

  const precheckKnown = typeof precheck.canRun === "boolean";
  const runFailed = runStatus === "failed" || runStatus === "error";
  const runDone = runStatus === "done" || runStatus === "completed" || runStatus === "success" || runStatus === "ok";
  const runPending = runStatus === "running" || runStatus === "queued" || runStatus === "idle" || runStatus === "";

  const signals = [
    {
      code: "EXEC_001",
      pass: precheckKnown ? precheck.canRun === true : false,
      weight: 4,
      severity: "hard",
      isBlocking: precheckKnown ? precheck.canRun === false : false,
      issue: precheckKnown
        ? (precheck.canRun ? "AutoPass precheck пройден." : (toText(precheck.reason) || "AutoPass precheck не пройден."))
        : "Статус precheck пока недоступен.",
      where: "AutoPass precheck",
      explainability: makeExplainability({
        code: "EXEC_001",
        label: "AutoPass precheck",
        description: "Проверка возможности запустить AutoPass до главного EndEvent.",
        whatChecked: "Проходимость до корректного конца процесса.",
        howCalculated: "Ответ auto-pass precheck API.",
        source: "AutoPass precheck",
        impact: "Hard сигнал для execution readiness.",
        severity: "hard",
        isBlocking: precheckKnown ? precheck.canRun === false : false,
      }),
    },
    {
      code: "EXEC_002",
      pass: runDone,
      weight: 3,
      severity: runFailed ? "hard" : "soft",
      isBlocking: runFailed,
      issue: runDone
        ? "Последний AutoPass run завершён успешно."
        : (runFailed
          ? (toText(asObject(autoPassJobState).error) || "Последний AutoPass run завершился с ошибкой.")
          : "AutoPass run ещё не завершён (или не запускался)."),
      where: "AutoPass run",
      explainability: makeExplainability({
        code: "EXEC_002",
        label: "AutoPass run status",
        description: "Статус последнего выполнения AutoPass.",
        whatChecked: "Результат run: done/failed/running/idle.",
        howCalculated: "Комбинация auto_pass_v1.status и autoPassJobState.status.",
        source: "bpmn_meta.auto_pass_v1 + runtime state",
        impact: runFailed
          ? "Hard blocker при явном failed."
          : "Soft сигнал, если run не завершён.",
        severity: runFailed ? "hard" : "soft",
        isBlocking: runFailed,
      }),
    },
  ];

  const summary = summarizeSignals(signals);
  const sectionPercent = summary.percent;
  const section = {
    id: "autopass_execution",
    section: "AutoPass / Исполнение",
    weight: 15,
    percent: sectionPercent,
    contribution: round1((15 * sectionPercent) / 100),
    type: "Жёсткий",
    status: sectionStatus({ percent: sectionPercent, blockersCount: summary.blockersCount }),
    action: "Открыть AutoPass",
    sourceKind: "real",
    explainability: makeExplainability({
      code: "SEC_003",
      label: "AutoPass / Исполнение",
      description: "Реальный раздел на основе precheck и run status.",
      whatChecked: "EXEC_001..EXEC_002.",
      howCalculated: "Агрегация precheck и результата последнего run.",
      source: "AutoPass precheck + auto_pass_v1",
      impact: "Жёсткий раздел DoD V1.",
      severity: "hard",
      isBlocking: summary.blockersCount > 0,
    }),
    signals,
    diagnostics: {
      precheckCanRun: precheckKnown ? !!precheck.canRun : null,
      precheckCode: toText(precheck.code),
      precheckReason: toText(precheck.reason),
      runStatus: runStatus || "idle",
      runPending,
      runDone,
      runFailed,
    },
  };

  return section;
}

function buildMockSections() {
  return [];
}

function sectionMapById(sections) {
  const out = {};
  asArray(sections).forEach((row) => {
    const id = toText(asObject(row).id);
    if (!id) return;
    out[id] = row;
  });
  return out;
}

function summarizeProfiles(sectionsById) {
  const get = (id) => asObject(sectionsById[id]);
  const structure = Number(get("structure_graph").percent || 0);
  const paths = Number(get("paths_sequence").percent || 0);
  const autoPass = Number(get("autopass_execution").percent || 0);
  const steps = Number(get("steps_completeness").percent || 0);
  const trace = Number(get("traceability_audit").percent || 0);
  const artifacts = Number(get("readiness_artifacts").percent || 0);

  const document = clampPercent((structure * 0.45) + (steps * 0.4) + (artifacts * 0.15));
  const automation = clampPercent((structure * 0.2) + (paths * 0.45) + (autoPass * 0.35));
  const audit = clampPercent((trace * 0.55) + (structure * 0.25) + (artifacts * 0.2));
  return { document, automation, audit };
}

function buildIssueFromSignal(signalRaw, sourceKind, sectionIdRaw) {
  const signal = asObject(signalRaw);
  const explainability = asObject(signal.explainability);
  const code = toText(signal.code);
  const sectionCode = toText(sectionIdRaw);
  return {
    id: code,
    code,
    sectionCode,
    issue: toText(signal.issue) || toText(explainability.description) || code,
    label: toText(explainability.label) || code,
    message: toText(signal.issue) || toText(explainability.description) || code,
    where: toText(signal.where) || "DoD",
    sourceKey: toText(explainability.source || "derived"),
    impactType: signal.isBlocking ? "hard" : "soft",
    sourceKind: toText(sourceKind || "real"),
    severity: toText(signal.severity || "soft"),
    isBlocking: !!signal.isBlocking,
    entityRef: toText(signal.where) || null,
    recommendedAction: "",
    potentialScoreUplift: "",
    explainability,
    sourceExplainability: makeExplainability({
      code: `SRC_${code}`,
      label: toText(explainability.source || "derived"),
      description: "Источник сигнала readiness.",
      whatChecked: "Канонический источник параметра.",
      howCalculated: "Берётся напрямую из источника сигнала.",
      source: toText(explainability.source || "derived"),
      impact: signal.isBlocking ? "Hard gate" : "Soft score",
      severity: toText(signal.severity || "soft"),
      isBlocking: !!signal.isBlocking,
    }),
  };
}

function enrichIssuesWithActions(issues, actionsMap) {
  for (const issue of asArray(issues)) {
    const code = toText(asObject(issue).id || asObject(issue).code);
    const mapped = asObject(actionsMap[code]);
    if (mapped.task) {
      issue.recommendedAction = toText(mapped.task);
      issue.potentialScoreUplift = toText(mapped.delta);
    }
  }
}

function to100ActionsMap() {
  return {
    STR_001: { task: "Добавить отсутствующие Start/End события", sectionId: "structure_graph", section: "Структура / Граф", delta: "+5%", type: "Жёсткий" },
    STR_002: { task: "Связать недостижимые узлы с главным маршрутом", sectionId: "structure_graph", section: "Структура / Граф", delta: "+4%", type: "Жёсткий" },
    STR_003: { task: "Исправить тупиковые узлы без EndEvent", sectionId: "structure_graph", section: "Структура / Граф", delta: "+4%", type: "Жёсткий" },
    STR_004: { task: "Закрыть split gateway корректными join", sectionId: "structure_graph", section: "Структура / Граф", delta: "+2%", type: "Мягкий" },
    PATH_001: { task: "Назначить P0/P1/P2 для всех flow", sectionId: "paths_sequence", section: "Пути / Последовательность", delta: "+3%", type: "Мягкий" },
    PATH_002: { task: "Заполнить sequence_key у path-узлов", sectionId: "paths_sequence", section: "Пути / Последовательность", delta: "+6%", type: "Жёсткий" },
    PATH_003: { task: "Устранить XOR tier-конфликты", sectionId: "paths_sequence", section: "Пути / Последовательность", delta: "+4%", type: "Жёсткий" },
    EXEC_001: { task: "Снять блок precheck до EndEvent", sectionId: "autopass_execution", section: "AutoPass / Исполнение", delta: "+4%", type: "Жёсткий" },
    EXEC_002: { task: "Завершить AutoPass run без ошибок", sectionId: "autopass_execution", section: "AutoPass / Исполнение", delta: "+3%", type: "Жёсткий" },
    STEP_001: { task: "Закрыть core-пропуски в шагах (required fields)", sectionId: "steps_completeness", section: "Полнота шагов", delta: "+4%", type: "Мягкий" },
    STEP_002: { task: "Заполнить role/equipment и связанный coverage", sectionId: "steps_completeness", section: "Полнота шагов", delta: "+3%", type: "Мягкий" },
    STEP_003: { task: "Добавить notes / AI coverage по шагам", sectionId: "steps_completeness", section: "Полнота шагов", delta: "+2%", type: "Мягкий" },
    STEP_004: { task: "Дозаполнить duration/quality для step-like узлов", sectionId: "steps_completeness", section: "Полнота шагов", delta: "+2%", type: "Мягкий" },
    STEP_005: { task: "Закрыть открытые validator вопросы по шагам", sectionId: "steps_completeness", section: "Полнота шагов", delta: "+1%", type: "Мягкий" },
    TRACE_001: { task: "Восстановить полную trace-цепочку org/workspace/project/session", sectionId: "traceability_audit", section: "Трассируемость / Аудит", delta: "+4%", type: "Жёсткий" },
    TRACE_003: { task: "Подключить/восстановить audit events для сессии", sectionId: "traceability_audit", section: "Трассируемость / Аудит", delta: "+3%", type: "Смешанный" },
    TRACE_004: { task: "Очистить stale refs после BPMN изменений", sectionId: "traceability_audit", section: "Трассируемость / Аудит", delta: "+4%", type: "Жёсткий" },
    TRACE_002: { task: "Улучшить node↔interview↔AI binding coverage", sectionId: "traceability_audit", section: "Трассируемость / Аудит", delta: "+2%", type: "Мягкий" },
    ART_001: { task: "Восстановить канонический BPMN artifact", sectionId: "readiness_artifacts", section: "Артефакты готовности", delta: "+3%", type: "Мягкий" },
    ART_002: { task: "Дозаполнить path mapping artifacts (flow_meta/node_path_meta)", sectionId: "readiness_artifacts", section: "Артефакты готовности", delta: "+2%", type: "Мягкий" },
    ART_003: { task: "Синхронизировать AutoPass artifact", sectionId: "readiness_artifacts", section: "Артефакты готовности", delta: "+2%", type: "Мягкий" },
    ART_004: { task: "Добавить interview snapshot artifact", sectionId: "readiness_artifacts", section: "Артефакты готовности", delta: "+1%", type: "Мягкий" },
    ART_005: { task: "Сформировать report artifacts для сессии", sectionId: "readiness_artifacts", section: "Артефакты готовности", delta: "+1%", type: "Мягкий" },
    ART_006: { task: "Проверить полноту bpmn_meta artifacts", sectionId: "readiness_artifacts", section: "Артефакты готовности", delta: "+1%", type: "Мягкий" },
  };
}

function buildTo100Items({ blockers, gaps }) {
  const actionsMap = to100ActionsMap();
  const rows = [...asArray(blockers), ...asArray(gaps)]
    .map((issue, idx) => {
      const code = toText(asObject(issue).id);
      const mapped = asObject(actionsMap[code]);
      if (!mapped.task) return null;
      return {
        id: `todo_${idx + 1}_${code}`,
        priority: idx + 1,
        code,
        task: mapped.task,
        sectionId: mapped.sectionId,
        section: mapped.section,
        delta: mapped.delta,
        type: mapped.type,
        sourceKind: toText(asObject(issue).sourceKind || "real"),
        explainability: makeExplainability({
          code: `TODO_${code}`,
          label: mapped.task,
          description: `Ремедиация для сигнала ${code}.`,
          whatChecked: `Исправление причины ${code}.`,
          howCalculated: "Uplift оценён в DoD V1 эвристикой.",
          source: "dod_readiness_v1",
          impact: `${mapped.type} uplift readiness.`,
          severity: toText(asObject(issue).severity || "soft"),
          isBlocking: mapped.type === "Жёсткий",
        }),
      };
    })
    .filter(Boolean)
    .slice(0, 5);
  return rows;
}

function countBySourceKind(rowsRaw, sourceKind) {
  return asArray(rowsRaw).filter((row) => toText(asObject(row).sourceKind) === sourceKind).length;
}

export function buildDodReadinessV1({
  draft,
  dodSnapshot,
  autoPassPrecheck,
  autoPassJobState,
  coverageMatrix,
  context,
} = {}) {
  const snapshot = asObject(dodSnapshot);
  const realSections = [
    buildStructureSection({ snapshot }),
    buildPathsSection({ snapshot, draft }),
    buildExecutionSection({ draft, autoPassPrecheck, autoPassJobState }),
    buildStepCompletenessSection({ snapshot, draft, coverageMatrix }),
    buildTraceabilityAuditSection({ snapshot, draft, context }),
    buildReadinessArtifactsSection({ snapshot, draft, autoPassPrecheck, autoPassJobState }),
  ];
  const rawSections = [...realSections, ...buildMockSections()];
  const sections = rawSections.map((row) => ({
    ...row,
    code: row.id,
    label: row.section,
    kind: row.type === "Жёсткий" ? "hard" : (row.type === "Смешанный" ? "mixed" : "soft"),
    parameters: row.signals || [],
  }));
  const byId = sectionMapById(sections);

  const totalWeight = sections.reduce((sum, row) => sum + Number(asObject(row).weight || 0), 0);
  const totalContribution = sections.reduce((sum, row) => sum + Number(asObject(row).contribution || 0), 0);
  const readiness = totalWeight > 0 ? clampPercent((totalContribution / totalWeight) * 100) : 0;
  const profiles = summarizeProfiles(byId);

  const realSignals = realSections.flatMap((section) => asArray(section.signals).map((signal) => ({ section, signal })));
  const blockers = realSignals
    .filter((row) => asObject(row.signal).pass === false && asObject(row.signal).isBlocking === true)
    .map((row) => buildIssueFromSignal(row.signal, row.section.sourceKind, row.section.id));
  const gaps = realSignals
    .filter((row) => asObject(row.signal).pass === false && asObject(row.signal).isBlocking !== true)
    .map((row) => buildIssueFromSignal(row.signal, row.section.sourceKind, row.section.id));
  const to100 = buildTo100Items({ blockers, gaps });
  enrichIssuesWithActions(blockers, to100ActionsMap());
  enrichIssuesWithActions(gaps, to100ActionsMap());

  const hasBlockers = blockers.length > 0;
  const summaryStatus = hasBlockers
    ? "Заблокирован"
    : (readiness >= 85 ? "Уверенный черновик" : (readiness >= 65 ? "Рабочий черновик" : "Требует доработки"));
  const overallStatus = hasBlockers ? "blocked" : (readiness >= 85 ? "ready" : (readiness >= 65 ? "draft" : "incomplete"));

  const ctx = asObject(context);
  const now = new Date().toISOString();
  const sessionId = toText(asObject(draft).session_id || asObject(draft).id || ctx.sessionId);

  return {
    version: "dod_readiness_v1",
    sessionId,
    computedAt: now,
    generatedAtIso: now,
    sourceSummary: {
      sectionsTotal: sections.length,
      sectionsReal: countBySourceKind(sections, "real"),
      sectionsMock: countBySourceKind(sections, "mock"),
      signalsTotal: realSignals.length,
      profilesEnabled: ["document", "automation", "audit"],
    },
    overall: {
      score: readiness,
      status: overallStatus,
      statusLabel: summaryStatus,
      isBlocked: hasBlockers,
    },
    summary: {
      title: "Готовность PM",
      project: toText(asObject(draft).title || asObject(draft).name) || "Без названия",
      session: sessionId || "—",
      readiness,
      profiles,
      status: summaryStatus,
      overallStatus,
      blockers: blockers.length,
      gaps: gaps.length,
      infos: realSignals.filter((row) => toText(asObject(row.signal).severity) === "info" && asObject(row.signal).pass !== false).length,
      realSections: countBySourceKind(sections, "real"),
      mockSections: countBySourceKind(sections, "mock"),
      explainability: {
        readiness: makeExplainability({
          code: "SUM_001",
          label: "Общая готовность",
          description: "DoD V1: агрегированный readiness по разделам.",
          whatChecked: "Взвешенная сумма разделов (real + marked mock).",
          howCalculated: "Σ(section_weight × section_percent) / Σ(weights).",
          source: "dod_readiness_v1",
          impact: "Итоговый индикатор статуса.",
          severity: "info",
          isBlocking: blockers.length > 0,
        }),
        document: makeExplainability({
          code: "SUM_002",
          label: "Документ",
          description: "Профиль документной готовности.",
          whatChecked: "Структура + полнота шагов + артефакты.",
          howCalculated: "Профильная формула DoD V1.",
          source: "dod_readiness_v1",
          impact: "Профильный score.",
          severity: "soft",
          isBlocking: false,
        }),
        automation: makeExplainability({
          code: "SUM_003",
          label: "Автоматизация",
          description: "Профиль automation-ready.",
          whatChecked: "Структура + пути + AutoPass.",
          howCalculated: "Профильная формула DoD V1.",
          source: "dod_readiness_v1",
          impact: "Критичен для исполнения.",
          severity: "hard",
          isBlocking: blockers.length > 0,
        }),
        audit: makeExplainability({
          code: "SUM_004",
          label: "Аудит",
          description: "Профиль трассируемости и аудита.",
          whatChecked: "Traceability + structure + artifacts.",
          howCalculated: "Профильная формула DoD V1.",
          source: "dod_readiness_v1",
          impact: "Профильный score.",
          severity: "soft",
          isBlocking: false,
        }),
        blockers: makeExplainability({
          code: "SUM_005",
          label: "Блокеры",
          description: "Количество hard-issue в real секциях V1.",
          whatChecked: "Signals с isBlocking=true и pass=false.",
          howCalculated: "Count failed hard signals.",
          source: "STR/PATH/EXEC/TRACE signals",
          impact: "Блокируют готовность.",
          severity: "hard",
          isBlocking: blockers.length > 0,
        }),
        gaps: makeExplainability({
          code: "SUM_006",
          label: "Пробелы",
          description: "Количество неблокирующих проблем в real секциях V1.",
          whatChecked: "Signals с isBlocking=false и pass=false.",
          howCalculated: "Count failed soft signals.",
          source: "STR/PATH/EXEC/STEP/TRACE/ART signals",
          impact: "Снижают score, не блокируют.",
          severity: "soft",
          isBlocking: false,
        }),
      },
    },
    sections,
    hardBlockers: blockers,
    softGaps: gaps,
    blockers,
    gaps,
    to100,
    counts: {
      hardBlockers: blockers.length,
      softGaps: gaps.length,
      infos: realSignals.filter((row) => toText(asObject(row.signal).severity) === "info" && asObject(row.signal).pass !== false).length,
      sections: sections.length,
      signals: realSignals.length,
    },
    profiles,
    markers: {
      implementedSections: ["structure_graph", "paths_sequence", "autopass_execution", "steps_completeness", "traceability_audit", "readiness_artifacts"],
      mockSections: [],
      sourceKinds: ["real", "mock"],
    },
    meta: {
      contractVersion: "readiness_v1",
      computedAt: now,
      sessionId,
      orgId: toText(ctx.orgId),
      workspaceId: toText(ctx.workspaceId),
      projectId: toText(ctx.projectId),
      folderId: toText(ctx.folderId),
      isGate: false,
      isPublishReady: false,
    },
    columnsExplainability: {
      section: makeExplainability({
        code: "COL_001",
        label: "Раздел",
        description: "Раздел readiness проверки.",
        whatChecked: "Область контроля качества.",
        howCalculated: "Каталог секций DoD.",
        source: "dod_readiness_v1",
        impact: "Локализация проблем по доменам.",
      }),
      weight: makeExplainability({
        code: "COL_002",
        label: "Вес",
        description: "Значимость секции в общей формуле.",
        whatChecked: "Коэффициент влияния секции.",
        howCalculated: "Фиксированный вес секции.",
        source: "dod_readiness_v1 config",
        impact: "Определяет вклад в итог.",
      }),
      sectionPercent: makeExplainability({
        code: "COL_003",
        label: "% раздела",
        description: "Процент прохождения секции.",
        whatChecked: "Доля пройденных сигналов секции.",
        howCalculated: "Взвешенное отношение pass/total по сигналам.",
        source: "section signals",
        impact: "Участвует в общем score.",
      }),
      contribution: makeExplainability({
        code: "COL_004",
        label: "Вклад в итог",
        description: "Сколько секция добавляет в общую готовность.",
        whatChecked: "Contribution секции.",
        howCalculated: "weight × sectionPercent.",
        source: "section score",
        impact: "Прямое влияние на итог.",
      }),
      type: makeExplainability({
        code: "COL_005",
        label: "Тип",
        description: "Класс секции: hard/soft/mixed.",
        whatChecked: "Блокирующая природа секции.",
        howCalculated: "По конфигурации секции.",
        source: "dod_readiness_v1 config",
        impact: "Объясняет gate/score эффект.",
      }),
      status: makeExplainability({
        code: "COL_006",
        label: "Статус",
        description: "Текущее состояние секции.",
        whatChecked: "Уровень прохождения сигналов.",
        howCalculated: "По sectionPercent и blockers.",
        source: "section signals",
        impact: "Приоритизация исправлений.",
      }),
    },
  };
}
