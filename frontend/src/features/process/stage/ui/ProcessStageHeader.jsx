import ProcessPanels, { ProcessDiagramModeSwitch } from "./ProcessPanels";

export default function ProcessStageHeader({ view = {} }) {
  const {
    canSaveNow,
    saveDirtyHint,
    saveSmartText,
    handleSaveCurrentTab,
    workbench,
    tab,
    diagramMode,
    applyDiagramMode,
    isSwitchingTab,
    isFlushingTab,
    switchTab,
    hasSession,
    attentionOpen,
    toggleAttentionPanel,
    attentionItemsRaw,
    toolbarInlineMessage,
    toolbarInlineTone,
    doGenerate,
    toolbarMenuButtonRef,
    toggleToolbarMenu,
    toolbarMenuOpen,
    importInputRef,
    onImportPicked,
    hybridV2FileInputRef,
    handleHybridV2ImportFile,
    drawioFileInputRef,
    handleDrawioImportFile,
    topPanelsView,
    asArray,
  } = view;

  return (
    <div className="processHeader diagramToolbarHeader">
      <div className="diagramToolbarSlot diagramToolbarSlot--left">
        {canSaveNow ? (
          saveDirtyHint ? (
            <button
              type="button"
              className="primaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
              onClick={handleSaveCurrentTab}
              title={workbench.saveTooltip}
              data-testid="diagram-toolbar-save"
            >
              {saveSmartText}
            </button>
          ) : (
            <span className="badge text-[11px] text-muted" data-testid="diagram-toolbar-save-status">
              {saveSmartText}
            </span>
          )
        ) : (
          <button
            type="button"
            className="secondaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
            disabled
            title={workbench.saveTooltip}
          >
            {workbench.labels.save}
          </button>
        )}
      </div>

      <div className="diagramToolbarSlot diagramToolbarSlot--center">
        <div className="seg" role="tablist" aria-label="Process tabs" aria-orientation="horizontal">
          {workbench.tabs.map((x) => (
            <button
              type="button"
              key={x.id}
              className={`segBtn rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${tab === x.id ? "on bg-accent text-white" : "text-muted hover:bg-accentSoft hover:text-fg"}`}
              role="tab"
              aria-selected={tab === x.id}
              aria-current={tab === x.id ? "page" : undefined}
              tabIndex={tab === x.id ? 0 : -1}
              disabled={isSwitchingTab || isFlushingTab}
              onClick={async () => {
                await switchTab(x.id);
              }}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div className="diagramToolbarSlot diagramToolbarSlot--right">
        {tab === "diagram" ? (
          <ProcessDiagramModeSwitch diagramMode={diagramMode} applyDiagramMode={applyDiagramMode} />
        ) : null}
        {(tab === "diagram" || tab === "interview") && hasSession ? (
          <button
            type="button"
            className={`secondaryBtn h-8 whitespace-nowrap px-2.5 text-xs ${attentionOpen ? "ring-1 ring-accent/60" : ""}`}
            onClick={toggleAttentionPanel}
            data-testid="attention-panel-toggle"
            title="Открыть список узлов с пробелами"
          >
            Требует внимания ({attentionItemsRaw.length})
          </button>
        ) : null}
        {toolbarInlineMessage ? (
          <span
            className={`badge hidden max-w-[36ch] truncate lg:inline-flex ${toolbarInlineTone ? toolbarInlineTone : ""}`}
            title={toolbarInlineMessage}
          >
            {toolbarInlineMessage}
          </span>
        ) : null}
        <button
          type="button"
          className="primaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
          onClick={doGenerate}
          disabled={!workbench.canGenerate}
          title={workbench.generateTooltip}
        >
          {workbench.generateLabel}
        </button>
        <button
          ref={toolbarMenuButtonRef}
          type="button"
          className="secondaryBtn h-8 w-9 px-0 text-sm"
          onClick={toggleToolbarMenu}
          aria-expanded={toolbarMenuOpen ? "true" : "false"}
          aria-label="Открыть меню действий"
          data-testid="diagram-toolbar-overflow-toggle"
        >
          ⋯
        </button>
      </div>

      <input ref={importInputRef} type="file" accept=".bpmn,.xml,text/xml,application/xml" style={{ display: "none" }} onChange={onImportPicked} />
      <input
        ref={hybridV2FileInputRef}
        type="file"
        accept=".drawio,.xml,text/xml,application/xml"
        style={{ display: "none" }}
        data-testid="hybrid-v2-import-input"
        onChange={(event) => {
          const file = asArray(event?.target?.files)[0];
          if (file) {
            void handleHybridV2ImportFile(file);
          }
          if (event?.target) event.target.value = "";
        }}
      />
      <input
        ref={drawioFileInputRef}
        type="file"
        accept=".drawio,.xml,text/xml,application/xml"
        style={{ display: "none" }}
        data-testid="drawio-import-input"
        onChange={(event) => {
          const file = asArray(event?.target?.files)[0];
          if (file) {
            void handleDrawioImportFile(file);
          }
          if (event?.target) event.target.value = "";
        }}
      />

      <ProcessPanels section="top" view={topPanelsView} />
    </div>
  );
}
