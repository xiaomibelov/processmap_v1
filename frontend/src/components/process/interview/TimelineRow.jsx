import { Fragment, memo, useCallback, useMemo } from "react";
import GatewayGroupRow from "./matrix/GatewayGroupRow";
import {
  STEP_TYPES,
  toArray,
  toText,
  annotationTitleFromText,
  nodeKindIcon,
  laneColor,
  laneCellDisplay,
  bpmnNodeKindShort,
  typeLabel,
  durationClass,
  durationLabel,
} from "./utils";
import {
  branchOutcomeLabel,
  collectBranchMetrics,
  findFirstStepNodeId,
} from "./matrix/gatewayUtils";
import {
  formatMinutesInputFromSeconds,
  mergeLaneLinks,
  normalizeTier,
  readStepDurationMinutes,
  readStepDurationSeconds,
  readStepWaitMinutes,
  readStepWaitSeconds,
  resolveBranchKey,
  splitAnnotationText,
} from "./timelineRowHelpers";

function TimelineRow({ step, absoluteIdx, ctx, ui }) {
  const stepId = toText(step?.id);

  // Cheap, frequently-changing UI state — computed directly in render.
  const menuOpen = ui.rowMenuStepId === stepId;
  const detailsOpen = ui.detailsStepId === stepId;
  const inlineEditorVisible = detailsOpen;
  const activeRow = ui.activeInlineStepId === stepId;
  const activeAnalysisRow = toText(ui.activeAnalysisStepId) === stepId;
  const selected = ui.selectedSet.has(stepId);
  const subprocessCollapsed = !!ui.collapsedSubprocessByStepId[stepId];

  const aiCueActive = ui.aiCue?.stepId === step.id;
  const aiCueStatus = toText(ui.aiCue?.runStatus).toLowerCase() || (toText(ui.aiCue?.error) ? "error" : "success");
  const aiCueLoading = aiCueStatus === "opening" || aiCueStatus === "loading";
  const aiCueProgressText = toText(ui.aiCue?.progressText)
    || (aiCueLoading ? "Генерирую вопросы..." : (aiCueStatus === "error" ? "Ошибка AI" : "Готово"));
  const aiCueErrorText = toText(ui.aiCue?.errorText || ui.aiCue?.error);
  const aiCueQuestions = toArray(ui.aiCue?.questions);

  const activateStepRow = useCallback(() => {
    ctx.scheduleActivateStep(stepId);
  }, [ctx.scheduleActivateStep, stepId]);

  // Heavy derived data — memoized per row.
  const annotationsData = useMemo(() => {
    const stepAnnotations = toArray(ctx.xmlTextAnnotationsByStepId?.[stepId]).map((item, annIdx) => {
      const annotationId = toText(item?.annotationId) || `${stepId}_annotation_${annIdx + 1}`;
      const text = toText(item?.text);
      const titleLine = toText(item?.titleLine) || annotationTitleFromText(text, annIdx + 1);
      const annotationView = splitAnnotationText(text, titleLine, annIdx + 1);
      return {
        ...item,
        annotationId,
        text,
        titleLine,
        viewTitle: annotationView.title,
        viewBody: annotationView.body,
        isLong: annotationView.long,
      };
    });
    const annotationSync = ctx.annotationSyncByStepId?.[stepId] || { status: "empty", label: "нет аннотаций BPMN" };
    return { stepAnnotations, annotationSync };
  }, [ctx.xmlTextAnnotationsByStepId, ctx.annotationSyncByStepId, stepId]);

  const aiData = useMemo(() => {
    const aiMeta = ctx.aiQuestionMetaByStepId?.[stepId] || { count: 0, hasAi: false };
    const aiCount = Number(aiMeta?.count || 0);
    const hasAi = aiCount > 0;
    return { aiMeta, aiCount, hasAi };
  }, [ctx.aiQuestionMetaByStepId, stepId]);

  const laneData = useMemo(() => {
    const stepLaneKey = toText(step?.lane_key) || toText(step?.lane_name);
    const normalizedLaneFilter = toText(ctx.timelineLaneFilter);
    const isLaneActive = !!(
      normalizedLaneFilter &&
      normalizedLaneFilter !== "all" &&
      (stepLaneKey === normalizedLaneFilter || toText(step?.lane_name) === normalizedLaneFilter)
    );
    const laneAccent = toText(step?.lane_color) || laneColor(stepLaneKey || stepId, Number(step?.lane_idx) || 0);
    const incomingLaneLinks = mergeLaneLinks(
      ctx.laneLinksByNode?.incomingByNode?.[toText(step?.node_bind_id)],
      ctx.laneLinksByNode?.incomingByStep?.[stepId],
    );
    const outgoingLaneLinks = mergeLaneLinks(
      ctx.laneLinksByNode?.outgoingByNode?.[toText(step?.node_bind_id)],
      ctx.laneLinksByNode?.outgoingByStep?.[stepId],
    );
    const transitionLaneLinks = [
      ...incomingLaneLinks.map((laneInfo) => ({ ...laneInfo, direction: "in" })),
      ...outgoingLaneLinks.map((laneInfo) => ({ ...laneInfo, direction: "out" })),
    ];
    const laneDisplay = laneCellDisplay(step.lane_idx, step.lane_name, transitionLaneLinks);
    return { stepLaneKey, isLaneActive, laneAccent, transitionLaneLinks, laneDisplay };
  }, [step, ctx.laneLinksByNode, ctx.timelineLaneFilter, stepId]);

  const nodeData = useMemo(() => {
    const nodeKind = toText(step?.node_bind_kind || step?.node_kind);
    const nodeIcon = nodeKindIcon(nodeKind);
    const stepSnapshot = ctx.snapshotStepMaps.byStepId[stepId] || ctx.snapshotStepMaps.byNodeId[toText(step?.node_bind_id || step?.node_id)] || null;
    const stepTier = normalizeTier(stepSnapshot?.tier);
    const stepOutgoingCount = toArray(stepSnapshot?.bpmn?.outgoingFlowIds).length;
    const stepDepth = Math.max(0, Number(step?.depth) || 0);
    const isSubprocessChild = stepDepth > 0 || !!step?.is_subprocess_child;
    const gatewayMode = toText(step?.gateway_mode).toLowerCase();
    const isDecisionGateway = gatewayMode === "decision";
    const isParallelGateway = gatewayMode === "parallel" || !!step?.is_parallel_structural;
    const rawAction = toText(step.action) || "Без названия";
    const stepActionTitle = isDecisionGateway
      ? (rawAction.toLowerCase().startsWith("проверка:") ? rawAction : `Проверка: ${rawAction}`)
      : (isParallelGateway ? `Параллельно: ${rawAction}` : rawAction);
    const hasSubprocessChildren = Number(step?.subprocess_children_count || 0) > 0;
    return {
      nodeKind,
      nodeIcon,
      stepSnapshot,
      stepTier,
      stepOutgoingCount,
      stepDepth,
      isSubprocessChild,
      isDecisionGateway,
      isParallelGateway,
      stepActionTitle,
      hasSubprocessChildren,
    };
  }, [step, ctx.snapshotStepMaps, stepId]);

  const gatewayData = useMemo(() => {
    const betweenBranchesItem = step?.between_branches_item;
    const betweenBranches = toArray(betweenBranchesItem?.branches);
    if (!betweenBranches.length) {
      return null;
    }
    const visibleBetweenBranches = betweenBranches.filter((branch) => ctx.tierFilterSet.has(normalizeTier(branch?.tier)));
    const betweenSummary = betweenBranchesItem?.summary && typeof betweenBranchesItem.summary === "object"
      ? betweenBranchesItem.summary
      : {};
    const betweenBranchCount = Number(visibleBetweenBranches.length || 0);
    const betweenTierSummary = Array.from(
      new Set(visibleBetweenBranches.map((branch) => normalizeTier(branch?.tier))),
    ).join("/");
    const betweenPrimaryLabel = toText(betweenSummary?.primaryLabel);
    const betweenPrimaryTier = toText(betweenSummary?.primaryTier).toUpperCase();
    const betweenPrimaryReasonLabel = toText(betweenSummary?.primaryReasonLabel);
    const gatewayPrefsKey = toText(betweenBranchesItem?.anchorNodeId || step?.node_bind_id || stepId) || stepId;
    const gatewayLabel = nodeData.stepActionTitle;
    const gatewaySubtitle = toText(betweenBranchesItem?.fromGraphNo) && toText(betweenBranchesItem?.toGraphNo)
      ? `${toText(betweenBranchesItem?.fromGraphNo)} → ${toText(betweenBranchesItem?.toGraphNo)}`
      : "";
    const branchMetricsByKey = {};
    visibleBetweenBranches.forEach((branch, branchIdx) => {
      const branchKey = resolveBranchKey(branch, branchIdx);
      branchMetricsByKey[branchKey] = collectBranchMetrics(branch?.children, ctx.branchStepMetaByNodeId);
    });
    return {
      hasBranches: true,
      betweenBranches,
      visibleBetweenBranches,
      betweenSummary,
      betweenBranchCount,
      betweenTierSummary,
      betweenPrimaryLabel,
      betweenPrimaryTier,
      betweenPrimaryReasonLabel,
      gatewayPrefsKey,
      gatewayLabel,
      gatewaySubtitle,
      branchMetricsByKey,
    };
  }, [step, ctx.tierFilterSet, ctx.branchStepMetaByNodeId, nodeData.stepActionTitle]);

  const selectedBranchKey = useMemo(() => {
    if (!gatewayData) return "";
    const { visibleBetweenBranches, gatewayPrefsKey } = gatewayData;
    return toText(ui.selectedBranchByGatewayId[gatewayPrefsKey]
      || resolveBranchKey(
        visibleBetweenBranches.find((branch) => !!branch?.isPrimary) || visibleBetweenBranches[0] || {},
        Math.max(0, visibleBetweenBranches.findIndex((branch) => !!branch?.isPrimary)),
      ));
  }, [gatewayData, ui.selectedBranchByGatewayId]);

  const openBranchPanel = useCallback((branchKeyRaw) => {
    if (!gatewayData) return;
    const { visibleBetweenBranches, branchMetricsByKey, gatewayPrefsKey, gatewayLabel } = gatewayData;
    const branchKey = toText(branchKeyRaw);
    const branch = visibleBetweenBranches.find((item, idx) => {
      const key = resolveBranchKey(item, idx);
      return key === branchKey;
    });
    if (!branch) return;
    const metrics = branchMetricsByKey[branchKey] || collectBranchMetrics(branch?.children, ctx.branchStepMetaByNodeId);
    const firstNodeId = toText(metrics?.firstStepNodeId || findFirstStepNodeId(branch?.children));
    const firstStepId = toText(ctx.firstStepIdByNodeId[firstNodeId]);
    ctx.setSelectedBranchByGatewayId((prev) => ({ ...prev, [gatewayPrefsKey]: branchKey }));
    ctx.setBranchStepsPanelState({
      open: true,
      gatewayId: gatewayPrefsKey,
      branchKey,
      context: {
        gatewayId: gatewayPrefsKey,
        gatewayLabel,
        branchKey,
        branchLabel: toText(branch?.label) || branchKey,
        branchTier: normalizeTier(branch?.tier),
        nodes: toArray(branch?.children),
        metrics,
        outcomeLabel: branchOutcomeLabel(branch, metrics),
        firstStepId,
      },
    });
  }, [gatewayData, ctx.branchStepMetaByNodeId, ctx.firstStepIdByNodeId, ctx.setSelectedBranchByGatewayId, ctx.setBranchStepsPanelState]);

  const timeData = useMemo(() => {
    const stepDurationSeconds = readStepDurationSeconds(step);
    const stepDurationMinutes = readStepDurationMinutes(step);
    const stepWaitSeconds = readStepWaitSeconds(step);
    const stepWaitMinutes = readStepWaitMinutes(step);
    const stepDurationInput = ctx.normalizedStepTimeUnit === "sec"
      ? String(stepDurationSeconds)
      : String(stepDurationMinutes);
    const stepWaitInput = formatMinutesInputFromSeconds(stepWaitSeconds);
    const stepTimeDraftKey = `${stepId}::__step_time_input__`;
    const stepWaitDraftKey = `${stepId}::__wait_time_input__`;
    const stepTimeValue = Object.prototype.hasOwnProperty.call(ui.stepFieldDrafts, stepTimeDraftKey)
      ? String(ui.stepFieldDrafts[stepTimeDraftKey] ?? "")
      : stepDurationInput;
    const stepWaitValue = Object.prototype.hasOwnProperty.call(ui.stepFieldDrafts, stepWaitDraftKey)
      ? String(ui.stepFieldDrafts[stepWaitDraftKey] ?? "")
      : stepWaitInput;
    return {
      stepDurationSeconds,
      stepDurationMinutes,
      stepWaitSeconds,
      stepWaitMinutes,
      stepDurationInput,
      stepWaitInput,
      stepTimeValue,
      stepWaitValue,
    };
  }, [step, ctx.normalizedStepTimeUnit, ui.stepFieldDrafts, stepId]);

  const fieldDrafts = useMemo(() => {
    const drafts = ui.stepFieldDrafts;
    const get = (field, fallback) => {
      const key = `${stepId}::${field}`;
      if (Object.prototype.hasOwnProperty.call(drafts, key)) {
        return drafts[key];
      }
      return String(fallback ?? "");
    };
    return {
      actionValue: get("action", step.action),
      subprocessValue: get("subprocess", step.subprocess || ""),
      areaValue: get("area", step.area || ""),
      roleValue: get("role", step.role || ""),
      outputValue: get("output", step.output || ""),
      commentValue: get("comment", step.comment || ""),
      nodeBindValue: get("node_id", step.node_bind_id || ""),
    };
  }, [step, ui.stepFieldDrafts, stepId]);

  const stepTimeLabel = toText(step?.step_time_label || step?.step_time_model?.label);
  const cumulativeMainlineLabel = toText(step?.mainline_time_cumulative_label);
  const totalMainlineLabel = toText(step?.mainline_time_total_label);

  const gatewayExpanded = gatewayData ? !!ui.expandedGatewayById[gatewayData.gatewayPrefsKey] : false;
  const gatewayShowIds = gatewayData ? !!ui.showGatewayIdsById[gatewayData.gatewayPrefsKey] : false;

  return (
    <Fragment>
      <tr
        className={[
          "interviewStepRow interviewStepRowCompact analysisStepListRow",
          nodeData.isSubprocessChild ? "isSubprocessChild" : "",
          nodeData.isParallelGateway ? "isParallelGatewayRow" : "",
          aiCueActive ? "hasAiCue" : "",
          laneData.isLaneActive ? "isLaneActive" : "",
          selected ? "isSelected" : "",
          activeRow ? "isActiveRow" : "",
          activeAnalysisRow ? "isAnalysisActive" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ "--lane-accent": laneData.laneAccent }}
        data-step-id={stepId}
        onMouseDown={activateStepRow}
        onFocusCapture={activateStepRow}
      >
        <td className="analysisStepListCell analysisStepListCell--select">
          <label className="interviewRowSelectCell">
            <input
              type="checkbox"
              data-testid="interview-step-select"
              checked={selected}
              onChange={(e) => {
                ctx.scheduleActivateStep(step.id);
                ctx.onToggleStepSelection?.(step.id, !!e.target.checked);
              }}
            />
            <span>#{Number(step?._order_index || step?.order_index || absoluteIdx + 1)}</span>
          </label>
        </td>
        <td className="analysisStepListCell analysisStepListCell--lane">
          <div className="interviewLaneCell">
            <span
              className="interviewLaneBadge interviewLaneBadge--primary"
              data-testid="interview-lane-pill-primary"
              style={{ "--lane-accent": laneData.laneAccent }}
              title={laneData.laneDisplay.tooltip}
            >
              <span className="interviewLaneDot" />
              {laneData.laneDisplay.text}
            </span>
          </div>
        </td>
        <td className="analysisStepListCell analysisStepListCell--step">
          <div className="analysisStepStepCell">
            <div className="analysisStepPrimaryCell">
              <div className="interviewStepTitleLine" style={{ "--step-depth": nodeData.stepDepth }}>
                {nodeData.isSubprocessChild ? <span className="interviewSubprocessChildArrow">↳</span> : null}
                <button
                  type="button"
                  className="interviewStepTitleBtn"
                  onClick={() => ctx.openStepDetails(step.id)}
                  title="Открыть детали шага"
                >
                  {nodeData.stepActionTitle}
                </button>
                {nodeData.hasSubprocessChildren ? (
                  <button
                    type="button"
                    className="interviewSubprocessToggleBtn"
                    onClick={() => ctx.toggleSubprocessChildren(stepId)}
                    title={subprocessCollapsed ? "Развернуть подпроцесс" : "Свернуть подпроцесс"}
                  >
                    {subprocessCollapsed ? `Развернуть (${step.subprocess_children_count})` : `Свернуть (${step.subprocess_children_count})`}
                  </button>
                ) : null}
              </div>
              <div className="interviewStepMeta">
                <span>{typeLabel(step.type)}</span>
                {toText(step.subprocess) ? (
                  <span className="interviewSubprocessTag interviewSubprocessTagInline">
                    Подпроцесс: {step.subprocess}
                  </span>
                ) : null}
                <span>· {toText(step.t_plus) || "T+—"}</span>
                {stepTimeLabel && stepTimeLabel !== "—" ? <span>· ⏱ {stepTimeLabel}</span> : null}
                {cumulativeMainlineLabel && cumulativeMainlineLabel !== "—"
                  ? <span>· Σ {cumulativeMainlineLabel}{totalMainlineLabel && totalMainlineLabel !== "—" ? ` / ${totalMainlineLabel}` : ""}</span>
                  : null}
              </div>
            </div>
          </div>
        </td>
        {ctx.showNodeCol ? (
          <td className="analysisStepListCell analysisStepListCell--node">
            {step.node_bound ? (
              <div className="interviewNodeCompact">
                <div className="interviewNodeMain">
                  <span
                    className="interviewNodeTypeIcon"
                    data-testid="interview-node-type-icon"
                    data-node-kind={nodeData.nodeKind || "unknown"}
                    title={`BPMN type: ${nodeData.nodeKind || "unknown"}${toText(step.node_bind_title) ? ` · ${toText(step.node_bind_title)}` : ""}`}
                  >
                    {nodeData.nodeIcon}
                  </span>
                  <span className="badge ok analysisStepNodeBadge" data-testid="interview-node-type-label">{bpmnNodeKindShort(nodeData.nodeKind) || nodeData.nodeKind || "node"}</span>
                </div>
                <span className="muted small font-mono" data-testid="interview-node-bind-id">{toText(step.node_bind_id)}</span>
              </div>
            ) : (
              <div className="interviewNodeCompact">
                <div className="interviewNodeMain">
                  <span
                    className="interviewNodeTypeIcon"
                    data-testid="interview-node-type-icon"
                    data-node-kind={nodeData.nodeKind || "unknown"}
                    title={`BPMN type: ${nodeData.nodeKind || "unknown"}`}
                  >
                    {nodeData.nodeIcon}
                  </span>
                  <span className="badge warn analysisStepNodeBadge">Не привязан</span>
                </div>
                <span className="muted small font-mono">{toText(step.node_bind_id) || "—"}</span>
              </div>
            )}
          </td>
        ) : null}
        <td className="analysisStepListCell analysisStepListCell--status">
          <div className="interviewRowStatus">
            {nodeData.stepOutgoingCount <= 1 ? (
              nodeData.stepTier !== "None" ? (
                <span className={`interviewGatewayPreviewTag tier tier-${nodeData.stepTier.toLowerCase()}`} data-testid="interview-step-tier-chip">
                  {nodeData.stepTier}
                </span>
              ) : null
            ) : (
              <span className="interviewGatewayPreviewTag muted" data-testid="interview-step-branches-summary">
                Branches: {gatewayData?.betweenTierSummary || "P0/P1/P2/None"}
              </span>
            )}
            {(() => {
              const productActionCount = Number(ctx.productActionCountByStepId?.[stepId] || 0);
              return productActionCount > 0 ? (
                <button
                  type="button"
                  className="interviewStepProductActionsBadge"
                  data-testid="interview-step-product-actions-badge"
                  onClick={() => {
                    ctx.scheduleActivateStep(stepId);
                  }}
                  title={`Действия с продуктом: ${productActionCount}`}
                >
                  ПА {productActionCount}
                </button>
              ) : null;
            })()}
            {aiData.hasAi ? (
              <button
                type="button"
                className="interviewStepAiBadge on"
                data-testid="interview-step-ai-badge"
                onClick={() => {
                  ctx.openStepDetails(step.id);
                  ctx.addAiQuestions(step);
                }}
                title="Открыть AI-вопросы шага"
              >
                AI: {aiData.aiCount}
              </button>
            ) : null}
            {step.node_bound ? (
              <button
                type="button"
                className="interviewStepMetaStatusBtn ok"
                onClick={() => ctx.openStepDetails(step.id)}
                title={`Аннотации: ${annotationsData.stepAnnotations.length} · BPMN привязан`}
                data-testid="interview-step-bpmn-status"
              >
                {annotationsData.stepAnnotations.length > 0 ? `A:${annotationsData.stepAnnotations.length}` : "BPMN"}
              </button>
            ) : (
              <button
                type="button"
                className="interviewStepMetaStatusBtn warn"
                onClick={() => ctx.openStepDetails(step.id)}
                title="BPMN-узел не привязан"
                data-testid="interview-step-bpmn-status"
              >
                !BPMN
              </button>
            )}
          </div>
        </td>
        <td className="analysisStepListCell analysisStepListCell--actions">
          <div className="interviewRowActions">
            <button
              type="button"
              className="secondaryBtn smallBtn"
              onClick={() => ctx.openStepDetails(step.id)}
            >
              {detailsOpen ? "Свернуть" : "Детали"}
            </button>
            <div className="interviewRowMenu">
              <button
                type="button"
                className="secondaryBtn smallBtn interviewRowMenuBtn"
                data-testid="interview-step-more-actions"
                aria-expanded={menuOpen ? "true" : "false"}
                onClick={() => ctx.setRowMenuStepId((prev) => (prev === stepId ? "" : stepId))}
                title="Дополнительные действия шага"
              >
                ⋯
              </button>
              {menuOpen ? (
                <div className="interviewRowMenuList" data-testid="interview-step-actions-menu">
                  <button
                    type="button"
                    className="interviewRowMenuItem"
                    onClick={() => {
                      ctx.addAiQuestions(step);
                      ctx.setRowMenuStepId("");
                    }}
                    disabled={!!ui.aiBusyStepId}
                  >
                    {ui.aiBusyStepId === step.id ? "AI: генерация..." : "AI-вопросы"}
                  </button>
                  <button
                    type="button"
                    className="interviewRowMenuItem"
                    onClick={() => {
                      ctx.moveStep(step.id, -1, { orderMode: ctx.orderMode });
                      ctx.setRowMenuStepId("");
                    }}
                    disabled={ctx.graphOrderLocked || ctx.isTimelineFiltering || absoluteIdx === 0}
                    title={ctx.graphOrderLocked ? "Порядок шагов берётся из BPMN-схемы" : ctx.isTimelineFiltering ? "Отключите фильтры, чтобы менять порядок вручную" : ""}
                  >
                    Сдвинуть вверх
                  </button>
                  <button
                    type="button"
                    className="interviewRowMenuItem"
                    onClick={() => {
                      ctx.moveStep(step.id, 1, { orderMode: ctx.orderMode });
                      ctx.setRowMenuStepId("");
                    }}
                    disabled={ctx.graphOrderLocked || ctx.isTimelineFiltering || absoluteIdx === ctx.displayedRowCount - 1}
                    title={ctx.graphOrderLocked ? "Порядок шагов берётся из BPMN-схемы" : ctx.isTimelineFiltering ? "Отключите фильтры, чтобы менять порядок вручную" : ""}
                  >
                    Сдвинуть вниз
                  </button>
                  <button
                    type="button"
                    className="interviewRowMenuItem"
                    onClick={() => {
                      ctx.addStepAfter(step.id, step.type || "operation", "");
                      ctx.setRowMenuStepId("");
                    }}
                  >
                    + Вставить шаг после
                  </button>
                  <button
                    type="button"
                    className="interviewRowMenuItem"
                    disabled={!toText(step?.comment)}
                    title={!toText(step?.comment) ? "Заполните поле аннотации в деталях шага" : "Добавить аннотацию в BPMN"}
                    onClick={() => {
                      if (!toText(step?.comment)) return;
                      void ctx.addTextAnnotation(step);
                      ctx.setRowMenuStepId("");
                    }}
                  >
                    + Аннотация BPMN
                  </button>
                  <button
                    type="button"
                    className="interviewRowMenuItem dangerBtn"
                    data-testid="interview-step-delete-action"
                    onClick={() => {
                      const ok = window.confirm(`Удалить шаг «${toText(step?.action) || stepId}»?`);
                      if (!ok) return;
                      ctx.deleteStep(step.id);
                      ctx.setRowMenuStepId("");
                    }}
                  >
                    Удалить шаг
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </td>
      </tr>
      {detailsOpen ? (
        <tr className="interviewStepDetailsRow" data-details-panel="true" data-step-id={stepId}>
          <td colSpan={ctx.compactColSpan} className="interviewStepDetailsTd">
            <div className="interviewStepDetailsPanel" data-testid="analysis-step-expanded-panel">
              <div className="interviewStepDetailsHeader" data-testid="analysis-step-expanded-header">
                <div className="interviewStepDetailsHeaderTitle">
                  <span className="interviewStepDetailsHeaderSeq">#{absoluteIdx + 1}</span>
                  <span className="interviewStepDetailsHeaderName">{toText(step.action) || "—"}</span>
                </div>
                <button
                  type="button"
                  className="secondaryBtn smallBtn interviewStepDetailsCollapseBtn"
                  onClick={() => ctx.openStepDetails(step.id)}
                >
                  Свернуть ↑
                </button>
              </div>
              <div className="interviewStepDetailsBody" data-testid="analysis-step-expanded-body">
                <div className="interviewStepDetailsGrid">
                  <label className="interviewField">
                    <span>Название шага</span>
                    <input
                      className="input"
                      value={fieldDrafts.actionValue}
                      onChange={(e) => ctx.queuePatchStepField(step.id, "action", e.target.value)}
                      onBlur={() => ctx.flushPatchStepField(step.id, "action")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          ctx.flushPatchStepField(step.id, "action");
                          ctx.addStepAfter(step.id, step.type || "operation", "");
                        }
                      }}
                      placeholder="Глагол + объект"
                    />
                  </label>
                  <label className="interviewField">
                    <span>Тип шага</span>
                    <select className="select" value={step.type} onChange={(e) => ctx.patchStep(step.id, "type", e.target.value)}>
                      {STEP_TYPES.map((x) => (
                        <option value={x.value} key={x.value}>{x.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="interviewField">
                    <span>Подпроцесс</span>
                    <input
                      className="input"
                      list="interviewSubprocesses"
                      value={fieldDrafts.subprocessValue}
                      onChange={(e) => ctx.queuePatchStepField(step.id, "subprocess", e.target.value)}
                      onBlur={() => ctx.flushPatchStepField(step.id, "subprocess")}
                      placeholder="Без подпроцесса"
                    />
                  </label>
                  <label className="interviewField">
                    <span>Цех/участок</span>
                    <input
                      className="input"
                      value={fieldDrafts.areaValue}
                      onChange={(e) => ctx.queuePatchStepField(step.id, "area", e.target.value)}
                      onBlur={() => ctx.flushPatchStepField(step.id, "area")}
                      placeholder="Цех/участок"
                    />
                  </label>
                  <label className="interviewField">
                    <span>Роль</span>
                    <input
                      className="input"
                      value={fieldDrafts.roleValue}
                      onChange={(e) => ctx.queuePatchStepField(step.id, "role", e.target.value)}
                      onBlur={() => ctx.flushPatchStepField(step.id, "role")}
                      placeholder="Роль"
                    />
                  </label>
                  <label className="interviewField">
                    <span>{`Работа (${ctx.normalizedStepTimeUnit === "sec" ? "сек" : "мин"})`}</span>
                    <div className="interviewTimeCell">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        value={timeData.stepTimeValue}
                        onChange={(e) => ctx.queuePatchStepTime(step.id, e.target.value, ctx.normalizedStepTimeUnit)}
                        onBlur={() => ctx.flushPatchStepTime(step.id, ctx.normalizedStepTimeUnit, timeData.stepDurationInput)}
                      />
                      <span className={"interviewBadge dur " + durationClass(step.duration)}>{durationLabel(step.duration)}</span>
                      <button type="button" className="secondaryBtn tinyBtn" onClick={() => ctx.applyTimePreset(step.id, "work", 30, timeData.stepDurationSeconds)}>+30с</button>
                      <button type="button" className="secondaryBtn tinyBtn" onClick={() => ctx.applyTimePreset(step.id, "work", 60, timeData.stepDurationSeconds)}>+1м</button>
                      <button type="button" className="secondaryBtn tinyBtn" onClick={() => ctx.applyTimePreset(step.id, "work", 300, timeData.stepDurationSeconds)}>+5м</button>
                    </div>
                  </label>
                  <label className="interviewField">
                    <span>Ожидание (мин)</span>
                    <div className="interviewTimeCell">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.5"
                        value={timeData.stepWaitValue}
                        onChange={(e) => ctx.queuePatchWaitTime(step.id, e.target.value)}
                        onBlur={() => ctx.flushPatchWaitTime(step.id, timeData.stepWaitInput)}
                      />
                      {timeData.stepWaitMinutes > 0 ? <span className="interviewBadge wait">⏳ {timeData.stepWaitMinutes}</span> : null}
                      <button type="button" className="secondaryBtn tinyBtn" onClick={() => ctx.applyTimePreset(step.id, "wait", 30, timeData.stepWaitSeconds)}>+30с</button>
                      <button type="button" className="secondaryBtn tinyBtn" onClick={() => ctx.applyTimePreset(step.id, "wait", 60, timeData.stepWaitSeconds)}>+1м</button>
                      <button type="button" className="secondaryBtn tinyBtn" onClick={() => ctx.applyTimePreset(step.id, "wait", 300, timeData.stepWaitSeconds)}>+5м</button>
                    </div>
                  </label>
                  <label className="interviewField">
                    <span>Выход шага</span>
                    <input
                      className="input"
                      value={fieldDrafts.outputValue}
                      onChange={(e) => ctx.queuePatchStepField(step.id, "output", e.target.value)}
                      onBlur={() => ctx.flushPatchStepField(step.id, "output")}
                      placeholder="Что выходит"
                    />
                  </label>
                  {ctx.showNodeCol ? (
                    <label className="interviewField interviewStepDetailsNodeField">
                      <span>Привязка BPMN узла</span>
                      <select
                        className={"select interviewNodeBindSelect " + (step.node_bound ? "isBound" : "isMissing")}
                        value={fieldDrafts.nodeBindValue}
                        onChange={(e) => ctx.queuePatchStepField(step.id, "node_id", e.target.value, 60)}
                        onBlur={() => ctx.flushPatchStepField(step.id, "node_id")}
                      >
                        <option value="">— авто по названию —</option>
                        {toArray(ctx.nodeBindOptionsByStepId?.[step.id]).map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <span className={"interviewNodeBindHint " + (step.node_bound ? "ok" : "warn")}>
                        {step.node_bound
                          ? `↳ ${toText(step.node_bind_title) || step.node_bind_id}`
                          : step.node_bind_id
                            ? "узел не найден в текущей диаграмме"
                            : "свяжется автоматически при уникальном названии"}
                      </span>
                    </label>
                  ) : null}
                </div>

                <div className="interviewAnnotationCell">
                  <div className="interviewAnnotationMain">
                    <input
                      className="input"
                      value={fieldDrafts.commentValue}
                      onChange={(e) => ctx.queuePatchStepField(step.id, "comment", e.target.value)}
                      onBlur={() => ctx.flushPatchStepField(step.id, "comment")}
                      placeholder="Текст аннотации BPMN"
                    />
                    <button
                      type="button"
                      className="secondaryBtn smallBtn interviewAnnotationAddBtn"
                      onClick={() => {
                        void ctx.addTextAnnotation(step);
                      }}
                      title="Добавить аннотацию в BPMN"
                    >
                      +
                    </button>
                  </div>
                  <div className={`interviewAnnotationState ${annotationsData.annotationSync.status || "empty"}`}>
                    {annotationsData.annotationSync.label}
                  </div>
                  <div className="interviewAnnotationSummary">
                    <span className={"badge " + (annotationsData.stepAnnotations.length ? "ok" : "muted")}>
                      Аннотации: {annotationsData.stepAnnotations.length}
                    </span>
                  </div>
                  {annotationsData.stepAnnotations.length ? (
                    <div className="interviewAnnotationList">
                      {annotationsData.stepAnnotations.map((annotation, annIdx) => {
                        const expanded = !!ui.expandedLongAnnotationById[annotation.annotationId];
                        const annotationTitle = toText(annotation?.viewTitle) || "";
                        const annotationBody = toText(annotation?.viewBody) || toText(annotation?.text) || "—";
                        const canExpand = !!annotation?.isLong;
                        return (
                          <div className="interviewAnnotationItem" key={`${annotation.annotationId}_${annIdx + 1}`}>
                            {annotationTitle ? <div className="interviewAnnotationItemTitle">{annotationTitle}</div> : null}
                            <div className={`interviewAnnotationBody ${expanded ? "expanded" : "collapsed"}`}>
                              <div className="interviewAnnotationText">{annotationBody}</div>
                            </div>
                            {canExpand ? (
                              <div className="interviewAnnotationItemActions">
                                <button
                                  type="button"
                                  className="secondaryBtn smallBtn interviewAnnotationToggleBtn"
                                  onClick={() => ctx.toggleAnnotationDetails(annotation.annotationId)}
                                >
                                  {expanded ? "Свернуть" : "Развернуть"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="muted small">Аннотаций пока нет.</div>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
      {aiCueActive ? (
        <tr className="interviewAiRow">
          <td colSpan={ctx.compactColSpan}>
            <div className={"interviewAiCue " + ((aiCueErrorText || ui.aiCue.reused) ? "reused" : "added")}>
              <div className="interviewAiCueHead">
                <div className="interviewAiCueTitle">
                  ✦ AI · шаг {ui.aiCue.stepSeq || "?"} ({typeLabel(ui.aiCue.stepType)})
                </div>
                <button type="button" className="iconBtn interviewAiCueClose" onClick={() => ctx.setAiCue(null)} title="Закрыть">
                  ×
                </button>
              </div>
              <div className="interviewAiCueSub">{ui.aiCue.stepTitle}</div>
              <div className={"interviewAiRunStatus " + aiCueStatus}>
                <span className={"interviewAiRunDot " + aiCueStatus} />
                <span className="interviewAiRunText">{aiCueProgressText}</span>
                {aiCueLoading ? <span className="interviewAiRunSpinner" aria-hidden="true">⏳</span> : null}
              </div>
              {aiCueErrorText ? (
                <>
                  <div className="interviewAiCueMuted interviewAiCueErr">{aiCueErrorText}</div>
                  <div className="interviewAiCueActions">
                    <button
                      type="button"
                      className="secondaryBtn smallBtn"
                      onClick={() => ctx.addAiQuestions(step, { forceRefresh: true })}
                      disabled={ui.aiBusyStepId === step.id}
                    >
                      {ui.aiBusyStepId === step.id ? "Повтор..." : "Повторить"}
                    </button>
                  </div>
                </>
              ) : aiCueLoading && !aiCueQuestions.length ? (
                <div className="interviewAiSkeleton">
                  <div className="interviewAiSkeletonRow" />
                  <div className="interviewAiSkeletonRow" />
                  <div className="interviewAiSkeletonRow" />
                </div>
              ) : aiCueQuestions.length ? (
                <>
                  <div className="interviewAiCueMuted">
                    {ui.aiCue.added > 0
                      ? `LLM добавил новых вопросов: ${ui.aiCue.added}.`
                      : `LLM вернул вопросы по шагу: ${Number(ui.aiCue.total || aiCueQuestions.length || 0)}.`}
                  </div>
                  <div className="interviewAiCueActions">
                    {ui.aiCue.canRebuild ? (
                      <button
                        type="button"
                        className="secondaryBtn smallBtn"
                        onClick={() => ctx.addAiQuestions(step, { forceRefresh: true })}
                        disabled={ui.aiBusyStepId === step.id}
                        title="Запросить LLM и добрать список до 5 вопросов"
                      >
                        {ui.aiBusyStepId === step.id ? "Пересобираю..." : "Пересобрать список"}
                      </button>
                    ) : (
                      <span className="badge ok">Лимит достигнут: 5/5</span>
                    )}
                    <span className="muted small">Отметьте вопросы и привяжите их к выбранному BPMN-элементу.</span>
                    <button
                      type="button"
                      className="secondaryBtn smallBtn"
                      onClick={() => {
                        void ctx.addAiQuestionsNote(step);
                      }}
                      disabled={aiCueLoading || !aiCueQuestions.some((q) => !!q?.on_diagram)}
                      title="Добавить отмеченные AI-вопросы к выбранному BPMN-элементу"
                    >
                      Добавить к элементу
                    </button>
                  </div>
                  <div className="interviewAiCueList">
                    {aiCueQuestions.map((q) => (
                      <div key={`${q.id}_${q.text}`} className="interviewAiCueItem">
                        <label className="interviewAiCueCheck">
                          <input
                            type="checkbox"
                            checked={!!q.on_diagram}
                            onChange={(e) => ctx.toggleAiQuestionDiagram(step.id, q.id, e.target.checked)}
                          />
                          <span>{q.text}</span>
                        </label>
                        <button
                          type="button"
                          className="dangerBtn smallBtn"
                          onClick={() => ctx.deleteAiQuestion(step.id, q.id)}
                          title="Удалить вопрос из списка шага"
                        >
                          удалить
                        </button>
                      </div>
                    ))}
                  </div>
                  {ui.aiNoteStatus?.stepId === step.id ? (
                    <div className={`interviewAiNoteStatus ${ui.aiNoteStatus.status || "pending"}`}>
                      {ui.aiNoteStatus.text}
                    </div>
                  ) : null}
                  {ctx.aiQuestionsDiagramSyncByStepId?.[step.id] && ui.aiNoteStatus?.stepId === step.id && ui.aiNoteStatus?.status !== "ok" ? (
                    <div className="interviewAiCueMuted">
                      Проверка: {Number(ctx.aiQuestionsDiagramSyncByStepId[step.id]?.presentCount || 0)}/{Number(ctx.aiQuestionsDiagramSyncByStepId[step.id]?.selectedCount || 0)} отмеченных вопросов привязаны к BPMN-элементам.
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="interviewAiCueMuted">LLM не вернул вопросы для этого шага.</div>
              )}
            </div>
          </td>
        </tr>
      ) : null}
      {gatewayData?.hasBranches ? (
        <tr className="interviewBetweenBranchesRow">
          <td colSpan={ctx.compactColSpan}>
            {gatewayData.visibleBetweenBranches.length ? (
              <GatewayGroupRow
                gatewayId={gatewayData.gatewayPrefsKey}
                gatewayLabel={gatewayData.gatewayLabel}
                gatewaySubtitle={gatewayData.gatewaySubtitle}
                branches={gatewayData.visibleBetweenBranches}
                metricsByBranchKey={gatewayData.branchMetricsByKey}
                expanded={gatewayExpanded}
                showIds={gatewayShowIds}
                selectedBranchKey={selectedBranchKey}
                onToggleExpanded={ctx.toggleGatewayExpanded}
                onToggleShowIds={ctx.toggleGatewayShowIds}
                onSelectBranch={(branchKey) => ctx.setSelectedBranch(gatewayData.gatewayPrefsKey, branchKey)}
                onOpenBranchSteps={openBranchPanel}
                onSetPrimaryBranch={null}
                onCollapseAllBranches={() => ctx.setExpandedGatewayById((prev) => ({ ...prev, [gatewayData.gatewayPrefsKey]: false }))}
                onExpandAllBranches={() => ctx.setExpandedGatewayById((prev) => ({ ...prev, [gatewayData.gatewayPrefsKey]: true }))}
                onCopySummary={(gatewayId) => {
                  const summaryText = [
                    `Gateway: ${gatewayData.gatewayLabel}`,
                    `id: ${gatewayId}`,
                    `branches: ${gatewayData.betweenBranchCount}`,
                    gatewayData.betweenTierSummary ? `tiers: ${gatewayData.betweenTierSummary}` : "",
                    gatewayData.betweenPrimaryLabel ? `primary: ${gatewayData.betweenPrimaryLabel} (${gatewayData.betweenPrimaryTier || "—"})` : "",
                    gatewayData.betweenPrimaryReasonLabel ? `reason: ${gatewayData.betweenPrimaryReasonLabel}` : "",
                  ].filter(Boolean).join("\n");
                  void ctx.copyGatewaySummary(gatewayId, summaryText);
                }}
              />
            ) : (
              <div className="interviewGatewayEmptyHint muted small">
                По текущему фильтру tiers ветки скрыты.
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export default memo(TimelineRow);
