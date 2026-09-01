import { Fragment } from "react";
import ProcessPanels from "./ProcessPanels";
import BpmnFpsMeter from "../../../../components/process/BpmnFpsMeter";
import ModeSwitchSegment from "../../../../components/ModeSwitchSegment";
import { getFirstPickedFile } from "./fileInputEvent.js";
import { resolvePublishedRevisionBadgeView } from "./revisionBadgePolicy.js";

function toText(value) {
  return String(value || "").trim();
}

// A7: действия «Сохранить»/«Создать версию BPMN» — иконки с тултипами (без внешней icon-библиотеки).
function SaveIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function VersionIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

// B3 (addendum-4): пометки «in progress» для незавершённых представлений.
// «Diagram (BPMN)» и «XML» — готовые, без пометки. Пометка информативна, не блокирует.
const IN_PROGRESS_TABS = new Set(["interview", "doc", "dod"]);
const IN_PROGRESS_HINT = "Представление в разработке — часть функций может отсутствовать";

function InProgressBadge({ testid }) {
  return (
    <span
      className="pointer-events-auto absolute left-1 top-[1px] rounded-sm border border-warning/40 bg-warning/20 px-1 text-[6px] font-bold lowercase leading-[9px] tracking-normal text-warning"
      title={IN_PROGRESS_HINT}
      data-testid={testid}
    >
      in progress
    </span>
  );
}

export default function ProcessStageHeader({ view = {} }) {
  const {
    canCreateRevisionNow,
    createRevisionNoDiffHintVisible,
    createRevisionNoDiffHintText,
    saveActionText,
    createRevisionActionText,
    saveUploadStatus,
    saveConflictActions,
    sessionRevisionHistorySnapshot,
    handleSaveCurrentTab,
    handleCreateRevisionAction,
    handleUndoAction,
    handleRedoAction,
    canUndo,
    canRedo,
    workbench,
    tab,
    isSwitchingTab,
    isFlushingTab,
    switchTab,
    hasSession,
    attentionOpen,
    toggleAttentionPanel,
    attentionItemsRaw,
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
    sessionPresenceView,
    featureFlags,
    tobeEntry,
    modeSwitch, // UXF addendum-3: сегмент «Схема | TO BE» справа от вкладки Diagram
  } = view;
  const publishedRevisionBadge = resolvePublishedRevisionBadgeView(sessionRevisionHistorySnapshot);
  const latestPublishedRevisionNumber = Number(sessionRevisionHistorySnapshot?.latestPublishedRevisionNumber || 0);
  const latestRevisionNumber = Number(sessionRevisionHistorySnapshot?.latestRevisionNumber || 0);
  const resolvedVersionNumber = latestPublishedRevisionNumber > 0
    ? latestPublishedRevisionNumber
    : (latestRevisionNumber > 0 ? latestRevisionNumber : 0);
  const versionChipLabel = resolvedVersionNumber > 0 ? `V. ${resolvedVersionNumber}` : "V. —";
  const versionChipTitle = resolvedVersionNumber > 0
    ? `Текущая версия: ${resolvedVersionNumber}`
    : (publishedRevisionBadge.title || "Версия пока не создана.");
  const isConflictState = toText(saveUploadStatus?.state) === "conflict";
  const showConflictModalActive = isConflictState && saveConflictActions?.visible === true;
  const uploadStatusState = toText(saveUploadStatus?.state);
  const showUploadStatusBadge = saveUploadStatus?.visible
    && !showConflictModalActive
    && (uploadStatusState === "save_failed" || uploadStatusState === "conflict");
  const showSessionPresenceBadge = hasSession && sessionPresenceView?.visible === true && !showConflictModalActive;
  const canCreateRevisionFromCurrentState = canCreateRevisionNow !== false
    && typeof handleCreateRevisionAction === "function";
  const showCreateRevisionNoDiffHint = hasSession
    && createRevisionNoDiffHintVisible === true;
  const revisionActionTitle = showCreateRevisionNoDiffHint
    ? "Версия BPMN не будет создана: нет изменений сессии после последней версии BPMN."
    : (!canCreateRevisionFromCurrentState
      ? "Создание версии BPMN временно недоступно."
      : "Создать версию BPMN из текущего состояния сессии.");
  const canRunUndo = tab === "diagram" && canUndo === true;
  const canRunRedo = tab === "diagram" && canRedo === true;

  return (
    <div className="processHeader diagramToolbarHeader">
      <div className="diagramToolbarSlot diagramToolbarSlot--left">
        <div className="flex items-center gap-2">
          {hasSession ? (
            <>
              {/* B1: действие «Сохранить» — иконка с тултипом */}
              <span
                className="headerActionPair flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-panel2/40 py-0.5 pl-0.5 pr-2"
                title="Сохранить сессию"
                data-testid="diagram-toolbar-save-pair"
              >
                <button
                  type="button"
                  className="primaryBtn processSaveBtn grid h-7 w-7 shrink-0 place-items-center px-0"
                  onClick={handleSaveCurrentTab}
                  title={workbench.saveTooltip}
                  aria-label={toText(saveActionText) || "Сохранить сессию"}
                  data-testid="diagram-toolbar-save"
                >
                  <SaveIcon className="h-4 w-4" />
                </button>
              </span>
              {/* B1: пара «Новая версия · V» — тот же паттерн */}
              <span
                className="headerActionPair flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-panel2/40 py-0.5 pl-0.5 pr-2"
                title={`Новая версия · текущая ${resolvedVersionNumber > 0 ? `V.${resolvedVersionNumber}` : "V.—"}`}
                data-testid="diagram-toolbar-version-pair"
              >
                <button
                  type="button"
                  className="secondaryBtn grid h-7 w-7 shrink-0 place-items-center px-0"
                  onClick={handleCreateRevisionAction}
                  disabled={!canCreateRevisionFromCurrentState}
                  title={revisionActionTitle}
                  aria-label={toText(createRevisionActionText) || "Создать версию BPMN"}
                  data-testid="diagram-toolbar-create-revision"
                >
                  <VersionIcon className="h-4 w-4" />
                </button>
                <span
                  className="whitespace-nowrap text-[11px] font-semibold leading-none text-muted"
                  data-testid="diagram-toolbar-version-chip"
                  title={versionChipTitle}
                >
                  {versionChipLabel}
                </span>
              </span>
            </>
          ) : (
            <button
              type="button"
              className="secondaryBtn grid h-8 w-8 shrink-0 place-items-center px-0"
              disabled
              title={workbench.saveTooltip}
              aria-label={workbench.labels.save}
            >
              <SaveIcon className="h-4 w-4" />
            </button>
          )}
          {hasSession && showCreateRevisionNoDiffHint ? (
            <span
              className="badge text-[11px] text-muted truncate max-w-[220px]"
              title={revisionActionTitle}
              data-testid="diagram-toolbar-create-revision-no-diff-hint"
            >
              {toText(createRevisionNoDiffHintText) || "Нет изменений сессии после последней версии BPMN"}
            </span>
          ) : null}
          {featureFlags?.bpmn_fps_meter_enabled ? (
            <div className="ml-2" style={{ display: "inline-block", verticalAlign: "middle" }}>
              <BpmnFpsMeter enabled={true} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="diagramToolbarSlot diagramToolbarSlot--center">
        <div className="seg" role="tablist" aria-label="Process tabs" aria-orientation="horizontal">
          {workbench.tabs.map((x) => {
            const isEnabled = !!hasSession && !isSwitchingTab && !isFlushingTab;
            const isActive = isEnabled && tab === x.id;
            const isDisabled = !isEnabled;
            return (
            <Fragment key={x.id}>
            <button
              type="button"
              className={`segBtn relative rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${isActive ? "on bg-accent text-white" : isDisabled ? "isDisabled text-muted" : "text-muted hover:bg-accentSoft hover:text-fg"}`}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              tabIndex={isActive ? 0 : -1}
              disabled={!hasSession || isSwitchingTab || isFlushingTab}
              title={IN_PROGRESS_TABS.has(x.id) ? IN_PROGRESS_HINT : undefined}
              onClick={async () => {
                await switchTab(x.id);
              }}
            >
              {IN_PROGRESS_TABS.has(x.id) ? <InProgressBadge testid={`tab-in-progress-${x.id}`} /> : null}
              {x.label}
            </button>
            {x.id === "diagram" && modeSwitch ? (
              <>
                <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
                <ModeSwitchSegment modeSwitch={modeSwitch} />
                <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
              </>
            ) : null}
            </Fragment>
            );
          })}
        </div>
      </div>

      <div className="diagramToolbarSlot diagramToolbarSlot--right">
        <div className="diagramToolbarRightStatus">
          <span
            className="diagramToolbarNotificationAnchor"
            data-testid="diagram-toolbar-notification-anchor"
            aria-hidden="true"
          />
          {showSessionPresenceBadge ? (
            <span
              className="badge inline-flex items-center gap-1.5 text-[11px] text-muted"
              data-testid="diagram-toolbar-session-presence"
              title={String(sessionPresenceView?.title || "")}
              aria-label={String(sessionPresenceView?.title || "")}
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-info/45 bg-info/10 text-[9px] font-bold leading-none text-info" aria-hidden="true">
                {String(sessionPresenceView?.iconLabel || "•")}
              </span>
              <span className="min-w-0 max-w-[150px] truncate">{String(sessionPresenceView?.label || "")}</span>
            </span>
          ) : null}
          {showUploadStatusBadge ? (
            <span
              className={`badge text-[11px] ${String(saveUploadStatus?.tone || "").trim()}`}
              data-testid="diagram-toolbar-save-upload-status"
              title={String(saveUploadStatus?.title || saveUploadStatus?.label || "")}
            >
              {String(saveUploadStatus?.label || "")}
            </span>
          ) : null}
        </div>
        <div className="diagramToolbarRightActions">
          {/* B2 (addendum-4): «Создать TO BE» убрана из хедера — дубль; входы:
              переключатель «Схема|TO BE» в группе представлений + секция TO BE в сайдбаре. */}
          {hasSession ? (
            <>
              <button
                type="button"
                className="secondaryBtn h-8 w-8 px-0 text-base leading-none"
                onClick={handleUndoAction}
                disabled={!canRunUndo}
                title="Шаг назад"
                aria-label="Шаг назад"
                data-testid="diagram-toolbar-undo"
              >
                <span aria-hidden="true">↶</span>
              </button>
              <button
                type="button"
                className="secondaryBtn h-8 w-8 px-0 text-base leading-none"
                onClick={handleRedoAction}
                disabled={!canRunRedo}
                title="Повторить отменённое действие"
                aria-label="Повторить отменённое действие"
                data-testid="diagram-toolbar-redo"
              >
                <span aria-hidden="true">↷</span>
              </button>
            </>
          ) : null}
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
      </div>

      <input id="diagram-import-bpmn-input" name="import_bpmn" ref={importInputRef} type="file" accept=".bpmn,.xml,text/xml,application/xml" style={{ display: "none" }} onChange={onImportPicked} />
      <input
        id="diagram-import-hybrid-input"
        name="import_hybrid"
        ref={hybridV2FileInputRef}
        type="file"
        accept=".drawio,.xml,text/xml,application/xml"
        style={{ display: "none" }}
        data-testid="hybrid-v2-import-input"
        onChange={(event) => {
          const file = getFirstPickedFile(event);
          if (file) {
            void handleHybridV2ImportFile(file);
          }
          if (event?.target) event.target.value = "";
        }}
      />
      <input
        id="diagram-import-drawio-input"
        name="import_drawio"
        ref={drawioFileInputRef}
        type="file"
        accept=".drawio,.xml,text/xml,application/xml"
        style={{ display: "none" }}
        data-testid="drawio-import-input"
        onChange={(event) => {
          const file = getFirstPickedFile(event);
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
