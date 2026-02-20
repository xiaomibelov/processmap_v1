import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  STEP_TYPES,
  toArray,
  toText,
  annotationTitleFromText,
  laneColor,
  laneLabel,
  typeLabel,
  durationClass,
  durationLabel,
} from "./utils";

function mergeLaneLinks(primary, secondary) {
  const byKey = {};
  [...toArray(primary), ...toArray(secondary)].forEach((laneInfo) => {
    const key = toText(laneInfo?.laneKey);
    if (!key) return;
    byKey[key] = laneInfo;
  });
  return Object.values(byKey).sort((a, b) => {
    const ai = Number(a?.laneIdx);
    const bi = Number(b?.laneIdx);
    if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
    return String(a?.laneName || "").localeCompare(String(b?.laneName || ""), "ru");
  });
}

function normalizeLoose(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function splitAnnotationText(textRaw, titleRaw, index = 1) {
  const text = String(textRaw || "");
  const textTrimmed = toText(text);
  const title = toText(titleRaw) || `Аннотация #${Math.max(1, Number(index) || 1)}`;
  if (!textTrimmed) {
    return {
      title,
      body: "—",
      long: false,
    };
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const firstMeaningfulIndex = lines.findIndex((line) => toText(line));
  const meaningfulLines = firstMeaningfulIndex >= 0 ? lines.slice(firstMeaningfulIndex) : lines;
  const firstLine = toText(meaningfulLines[0]);
  const sameAsTitle = !!firstLine && normalizeLoose(firstLine) === normalizeLoose(title);

  const bodyLines = sameAsTitle ? meaningfulLines.slice(1) : meaningfulLines;
  const body = toText(bodyLines.join("\n")) || textTrimmed;
  const long = body.length > 180 || body.split("\n").length > 3;
  const showTitle = !!title && normalizeLoose(body) !== normalizeLoose(title);

  return {
    title: showTitle ? title : "",
    body,
    long,
  };
}

export default function TimelineTable({
  hiddenTimelineCols,
  timelineLaneFilter,
  filteredTimelineView,
  timelineView,
  timelineColSpan,
  laneLinksByNode,
  patchStep,
  addTextAnnotation,
  annotationSyncByStepId,
  xmlTextAnnotationsByStepId,
  nodeBindOptionsByStepId,
  addStepAfter,
  aiCue,
  setAiCue,
  aiBusyStepId,
  addAiQuestions,
  toggleAiQuestionDiagram,
  deleteAiQuestion,
  addAiQuestionsNote,
  aiQuestionsDiagramSyncByStepId,
  aiNoteStatus,
  moveStep,
  graphOrderLocked,
  isTimelineFiltering,
  deleteStep,
  subprocessCatalog,
}) {
  const [expandedAllAnnotations, setExpandedAllAnnotations] = useState(false);
  const [expandedByStepId, setExpandedByStepId] = useState({});
  const [expandedLongAnnotationById, setExpandedLongAnnotationById] = useState({});

  const timelineSignature = useMemo(
    () =>
      toArray(timelineView)
        .map((step) => toText(step?.id))
        .filter(Boolean)
        .join("|"),
    [timelineView],
  );

  const totalXmlAnnotations = useMemo(() => {
    return Object.values(xmlTextAnnotationsByStepId || {}).reduce((sum, list) => sum + toArray(list).length, 0);
  }, [xmlTextAnnotationsByStepId]);

  useEffect(() => {
    setExpandedAllAnnotations(false);
    setExpandedByStepId({});
    setExpandedLongAnnotationById({});
  }, [timelineSignature]);

  const toggleRowAnnotations = useCallback((stepId) => {
    const key = toText(stepId);
    if (!key) return;
    setExpandedByStepId((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const toggleAnnotationDetails = useCallback((annotationId) => {
    const key = toText(annotationId);
    if (!key) return;
    setExpandedLongAnnotationById((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  return (
    <div className="interviewTableWrap">
      <table className="interviewTable">
        <thead>
          <tr>
            <th>№</th>
            {!hiddenTimelineCols.t_plus ? <th>T+</th> : null}
            {!hiddenTimelineCols.area ? <th>Цех/участок</th> : null}
            {!hiddenTimelineCols.lane ? <th>Лайн</th> : null}
            {!hiddenTimelineCols.subprocess ? <th>Подпроцесс</th> : null}
            {!hiddenTimelineCols.type ? <th>Тип шага</th> : null}
            <th>Шаг</th>
            {!hiddenTimelineCols.node ? <th>Узел BPMN</th> : null}
            {!hiddenTimelineCols.comment ? (
              <th>
                <div className="interviewAnnotationHeaderCell">
                  <span>Аннотации BPMN</span>
                  <button
                    type="button"
                    className="secondaryBtn smallBtn interviewAnnotationGlobalBtn"
                    onClick={() => setExpandedAllAnnotations((prev) => !prev)}
                    disabled={totalXmlAnnotations === 0}
                  >
                    {expandedAllAnnotations ? "Свернуть все" : "Показать все"}
                  </button>
                </div>
              </th>
            ) : null}
            {!hiddenTimelineCols.role ? <th>Роль</th> : null}
            {!hiddenTimelineCols.duration ? <th>Длительность (мин)</th> : null}
            {!hiddenTimelineCols.wait ? <th>Ожидание (мин)</th> : null}
            {!hiddenTimelineCols.output ? <th>Выход шага (физически)</th> : null}
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {!filteredTimelineView.length ? (
            <tr>
              <td colSpan={timelineColSpan} className="muted interviewEmpty">
                {timelineView.length ? "По текущим фильтрам шаги не найдены." : "Добавьте первый шаг процесса."}
              </td>
            </tr>
          ) : (
            filteredTimelineView.map((step, idx) => {
              const stepLaneKey = toText(step?.lane_key) || toText(step?.lane_name);
              const normalizedLaneFilter = toText(timelineLaneFilter);
              const isLaneActive = !!(
                normalizedLaneFilter &&
                normalizedLaneFilter !== "all" &&
                (stepLaneKey === normalizedLaneFilter || toText(step?.lane_name) === normalizedLaneFilter)
              );
              const laneAccent =
                toText(step?.lane_color) ||
                laneColor(stepLaneKey || toText(step?.id), Number(step?.lane_idx) || 0);
              const annotationSync = annotationSyncByStepId?.[toText(step.id)] || { status: "empty", label: "нет аннотаций BPMN" };
              const stepAnnotations = toArray(xmlTextAnnotationsByStepId?.[toText(step.id)]).map((item, annIdx) => {
                const annotationId = toText(item?.annotationId) || `${toText(step.id)}_annotation_${annIdx + 1}`;
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
              const rowExpanded = expandedAllAnnotations || !!expandedByStepId[toText(step.id)];
              const aiCueActive = aiCue?.stepId === step.id;
              const aiCueStatus = toText(aiCue?.runStatus).toLowerCase() || (toText(aiCue?.error) ? "error" : "success");
              const aiCueLoading = aiCueStatus === "opening" || aiCueStatus === "loading";
              const aiCueProgressText = toText(aiCue?.progressText)
                || (aiCueLoading ? "Генерирую вопросы..." : (aiCueStatus === "error" ? "Ошибка AI" : "Готово"));
              const aiCueErrorText = toText(aiCue?.errorText || aiCue?.error);
              const aiCueQuestions = toArray(aiCue?.questions);
              const incomingLaneLinks = mergeLaneLinks(
                laneLinksByNode.incomingByNode[toText(step.node_bind_id)],
                laneLinksByNode.incomingByStep[toText(step.id)],
              );
              const outgoingLaneLinks = mergeLaneLinks(
                laneLinksByNode.outgoingByNode[toText(step.node_bind_id)],
                laneLinksByNode.outgoingByStep[toText(step.id)],
              );
              return (
                <Fragment key={step.id}>
                  {toText(step.subprocess) && (idx === 0 || toText(filteredTimelineView[idx - 1]?.subprocess) !== toText(step.subprocess)) ? (
                    <tr className="interviewSubprocessRow">
                      <td colSpan={timelineColSpan}>
                        <span className="interviewSubprocessTag">Подпроцесс: {step.subprocess}</span>
                      </td>
                    </tr>
                  ) : null}
                  <tr
                    className={[
                      "interviewStepRow",
                      aiCueActive ? "hasAiCue" : "",
                      isLaneActive ? "isLaneActive" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ "--lane-accent": laneAccent }}
                  >
                    <td>{step.seq}</td>
                    {!hiddenTimelineCols.t_plus ? <td className="nowrap">{step.t_plus}</td> : null}
                    {!hiddenTimelineCols.area ? (
                      <td>
                        <input className="input" value={step.area} onChange={(e) => patchStep(step.id, "area", e.target.value)} placeholder="Цех/участок" />
                      </td>
                    ) : null}
                    {!hiddenTimelineCols.lane ? (
                      <td>
                        <div className="interviewLaneCell">
                          <span className="interviewLaneBadge" style={{ "--lane-accent": laneAccent }}>
                            <span className="interviewLaneDot" />
                            {laneLabel(step.lane_name, step.lane_idx)}
                          </span>
                          {incomingLaneLinks.length || outgoingLaneLinks.length ? (
                            <div className="interviewLaneFlow">
                              {incomingLaneLinks.map((x) => (
                                <span
                                  key={`in_${step.id}_${x.laneKey}`}
                                  className="interviewLaneFlowBadge in"
                                  style={{ "--lane-accent": x.laneColor }}
                                  title="В этот шаг есть вход из другого лайна (по BPMN-связям)"
                                >
                                  ← из {laneLabel(x.laneName, x.laneIdx)}
                                </span>
                              ))}
                              {outgoingLaneLinks.map((x) => (
                                <span
                                  key={`out_${step.id}_${x.laneKey}`}
                                  className="interviewLaneFlowBadge out"
                                  style={{ "--lane-accent": x.laneColor }}
                                  title="Из этого шага есть выход в другой лайн (по BPMN-связям)"
                                >
                                  → в {laneLabel(x.laneName, x.laneIdx)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                    {!hiddenTimelineCols.subprocess ? (
                      <td>
                        <input
                          className="input"
                          list="interviewSubprocesses"
                          value={step.subprocess || ""}
                          onChange={(e) => patchStep(step.id, "subprocess", e.target.value)}
                          placeholder="Без подпроцесса"
                        />
                      </td>
                    ) : null}
                    {!hiddenTimelineCols.type ? (
                      <td>
                        <select className="select" value={step.type} onChange={(e) => patchStep(step.id, "type", e.target.value)}>
                          {STEP_TYPES.map((x) => (
                            <option value={x.value} key={x.value}>{x.label}</option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                    <td>
                      <input
                        className="input"
                        value={step.action}
                        onChange={(e) => patchStep(step.id, "action", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            addStepAfter(step.id, step.type || "operation", "");
                          }
                        }}
                        placeholder="Глагол + объект"
                      />
                    </td>
                    {!hiddenTimelineCols.node ? (
                      <td>
                        <select
                          className={"select interviewNodeBindSelect " + (step.node_bound ? "isBound" : "isMissing")}
                          value={step.node_bind_id || ""}
                          onChange={(e) => patchStep(step.id, "node_id", e.target.value)}
                        >
                          <option value="">— авто по названию —</option>
                          {toArray(nodeBindOptionsByStepId[step.id]).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className={"interviewNodeBindHint " + (step.node_bound ? "ok" : "warn")}>
                          {step.node_bound
                            ? `↳ ${toText(step.node_bind_title) || step.node_bind_id}`
                            : step.node_bind_id
                              ? "узел не найден в текущей диаграмме"
                              : "свяжется автоматически при уникальном названии"}
                        </div>
                      </td>
                    ) : null}
                    {!hiddenTimelineCols.comment ? (
                      <td>
                        <div className="interviewAnnotationCell">
                          <div className="interviewAnnotationMain">
                            <input
                              className="input"
                              value={step.comment || ""}
                              onChange={(e) => patchStep(step.id, "comment", e.target.value)}
                              placeholder="Текст аннотации BPMN"
                            />
                            <button
                              type="button"
                              className="secondaryBtn smallBtn interviewAnnotationAddBtn"
                              onClick={() => {
                                void addTextAnnotation(step);
                              }}
                              title="Добавить аннотацию в BPMN"
                            >
                              +
                            </button>
                          </div>
                          <div className={`interviewAnnotationState ${annotationSync.status || "empty"}`}>
                            {annotationSync.label}
                          </div>
                          <div className="interviewAnnotationSummary">
                            <span className={"badge " + (stepAnnotations.length ? "ok" : "muted")}>
                              Аннотации: {stepAnnotations.length}
                            </span>
                            <button
                              type="button"
                              className="secondaryBtn smallBtn interviewAnnotationToggleBtn"
                              onClick={() => toggleRowAnnotations(step.id)}
                              disabled={!stepAnnotations.length}
                            >
                              {rowExpanded ? "Скрыть список" : "Показать список"}
                            </button>
                          </div>
                          {rowExpanded && stepAnnotations.length ? (
                            <div className="interviewAnnotationList">
                              {stepAnnotations.map((annotation, annIdx) => {
                                const expanded = expandedAllAnnotations || !!expandedLongAnnotationById[annotation.annotationId];
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
                                          onClick={() => toggleAnnotationDetails(annotation.annotationId)}
                                        >
                                          {expanded ? "Свернуть" : "Развернуть"}
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                    {!hiddenTimelineCols.role ? (
                      <td>
                        <input className="input" value={step.role} onChange={(e) => patchStep(step.id, "role", e.target.value)} placeholder="Роль" />
                      </td>
                    ) : null}
                    {!hiddenTimelineCols.duration ? (
                      <td>
                        <div className="interviewTimeCell">
                          <input
                            className="input"
                            type="number"
                            min="0"
                            value={step.duration_min}
                            onChange={(e) => patchStep(step.id, "duration_min", e.target.value)}
                          />
                          <span className={"interviewBadge dur " + durationClass(step.duration)}>{durationLabel(step.duration)}</span>
                        </div>
                      </td>
                    ) : null}
                    {!hiddenTimelineCols.wait ? (
                      <td>
                        <div className="interviewTimeCell">
                          <input
                            className="input"
                            type="number"
                            min="0"
                            value={step.wait_min}
                            onChange={(e) => patchStep(step.id, "wait_min", e.target.value)}
                          />
                          {step.wait > 0 ? <span className="interviewBadge wait">⏳ {step.wait}</span> : null}
                        </div>
                      </td>
                    ) : null}
                    {!hiddenTimelineCols.output ? (
                      <td>
                        <input className="input" value={step.output} onChange={(e) => patchStep(step.id, "output", e.target.value)} placeholder="Что выходит" />
                      </td>
                    ) : null}
                    <td>
                      <div className="interviewRowActions">
                        <button type="button" className="secondaryBtn smallBtn" onClick={() => addAiQuestions(step)} disabled={!!aiBusyStepId}>
                          {aiBusyStepId === step.id ? "AI..." : "AI"}
                        </button>
                        <button
                          type="button"
                          className="secondaryBtn smallBtn"
                          onClick={() => moveStep(step.id, -1)}
                          disabled={graphOrderLocked || isTimelineFiltering || idx === 0}
                          title={graphOrderLocked ? "Порядок шагов берётся из BPMN-схемы" : isTimelineFiltering ? "Отключите фильтры, чтобы менять порядок вручную" : ""}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="secondaryBtn smallBtn"
                          onClick={() => moveStep(step.id, 1)}
                          disabled={graphOrderLocked || isTimelineFiltering || idx === filteredTimelineView.length - 1}
                          title={graphOrderLocked ? "Порядок шагов берётся из BPMN-схемы" : isTimelineFiltering ? "Отключите фильтры, чтобы менять порядок вручную" : ""}
                        >
                          ↓
                        </button>
                        <button type="button" className="dangerBtn smallBtn" onClick={() => deleteStep(step.id)}>удалить</button>
                      </div>
                    </td>
                  </tr>
                  {aiCueActive ? (
                    <tr className="interviewAiRow">
                      <td colSpan={timelineColSpan}>
                        <div className={"interviewAiCue " + ((aiCueErrorText || aiCue.reused) ? "reused" : "added")}>
                          <div className="interviewAiCueHead">
                            <div className="interviewAiCueTitle">
                              ✦ AI · шаг {aiCue.stepSeq || "?"} ({typeLabel(aiCue.stepType)})
                            </div>
                            <button type="button" className="iconBtn interviewAiCueClose" onClick={() => setAiCue(null)} title="Закрыть">
                              ×
                            </button>
                          </div>
                          <div className="interviewAiCueSub">{aiCue.stepTitle}</div>
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
                                  onClick={() => addAiQuestions(step, { forceRefresh: true })}
                                  disabled={aiBusyStepId === step.id}
                                >
                                  {aiBusyStepId === step.id ? "Повтор..." : "Повторить"}
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
                                {aiCue.added > 0
                                  ? `LLM добавил новых вопросов: ${aiCue.added}.`
                                  : `LLM вернул вопросы по шагу: ${Number(aiCue.total || aiCueQuestions.length || 0)}.`}
                              </div>
                              <div className="interviewAiCueActions">
                                {aiCue.canRebuild ? (
                                  <button
                                    type="button"
                                    className="secondaryBtn smallBtn"
                                    onClick={() => addAiQuestions(step, { forceRefresh: true })}
                                    disabled={aiBusyStepId === step.id}
                                    title="Запросить LLM и добрать список до 5 вопросов"
                                  >
                                    {aiBusyStepId === step.id ? "Пересобираю..." : "Пересобрать список"}
                                  </button>
                                ) : (
                                  <span className="badge ok">Лимит достигнут: 5/5</span>
                                )}
                                <span className="muted small">Отметьте вопросы и привяжите их к выбранному BPMN-элементу.</span>
                                <button
                                  type="button"
                                  className="secondaryBtn smallBtn"
                                  onClick={() => {
                                    void addAiQuestionsNote(step);
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
                                        onChange={(e) => toggleAiQuestionDiagram(step.id, q.id, e.target.checked)}
                                      />
                                      <span>{q.text}</span>
                                    </label>
                                    <button
                                      type="button"
                                      className="dangerBtn smallBtn"
                                      onClick={() => deleteAiQuestion(step.id, q.id)}
                                      title="Удалить вопрос из списка шага"
                                    >
                                      удалить
                                    </button>
                                  </div>
                                ))}
                              </div>
                              {aiNoteStatus?.stepId === step.id ? (
                                <div className={`interviewAiNoteStatus ${aiNoteStatus.status || "pending"}`}>
                                  {aiNoteStatus.text}
                                </div>
                              ) : null}
                              {aiQuestionsDiagramSyncByStepId?.[step.id] && aiNoteStatus?.stepId === step.id && aiNoteStatus?.status !== "ok" ? (
                                <div className="interviewAiCueMuted">
                                  Проверка: {Number(aiQuestionsDiagramSyncByStepId[step.id]?.presentCount || 0)}/{Number(aiQuestionsDiagramSyncByStepId[step.id]?.selectedCount || 0)} отмеченных вопросов привязаны к BPMN-элементам.
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
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
      <datalist id="interviewSubprocesses">
        {subprocessCatalog.map((sp) => (
          <option key={sp} value={sp} />
        ))}
      </datalist>
    </div>
  );
}
