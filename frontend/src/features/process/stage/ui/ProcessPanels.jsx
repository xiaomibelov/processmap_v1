import DiagramToolbarOverflowMenu from "./DiagramToolbarOverflowMenu";

export default function ProcessPanels({ section = "top", view = {} }) {
  const {
    toolbarMenuOpen,
    toolbarMenuRef,
    applyDiagramMode,
    commandModeEnabled,
    setCommandModeEnabled,
    openImportDialog,
    closeToolbarMenu,
    hasSession,
    isBpmnTab,
    workbench,
    exportBpmn,
    exportSessionZip,
    openVersionsModal,
    selectedElementId,
    openInsertBetweenModal,
    insertBetweenBusy,
    selectedInsertBetween,
    canInsertBetween,
    insertBetweenErrorMessage,
    onOpenElementNotes,
    selectedBpmnElement,
    generateAiQuestionsForSelectedElement,
    canGenerateAiQuestions,
    aiGenerateGate,
    aiQuestionsBusy,
    aiQuestionsStatus,
    runToolbarReset,
    runToolbarClear,
    openTemplatesPicker,
    openCreateTemplateModal,
    canCreateTemplateFromSelection,
    templateSelectionCount,
    isQualityMode,
    qualitySummary,
    qualityProfile,
    qualityProfileId,
    setQualityProfileId,
    openQualityAutoFix,
    qualityAutoFixBusy,
    qualityAutoFixPreview,
    qualityHints,
    toNodeId,
    qualityIssueFocusKey,
    qualityNodeTitleById,
    coverageById,
    qualityIssueCopy,
    focusQualityIssue,
    qualityLevelLabel,
    qualityImpactLabel,
    isCoverageMode,
    coverageMatrix,
    coverageRows,
    focusCoverageIssue,
    aiBottleneckOn,
    apiClarifyHints,
    activeHints,
    tab,
    attentionOpen,
    attentionItemsRaw,
    closeAttentionPanel,
    attentionFilters,
    toggleAttentionFilter,
    attentionItems,
    focusAttentionItem,
    asArray,
  } = view;

  if (section === "attention") {
    return (tab === "diagram" || tab === "interview") && hasSession && attentionOpen ? (
      <div className="attentionPanel" data-testid="attention-panel">
        <div className="attentionPanelHead">
          <div className="attentionPanelTitle">
            <span>Требует внимания</span>
            <span className="attentionPanelCount">{attentionItemsRaw.length}</span>
          </div>
          <button
            type="button"
            className="secondaryBtn h-7 px-2 text-[11px]"
            onClick={closeAttentionPanel}
            aria-label="Закрыть панель Требует внимания"
          >
            Закрыть
          </button>
        </div>
        <div className="attentionPanelFilters">
          <label className="attentionPanelFilter">
            <input
              type="checkbox"
              checked={!!attentionFilters?.quality}
              onChange={() => toggleAttentionFilter("quality")}
              data-testid="attention-filter-quality"
            />
            <span>Только Quality</span>
          </label>
          <label className="attentionPanelFilter">
            <input
              type="checkbox"
              checked={!!attentionFilters?.ai}
              onChange={() => toggleAttentionFilter("ai")}
              data-testid="attention-filter-ai"
            />
            <span>Только AI</span>
          </label>
          <label className="attentionPanelFilter">
            <input
              type="checkbox"
              checked={!!attentionFilters?.notes}
              onChange={() => toggleAttentionFilter("notes")}
              data-testid="attention-filter-notes"
            />
            <span>Только Notes</span>
          </label>
        </div>
        {attentionItems.length === 0 ? (
          <div className="attentionPanelEmpty">
            {attentionItemsRaw.length === 0 ? "Пробелов не найдено." : "По выбранным фильтрам ничего не найдено."}
          </div>
        ) : (
          <div className="attentionPanelList">
            {attentionItems.map((item) => (
              <div
                key={`attention_${item.id}`}
                className="attentionItem"
                role="button"
                tabIndex={0}
                onClick={() => focusAttentionItem(item)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  focusAttentionItem(item);
                }}
                data-testid="attention-item"
                data-element-id={item.id}
              >
                <div className="attentionItemHead">
                  <div className="attentionItemTitle">{String(item?.title || item?.id || "").trim()}</div>
                  <div className="attentionItemFlags">
                    {item?.hasQuality ? <span className="attentionFlag is-quality">Quality</span> : null}
                    {item?.hasAiMissing ? <span className="attentionFlag is-ai">AI</span> : null}
                    {item?.hasNotesMissing ? <span className="attentionFlag is-notes">Notes</span> : null}
                  </div>
                </div>
                {String(item?.lane || "").trim() ? (
                  <div className="attentionItemLane">Lane: {String(item.lane).trim()}</div>
                ) : null}
                <ul className="attentionItemReasons">
                  {asArray(item?.reasons).slice(0, 3).map((reason, idx) => (
                    <li key={`attention_reason_${item.id}_${idx}`}>
                      {String(reason?.text || "").trim()}
                    </li>
                  ))}
                </ul>
                <div className="attentionItemActions">
                  <button
                    type="button"
                    className="primaryBtn h-7 px-2 text-[11px]"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      focusAttentionItem(item);
                    }}
                    data-testid="attention-item-focus"
                  >
                    Показать на схеме
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ) : null;
  }

  return (
    <>
      {toolbarMenuOpen ? (
        <DiagramToolbarOverflowMenu
          toolbarMenuRef={toolbarMenuRef}
          closeToolbarMenu={closeToolbarMenu}
          applyDiagramMode={applyDiagramMode}
          commandModeEnabled={commandModeEnabled}
          setCommandModeEnabled={setCommandModeEnabled}
          openImportDialog={openImportDialog}
          exportBpmn={exportBpmn}
          exportSessionZip={exportSessionZip}
          openVersionsModal={openVersionsModal}
          selectedElementId={selectedElementId}
          openInsertBetweenModal={openInsertBetweenModal}
          insertBetweenBusy={insertBetweenBusy}
          selectedInsertBetween={selectedInsertBetween}
          canInsertBetween={canInsertBetween}
          insertBetweenErrorMessage={insertBetweenErrorMessage}
          onOpenElementNotes={onOpenElementNotes}
          selectedBpmnElement={selectedBpmnElement}
          generateAiQuestionsForSelectedElement={generateAiQuestionsForSelectedElement}
          canGenerateAiQuestions={canGenerateAiQuestions}
          aiGenerateGate={aiGenerateGate}
          aiQuestionsBusy={aiQuestionsBusy}
          aiQuestionsStatus={aiQuestionsStatus}
          runToolbarReset={runToolbarReset}
          runToolbarClear={runToolbarClear}
          openTemplatesPicker={openTemplatesPicker}
          openCreateTemplateModal={openCreateTemplateModal}
          canCreateTemplateFromSelection={canCreateTemplateFromSelection}
          templateSelectionCount={templateSelectionCount}
          hasSession={hasSession}
          isBpmnTab={isBpmnTab}
          workbench={workbench}
        />
      ) : null}

      {isBpmnTab && isQualityMode ? (
        <div
          className="aiBottleneckPanel qualityPanel m-3 rounded-xl border border-border bg-panel px-3 py-2"
          data-testid="quality-panel"
          onWheelCapture={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="aiBottleneckHead text-sm font-semibold">
              Качество схемы: {qualitySummary.total}
              <span className="ml-2 text-xs text-muted">
                errors: {qualitySummary.errors} · warns: {qualitySummary.warns}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                className="input h-8 min-h-0 px-2 py-0 text-xs"
                value={qualityProfile?.id || qualityProfileId}
                onChange={(e) => setQualityProfileId(String(e.target.value || "mvp"))}
                data-testid="quality-profile-select"
              >
                <option value="mvp">MVP</option>
                <option value="production">Production</option>
                <option value="haccp">HACCP</option>
              </select>
              <button
                type="button"
                className="secondaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
                onClick={openQualityAutoFix}
                disabled={qualityAutoFixBusy || Number(qualityAutoFixPreview?.safeFixes || 0) <= 0}
                data-testid="quality-autofix-open"
              >
                Автоисправить ({Number(qualityAutoFixPreview?.safeFixes || 0)})
              </button>
            </div>
          </div>
          <div className="mb-2 text-xs text-muted">
            Профиль: <b className="text-fg">{qualityProfile?.title || qualityProfileId}</b>
            {qualityProfile?.isStub ? <span> · stub</span> : null}
            <span> · {qualityProfile?.description || ""}</span>
          </div>
          {qualityHints.length === 0 ? (
            <div className="muted small">Проблем не найдено.</div>
          ) : (
            <div className="aiBottleneckList qualityIssueList mt-2 space-y-1.5" onWheelCapture={(e) => e.stopPropagation()}>
              {qualityHints.map((item, idx) => {
                const nodeId = toNodeId(item?.nodeId);
                const reason = String(asArray(item?.reasons)[0] || "").trim() || "Проверьте элемент BPMN.";
                const key = `${nodeId}::${reason}`;
                const focused = key === qualityIssueFocusKey;
                const level = String(item?.level || "warn").toLowerCase() === "error" ? "error" : "warn";
                const nodeTitle = String(
                  qualityNodeTitleById[nodeId]
                  || coverageById[nodeId]?.title
                  || item?.title
                  || "",
                ).trim();
                const ui = qualityIssueCopy(item, nodeTitle);
                return (
                  <div
                    key={`${key}_${idx}`}
                    className={`aiBottleneckItem qualityIssueCard sev-${item.severity} w-full cursor-pointer rounded-lg border border-border bg-panel2 px-2 py-1 text-left ${focused ? "is-active ring-1 ring-accent/70" : ""}`}
                    onClick={() => focusQualityIssue(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        focusQualityIssue(item);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    data-testid="quality-issue-item"
                    data-node-id={nodeId}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <b>{ui.title}</b>
                      <span className={`badge px-1.5 py-0 text-[10px] ${level === "error" ? "err" : "warn"}`}>{qualityLevelLabel(item?.level)}</span>
                      <span className="text-[11px] text-muted">{qualityImpactLabel(item)}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">{ui.short}</div>
                    <div className="mt-0.5 text-[11px] text-muted">Узел: <span className="text-fg">{ui.nodeTitle}</span></div>
                    <div className="mt-0.5 text-[11px] text-muted">Как исправить: {ui.fix}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="primaryBtn h-7 px-2 text-[11px]"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          focusQualityIssue(item);
                        }}
                      >
                        Показать на схеме
                      </button>
                      <details
                        className="qualityIssueDetails text-[11px] text-muted"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <summary className="cursor-pointer select-none hover:text-fg">Подробнее</summary>
                        <div className="mt-1 space-y-0.5 rounded border border-border/70 bg-panel px-2 py-1.5">
                          <div><span className="text-muted">rule_code:</span> <span className="font-mono text-fg">{ui.ruleId}</span></div>
                          <div><span className="text-muted">node_id:</span> <span className="font-mono text-fg">{nodeId || "—"}</span></div>
                          <div><span className="text-muted">score:</span> <span className="text-fg">{Number(item?.score || 0)}</span></div>
                          <div><span className="text-muted">raw:</span> <span className="text-fg">{reason}</span></div>
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {isBpmnTab && isCoverageMode ? (
        <div className="aiBottleneckPanel m-3 rounded-xl border border-border bg-panel px-3 py-2" data-testid="coverage-panel">
          <div className="mb-1 flex items-center justify-between gap-2 text-sm font-semibold">
            <span>Покрытие: {Number(coverageMatrix?.summary?.total || 0)} элементов</span>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => applyDiagramMode("normal")}
            >
              Скрыть
            </button>
          </div>
          <div className="mb-2 text-xs text-muted">
            без notes: <b className="text-fg">{Number(coverageMatrix?.summary?.missingNotes || 0)}</b>
            <span> · без AI: <b className="text-fg">{Number(coverageMatrix?.summary?.missingAiQuestions || 0)}</b></span>
            <span> · без duration/quality: <b className="text-fg">{Number(coverageMatrix?.summary?.missingDurationQuality || 0)}</b></span>
          </div>
          {coverageRows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted">
              Пробелов покрытия не найдено.
            </div>
          ) : (
            <div className="max-h-48 space-y-2 overflow-auto pr-1">
              {coverageRows.slice(0, 20).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full rounded-lg border border-border bg-panel2 px-2 py-1.5 text-left"
                  onClick={() => focusCoverageIssue(item, "coverage_panel")}
                  data-testid="coverage-issue-item"
                  data-element-id={item.id}
                >
                  <div className="text-xs font-semibold text-fg">{item.title}</div>
                  <div className="text-[11px] text-muted">
                    {item.missingNotes ? "notes " : ""}
                    {item.missingAiQuestions ? "ai_questions " : ""}
                    {item.missingDurationQuality ? "duration/quality" : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {isBpmnTab && aiBottleneckOn ? (
        <div className="aiBottleneckPanel m-3 rounded-xl border border-border bg-panel px-3 py-2">
          <div className="aiBottleneckHead text-sm font-semibold">{apiClarifyHints.length ? "API-уточнения на узлах" : "AI-подсветка узких мест"}: {activeHints.length}</div>
          {activeHints.length === 0 ? (
            <div className="muted small">Критичных узлов не найдено по текущим данным.</div>
          ) : (
            <div className="aiBottleneckList mt-2 space-y-2">
              {activeHints.map((b) => (
                <div key={b.nodeId} className={`aiBottleneckItem sev-${b.severity} rounded-lg border border-border bg-panel2 px-2 py-1.5`}>
                  <b>{b.title}</b> · score {b.score}
                  <span className="muted small"> · {b.reasons.join("; ")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
