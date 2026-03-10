export default function BottomActionBar({
  onOpenDiagram,
  onOpenAi,
  onOpenNotes,
}) {
  return (
    <div className="sidebarBottomBar">
      <button type="button" className="primaryBtn smallBtn flex-1" onClick={() => onOpenDiagram?.()}>
        На диаграмму
      </button>
      <button type="button" className="secondaryBtn smallBtn" onClick={() => onOpenAi?.()}>
        AI
      </button>
      <button type="button" className="secondaryBtn smallBtn" onClick={() => onOpenNotes?.()}>
        Заметка
      </button>
    </div>
  );
}
