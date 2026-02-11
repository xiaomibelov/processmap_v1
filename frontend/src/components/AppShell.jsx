import TopBar from "./TopBar";
import ProcessStage from "./ProcessStage";
import BottomDock from "./BottomDock";

export default function AppShell({
  sessionId,
  mode,
  left,
  locked,
  notes,
  onAddNote,
}) {
  return (
    <div className="shell">
      <TopBar sessionId={sessionId} onNewSession={() => {}} onOpenSession={() => {}} />

      <div className="workspace">
        {left}
        <ProcessStage mode={mode} />
      </div>

      <BottomDock locked={locked} notes={notes} onAddNote={onAddNote} />
    </div>
  );
}
