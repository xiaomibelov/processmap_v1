import { useMemo } from "react";
import Modal from "../../../../shared/ui/Modal";
import BpmnVersionPreview from "./BpmnVersionPreview";
import { buildMergePanelView } from "./BpmnMergePanel.model.js";

function toText(value) {
  return String(value || "").trim();
}

export default function BpmnMergePanel({
  open = false,
  localXml = "",
  serverXml = "",
  localVersion = 0,
  serverVersion = 0,
  serverActorLabel = "",
  currentUserId = "",
  canEdit = false,
  source = "",
  busy = false,
  onAcceptLatest = null,
  onKeepMine = null,
  onCompare = null,
  onCancel = null,
}) {
  const view = useMemo(
    () => buildMergePanelView({
      open,
      localXml,
      serverXml,
      localVersion,
      serverVersion,
      serverActorLabel,
      currentUserId,
      canEdit,
      source,
      busy,
    }),
    [open, localXml, serverXml, localVersion, serverVersion, serverActorLabel, currentUserId, canEdit, source, busy],
  );

  if (!view.open) return null;

  return (
    <Modal
      open
      title={view.title}
      onClose={onCancel}
      cardClassName="max-w-[95vw] w-[1200px]"
      bodyClassName="space-y-3"
      footerClassName="flex flex-wrap gap-2"
      footer={(
        <>
          <button
            type="button"
            className="primaryBtn h-9 px-3 text-xs"
            onClick={onAcceptLatest}
            disabled={view.busy || !view.canAcceptLatest}
            data-testid="bpmn-merge-accept-latest"
            title="Загрузить серверную версию и перезаписать локальные изменения"
          >
            {view.busy ? "Загрузка…" : "Принять последнюю версию"}
          </button>
          <button
            type="button"
            className="secondaryBtn h-9 px-3 text-xs"
            onClick={onKeepMine}
            disabled={view.busy || !view.canKeepMine}
            data-testid="bpmn-merge-keep-mine"
            title="Сохранить текущую версию поверх серверной (создаёт новую запись в истории)"
          >
            {view.busy ? "Сохранение…" : "Оставить мою версию"}
          </button>
          <button
            type="button"
            className="secondaryBtn h-9 px-3 text-xs"
            onClick={onCompare}
            disabled={view.busy || !view.canCompare}
            data-testid="bpmn-merge-compare"
            title="Открыть детальное сравнение версий"
          >
            Сравнить детально
          </button>
          <button
            type="button"
            className="secondaryBtn h-9 px-3 text-xs"
            onClick={onCancel}
            disabled={view.busy}
            data-testid="bpmn-merge-cancel"
          >
            Отмена
          </button>
        </>
      )}
    >
      <div data-testid="bpmn-merge-panel" data-source={view.source}>
        {view.lead ? (
          <p className="text-sm text-fg" data-testid="bpmn-merge-panel-lead">
            {view.lead}
          </p>
        ) : null}
        <div className="grid h-[55vh] grid-cols-1 gap-3 md:grid-cols-2">
          <div
            className="flex min-h-0 flex-col overflow-hidden rounded-xl border-2 border-amber-400/60 bg-panel"
            data-testid="bpmn-merge-panel-local"
          >
            <div className="border-b border-border bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-700">
              {view.localLabel}
            </div>
            <div className="min-h-0 flex-1">
              <BpmnVersionPreview xml={view.localXml} label={view.localLabel} compact />
            </div>
          </div>
          <div
            className="flex min-h-0 flex-col overflow-hidden rounded-xl border-2 border-emerald-500/60 bg-panel"
            data-testid="bpmn-merge-panel-server"
          >
            <div className="border-b border-border bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700">
              {view.serverLabel}
            </div>
            <div className="min-h-0 flex-1">
              <BpmnVersionPreview xml={view.serverXml} label={view.serverLabel} compact />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
