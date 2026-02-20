import { useEffect, useState } from "react";
import * as InterviewUtils from "./interview/utils";
import useInterviewDerivedState from "./interview/useInterviewDerivedState";
import useInterviewActions from "./interview/useInterviewActions";
import useInterviewSessionState from "./interview/useInterviewSessionState";
import BoundariesBlock from "./interview/BoundariesBlock";
import TimelineControls from "./interview/TimelineControls";
import TimelineTable from "./interview/TimelineTable";
import TransitionsBlock from "./interview/TransitionsBlock";
import SummaryBlock from "./interview/SummaryBlock";
import ExceptionsBlock from "./interview/ExceptionsBlock";
import AiQuestionsBlock from "./interview/AiQuestionsBlock";
import MarkdownBlock from "./interview/MarkdownBlock";

const {
  SHOW_AI_QUESTIONS_BLOCK,
  toText,
} = InterviewUtils;

export default function InterviewStage({
  sessionId,
  sessionTitle,
  sessionDraft,
  interview,
  nodes,
  edges,
  roles,
  actorsDerived,
  bpmnXml,
  onChange,
  selectedDiagramElement,
}) {
  const sid = String(sessionId || "");
  const processTitle = toText(sessionTitle) || `Процесс ${sid || "—"}`;
  const {
    data,
    setData,
    applyInterviewMutation,
    copyState,
    setCopyState,
    aiCue,
    setAiCue,
    aiBusyStepId,
    setAiBusyStepId,
    subprocessDraft,
    setSubprocessDraft,
    quickStepDraft,
    setQuickStepDraft,
    timelineFilters,
    setTimelineFilters,
    hiddenTimelineCols,
    setHiddenTimelineCols,
    showTimelineColsMenu,
    setShowTimelineColsMenu,
    boundariesLaneFilter,
    setBoundariesLaneFilter,
    uiPrefsSavedAt,
    setUiPrefsSavedAt,
    uiPrefsDirty,
    setUiPrefsDirty,
    collapsed,
    setCollapsed,
  } = useInterviewSessionState({
    sid,
    interview,
    onChange,
  });

  const {
    boundariesComplete,
    backendNodes,
    graphOrderLocked,
    subprocessCatalog,
    timelineView,
    laneLinksByNode,
    summary,
    topWaits,
    extendedAnalytics,
    intermediateRolesAuto,
    nodeBindOptionsByStepId,
    aiRows,
    aiQuestionsDiagramSyncByStepId,
    annotationSyncByStepId,
    xmlTextAnnotationsByStepId,
    timelineLaneOptions,
    boundaryLaneOptions,
    boundaryLaneOptionsFiltered,
    timelineSubprocessOptions,
    filteredTimelineView,
    transitionView,
    timelineColSpan,
    isTimelineFiltering,
    markdownReport,
  } = useInterviewDerivedState({
    sessionDraft,
    data,
    nodes,
    edges,
    roles,
    actorsDerived,
    bpmnXml,
    boundariesLaneFilter,
    timelineFilters,
    hiddenTimelineCols,
    processTitle,
    sid,
  });

  const [annotationNotice, setAnnotationNotice] = useState(null);
  const [pendingAnnotationStepId, setPendingAnnotationStepId] = useState("");
  const [aiNoteStatus, setAiNoteStatus] = useState(null);

  useEffect(() => {
    setAnnotationNotice(null);
    setPendingAnnotationStepId("");
    setAiNoteStatus(null);
  }, [sid]);

  const {
    patchBoundary,
    toggleBlock,
    patchTimelineFilter,
    resetTimelineFilters,
    toggleTimelineColumn,
    resetTimelineColumns,
    saveUiPrefs,
    toggleIntermediateBoundaryLane,
    addStep,
    addStepAfter,
    addQuickStepFromInput,
    patchStep,
    patchTransitionWhen,
    moveStep,
    deleteStep,
    addSubprocessLabel,
    addTextAnnotation,
    addAiQuestionsNote,
    addAiQuestions,
    toggleAiQuestionDiagram,
    deleteAiQuestion,
    patchQuestionStatus,
    addException,
    patchException,
    deleteException,
    copyToNotes,
  } = useInterviewActions({
    sid,
    data,
    setData,
    applyInterviewMutation,
    quickStepDraft,
    setQuickStepDraft,
    subprocessDraft,
    setSubprocessDraft,
    timelineFilters,
    setTimelineFilters,
    hiddenTimelineCols,
    setHiddenTimelineCols,
    boundariesLaneFilter,
    setUiPrefsSavedAt,
    setUiPrefsDirty,
    setCollapsed,
    backendNodes,
    markdownReport,
    aiCue,
    setAiCue,
    setAiBusyStepId,
    setCopyState,
    selectedDiagramElement,
  });

  useEffect(() => {
    const stepId = toText(pendingAnnotationStepId);
    if (!stepId) return;
    const sync = annotationSyncByStepId?.[stepId];
    if (!sync) return;
    if (sync.status === "synced") {
      setAnnotationNotice({
        type: "ok",
        text: "Аннотация BPMN подтверждена в диаграмме и XML.",
      });
      setPendingAnnotationStepId("");
      return;
    }
    if (sync.status === "mismatch") {
      setAnnotationNotice({
        type: "warn",
        text: "В XML уже есть аннотация на узле, но текст отличается.",
      });
      setPendingAnnotationStepId("");
    }
  }, [pendingAnnotationStepId, annotationSyncByStepId]);

  async function handleAddTextAnnotation(step) {
    const stepId = toText(step?.id);
    if (!stepId) return;
    const result = await addTextAnnotation(step);
    if (!result?.ok) {
      setAnnotationNotice({
        type: "err",
        text: toText(result?.error) || "Не удалось добавить аннотацию BPMN.",
      });
      setPendingAnnotationStepId("");
      return;
    }
    setPendingAnnotationStepId(stepId);
    setAnnotationNotice({
      type: "pending",
      text: "Аннотация BPMN отправлена. Проверяю синхронизацию с диаграммой/XML…",
    });
  }

  async function handleAddAiQuestionsNote(step) {
    const stepId = toText(step?.id);
    if (!stepId) return;
    const result = await addAiQuestionsNote(step);
    if (!result?.ok) {
      setAiNoteStatus({
        stepId,
        status: "err",
        text: toText(result?.error) || "Не удалось добавить заметку.",
      });
      return;
    }
    setAiNoteStatus({
      stepId,
      status: "ok",
      text:
        `Добавлено к элементу ${toText(result?.elementName || result?.elementId)}: `
        + `${Number(result?.selectedCount || 0)} выбранных (${Number(result?.addedCount || 0)} новых).`,
    });
  }

  return (
    <div className="interviewStage">
      <BoundariesBlock
        boundariesComplete={boundariesComplete}
        uiPrefsDirty={uiPrefsDirty}
        uiPrefsSavedAt={uiPrefsSavedAt}
        saveUiPrefs={saveUiPrefs}
        collapsed={collapsed.boundaries}
        toggleBlock={toggleBlock}
        boundaries={data.boundaries}
        patchBoundary={patchBoundary}
        boundaryLaneOptions={boundaryLaneOptions}
        boundaryLaneOptionsFiltered={boundaryLaneOptionsFiltered}
        boundariesLaneFilter={boundariesLaneFilter}
        setBoundariesLaneFilter={setBoundariesLaneFilter}
        setUiPrefsDirty={setUiPrefsDirty}
        intermediateRolesAuto={intermediateRolesAuto}
        toggleIntermediateBoundaryLane={toggleIntermediateBoundaryLane}
      />

      <div className="interviewBlock">
        <div className="interviewBlockHead">
          <div>
            <div className="interviewBlockTitle">B. Таймлайн шагов</div>
          </div>
          <div className="interviewBlockTools">
            {graphOrderLocked ? <span className="badge ok">Порядок: по BPMN</span> : <span className="badge warn">Порядок: ручной</span>}
            <button type="button" className="secondaryBtn smallBtn interviewCollapseBtn" onClick={() => toggleBlock("timeline")}>
              {collapsed.timeline ? "Показать" : "Скрыть"}
            </button>
          </div>
        </div>

        {!collapsed.timeline ? (
        <>
        <TimelineControls
          quickStepDraft={quickStepDraft}
          setQuickStepDraft={setQuickStepDraft}
          addQuickStepFromInput={addQuickStepFromInput}
          addStep={addStep}
          subprocessDraft={subprocessDraft}
          setSubprocessDraft={setSubprocessDraft}
          addSubprocessLabel={addSubprocessLabel}
          filteredTimelineCount={filteredTimelineView.length}
          timelineCount={timelineView.length}
          isTimelineFiltering={isTimelineFiltering}
          resetTimelineFilters={resetTimelineFilters}
          saveUiPrefs={saveUiPrefs}
          uiPrefsSavedAt={uiPrefsSavedAt}
          uiPrefsDirty={uiPrefsDirty}
          showTimelineColsMenu={showTimelineColsMenu}
          setShowTimelineColsMenu={setShowTimelineColsMenu}
          resetTimelineColumns={resetTimelineColumns}
          hiddenTimelineCols={hiddenTimelineCols}
          toggleTimelineColumn={toggleTimelineColumn}
          timelineFilters={timelineFilters}
          patchTimelineFilter={patchTimelineFilter}
          timelineLaneOptions={timelineLaneOptions}
          timelineSubprocessOptions={timelineSubprocessOptions}
        />

        {annotationNotice ? (
          <div className={`interviewAnnotationNotice ${annotationNotice.type || "pending"}`}>
            {annotationNotice.text}
          </div>
        ) : null}
        <TimelineTable
          hiddenTimelineCols={hiddenTimelineCols}
          timelineLaneFilter={timelineFilters.lane}
          filteredTimelineView={filteredTimelineView}
          timelineView={timelineView}
          timelineColSpan={timelineColSpan}
          laneLinksByNode={laneLinksByNode}
          patchStep={patchStep}
          addTextAnnotation={handleAddTextAnnotation}
          annotationSyncByStepId={annotationSyncByStepId}
          xmlTextAnnotationsByStepId={xmlTextAnnotationsByStepId}
          nodeBindOptionsByStepId={nodeBindOptionsByStepId}
          addStepAfter={addStepAfter}
          aiCue={aiCue}
          setAiCue={setAiCue}
          aiBusyStepId={aiBusyStepId}
          addAiQuestions={addAiQuestions}
          toggleAiQuestionDiagram={toggleAiQuestionDiagram}
          deleteAiQuestion={deleteAiQuestion}
          addAiQuestionsNote={handleAddAiQuestionsNote}
          aiQuestionsDiagramSyncByStepId={aiQuestionsDiagramSyncByStepId}
          aiNoteStatus={aiNoteStatus}
          moveStep={moveStep}
          graphOrderLocked={graphOrderLocked}
          isTimelineFiltering={isTimelineFiltering}
          deleteStep={deleteStep}
          subprocessCatalog={subprocessCatalog}
        />
        </>
        ) : null}
      </div>

      <TransitionsBlock
        collapsed={collapsed.transitions}
        toggleBlock={toggleBlock}
        transitionView={transitionView}
        patchTransitionWhen={patchTransitionWhen}
      />

      <SummaryBlock
        collapsed={collapsed.summary}
        toggleBlock={toggleBlock}
        summary={summary}
        extendedAnalytics={extendedAnalytics}
        timelineViewLength={timelineView.length}
        topWaits={topWaits}
        exceptionsCount={data.exceptions.length}
      />

      <ExceptionsBlock
        collapsed={collapsed.exceptions}
        toggleBlock={toggleBlock}
        exceptions={data.exceptions}
        addException={addException}
        patchException={patchException}
        deleteException={deleteException}
      />

      {SHOW_AI_QUESTIONS_BLOCK ? (
        <AiQuestionsBlock
          collapsed={collapsed.ai}
          toggleBlock={toggleBlock}
          aiRows={aiRows}
          patchQuestionStatus={patchQuestionStatus}
        />
      ) : null}


      <MarkdownBlock
        collapsed={collapsed.markdown}
        toggleBlock={toggleBlock}
        copyToNotes={copyToNotes}
        copyState={copyState}
        markdownReport={markdownReport}
      />
    </div>
  );
}
