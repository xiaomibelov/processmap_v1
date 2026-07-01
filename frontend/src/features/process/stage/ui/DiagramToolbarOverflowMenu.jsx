import { useState } from "react";
import { ProcessDiagramModeSwitch } from "./ProcessPanels";

function MenuIcon({ children }) {
  return (
    <span className="diagramToolbarMenuIcon" aria-hidden="true">
      {children}
    </span>
  );
}

function MenuChevron({ open }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`diagramToolbarMenuChevron ${open ? "isOpen" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function MenuItem({
  icon,
  label,
  meta,
  disabled = false,
  active = false,
  onClick,
  children,
  "data-testid": dataTestId,
  role = "menuitem",
}) {
  return (
    <button
      type="button"
      role={role}
      aria-disabled={disabled ? "true" : "false"}
      aria-checked={role === "menuitemcheckbox" ? (active ? "true" : "false") : undefined}
      className={`diagramToolbarMenuItem ${disabled ? "diagramToolbarMenuItem--disabled" : ""} ${active ? "diagramToolbarMenuItem--active" : ""}`}
      onClick={disabled ? undefined : onClick}
      tabIndex={-1}
      data-testid={dataTestId}
    >
      {icon ? <MenuIcon>{icon}</MenuIcon> : null}
      <span className="diagramToolbarMenuLabel">{label}</span>
      {meta ? <span className="diagramToolbarMenuMeta">{meta}</span> : null}
      {children}
    </button>
  );
}

function MenuSection({ title, children }) {
  return (
    <div className="diagramToolbarMenuSection" role="group" aria-label={title}>
      {title ? <div className="diagramToolbarMenuSectionTitle">{title}</div> : null}
      {children}
    </div>
  );
}

export default function DiagramToolbarOverflowMenu({
  toolbarMenuRef,
  closeToolbarMenu,
  diagramMode,
  applyDiagramMode,
  commandModeEnabled,
  setCommandModeEnabled,
  openImportDialog,
  exportBpmn,
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
  openTemplatesPicker,
  runToolbarReset,
  runToolbarClear,
  hasSession,
  isBpmnTab,
  workbench,
}) {
  const [openSections, setOpenSections] = useState({ file: true, context: true });

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const closeAfter = (fn) => () => {
    fn?.();
    closeToolbarMenu?.();
  };

  const contextDisabled = !selectedElementId;
  const insertBetweenDisabled = insertBetweenBusy || !selectedInsertBetween || !canInsertBetween;
  const insertBetweenTitle = !selectedInsertBetween
    ? "Выберите шаг/переход"
    : !canInsertBetween
      ? insertBetweenErrorMessage?.(selectedInsertBetween?.error)
      : "Вставить шаг между";

  return (
    <div ref={toolbarMenuRef} className="diagramToolbarOverlay" data-testid="diagram-toolbar-overlay" role="menu">
      <MenuSection>
        <div className="diagramToolbarMenuModeRow lg:hidden">
          <ProcessDiagramModeSwitch
            diagramMode={diagramMode}
            applyDiagramMode={applyDiagramMode}
            className="seg"
            testId="diagram-mode-switch-menu"
          />
        </div>
        <MenuItem
          role="menuitemcheckbox"
          label="AI Команды"
          active={commandModeEnabled}
          meta={commandModeEnabled ? "ON" : "OFF"}
          onClick={() => setCommandModeEnabled?.((prev) => !prev)}
          data-testid="ai-command-toggle"
          icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h10" />
              <path d="M3 8h7" />
              <path d="M3 11h5" />
            </svg>
          }
        />
      </MenuSection>

      <MenuSection title="Файл">
        <button
          type="button"
          className="diagramToolbarMenuSectionHeader"
          onClick={() => toggleSection("file")}
          aria-expanded={openSections.file}
          aria-controls="ellipsis-file-submenu"
          tabIndex={-1}
        >
          <MenuIcon>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h12v10H2z" />
              <path d="M2 6h12" />
            </svg>
          </MenuIcon>
          <span className="diagramToolbarMenuLabel">Файл</span>
          <MenuChevron open={openSections.file} />
        </button>
        {openSections.file ? (
          <div id="ellipsis-file-submenu" className="diagramToolbarMenuSubmenu">
            <MenuItem
              label={workbench.labels.importBpmn}
              disabled={!hasSession || !isBpmnTab}
              title={workbench.importTooltip}
              onClick={closeAfter(openImportDialog)}
              data-testid="bpmn-import-button"
              icon={
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v8" />
                  <path d="M5 7l3 3 3-3" />
                  <path d="M2 13h12" />
                </svg>
              }
            />
            <MenuItem
              label={workbench.labels.exportBpmn}
              disabled={!hasSession}
              title={workbench.labels.exportBpmn}
              onClick={closeAfter(() => void exportBpmn())}
              data-testid="bpmn-export-button"
              icon={
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 9V1" />
                  <path d="M5 5l3-3 3 3" />
                  <path d="M2 13h12" />
                </svg>
              }
            />
          </div>
        ) : null}
      </MenuSection>

      <MenuSection title="Версии и история">
        <MenuItem
          label="Версии"
          disabled={!hasSession}
          onClick={closeAfter(openVersionsModal)}
          data-testid="bpmn-versions-open"
          icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 4v4l3 2" />
            </svg>
          }
        />
      </MenuSection>

      <MenuSection title="Контекст">
        <button
          type="button"
          className="diagramToolbarMenuSectionHeader"
          onClick={() => toggleSection("context")}
          aria-expanded={openSections.context}
          aria-controls="ellipsis-context-submenu"
          aria-disabled={contextDisabled ? "true" : "false"}
          tabIndex={-1}
        >
          <MenuIcon>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12l-1.5-3.5L3 7l3.5-1.5L8 2z" />
            </svg>
          </MenuIcon>
          <span className="diagramToolbarMenuLabel">Контекст</span>
          <MenuChevron open={openSections.context} />
        </button>
        {openSections.context ? (
          <div id="ellipsis-context-submenu" className="diagramToolbarMenuSubmenu">
            {selectedElementId ? (
              <>
                <MenuItem
                  label="Вставить между"
                  disabled={insertBetweenDisabled}
                  title={insertBetweenTitle}
                  onClick={closeAfter(openInsertBetweenModal)}
                  data-testid="diagram-insert-between-open"
                  icon={
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8h4" />
                      <path d="M9 8h4" />
                      <circle cx="8" cy="8" r="1.5" />
                    </svg>
                  }
                />
                <MenuItem
                  label="Открыть заметки"
                  onClick={closeAfter(() => onOpenElementNotes?.(selectedBpmnElement, "selected_element_notes_open"))}
                  data-testid="diagram-context-notes"
                  icon={
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 2.5c-3.5 0-6.5 2.5-6.5 5.5 0 1.5.7 2.9 1.8 3.9L3 13.5l2.2-1.1c.8.3 1.7.4 2.8.4 3.5 0 6.5-2.5 6.5-5.5S11.5 2.5 8 2.5z" />
                    </svg>
                  }
                />
                <MenuItem
                  label={aiQuestionsBusy ? "AI работает…" : "Сгенерировать вопросы"}
                  disabled={!canGenerateAiQuestions}
                  title={canGenerateAiQuestions ? "Сгенерировать AI-вопросы для выбранного элемента" : aiGenerateGate?.reasonText}
                  onClick={closeAfter(() => void generateAiQuestionsForSelectedElement())}
                  data-testid="diagram-ai-generate-questions"
                  icon={
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12l-1.5-3.5L3 7l3.5-1.5L8 2z" />
                    </svg>
                  }
                />
              </>
            ) : (
              <div className="diagramToolbarMenuEmpty">Выберите элемент/переход, чтобы открыть контекстные действия.</div>
            )}
          </div>
        ) : null}
        {aiQuestionsStatus?.text ? (
          <div
            className={`mt-2 rounded-md border px-2 py-1 text-[11px] ${
              aiQuestionsStatus.kind === "error"
                ? "border-danger/50 bg-danger/10 text-danger"
                : aiQuestionsStatus.kind === "warn"
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-success/40 bg-success/10 text-success"
            }`}
            data-testid="diagram-ai-questions-status"
          >
            {aiQuestionsStatus.text}
          </div>
        ) : null}
      </MenuSection>

      <MenuSection title="Шаблоны">
        <MenuItem
          label="Открыть шаблоны"
          disabled={!hasSession}
          onClick={closeAfter(() => void openTemplatesPicker?.())}
          data-testid="diagram-open-templates"
          icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 5l6-3 6 3" />
              <path d="M2 8l6 3 6-3" />
              <path d="M2 11l6 3 6-3" />
            </svg>
          }
        />
      </MenuSection>

      <MenuSection>
        <div className="diagramToolbarMenuRare">
          <MenuItem
            label={workbench.labels.reset}
            title={workbench.labels.reset}
            onClick={closeAfter(runToolbarReset)}
            icon={
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5a6 6 0 0110 4" />
                <path d="M13 11a6 6 0 01-10-4" />
                <path d="M3 1v4h4" />
                <path d="M13 15v-4h-4" />
              </svg>
            }
          />
          <MenuItem
            label={workbench.labels.clear}
            title={workbench.clearTooltip}
            onClick={closeAfter(runToolbarClear)}
            icon={
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4h12" />
                <path d="M4 4v9a2 2 0 002 2h4a2 2 0 002-2V4" />
                <path d="M6 2h4" />
              </svg>
            }
          />
        </div>
      </MenuSection>
    </div>
  );
}
