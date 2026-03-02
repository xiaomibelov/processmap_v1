export default function SidebarPrimaryActions({
  onOpenDiagram,
  onOpenAi,
  onOpenNotes,
}) {
  return (
    <div className="sidebarPrimaryActions">
      <div className="sidebarSectionCaption">Основные действия</div>
      <div className="sidebarPrimaryActionsRow">
        <button type="button" className="primaryBtn h-8 flex-1 px-3 text-[11px]" onClick={() => onOpenDiagram?.()}>
          На диаграмму
        </button>
        <button type="button" className="secondaryBtn h-8 px-3 text-[11px]" onClick={() => onOpenAi?.()}>
          AI
        </button>
        <button type="button" className="secondaryBtn h-8 px-3 text-[11px]" onClick={() => onOpenNotes?.()}>
          Notes
        </button>
      </div>
    </div>
  );
}
