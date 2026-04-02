export default function SidebarPrimaryActions({
  onOpenDiagram,
  onOpenAi,
  onOpenNotes,
}) {
  return (
    <div className="sidebarPrimaryActions">
      <div className="sidebarSectionCaption">Действия</div>
      <div className="sidebarPrimaryActionsRow">
        <button type="button" className="primaryBtn h-10 flex-1 px-3 text-sm" onClick={() => onOpenDiagram?.()}>
          На диаграмму
        </button>
        <button type="button" className="secondaryBtn h-10 px-3 text-sm" onClick={() => onOpenAi?.()}>
          ИИ
        </button>
        <button type="button" className="secondaryBtn h-10 px-3 text-sm" onClick={() => onOpenNotes?.()}>
          Заметки
        </button>
      </div>
    </div>
  );
}
