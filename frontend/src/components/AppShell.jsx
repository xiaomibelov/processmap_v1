import TopBar from "./TopBar";
import NotesPanel from "./NotesPanel";
import ProcessStage from "./ProcessStage";
import BottomDock from "./BottomDock";

export default function AppShell({ sessionId, locked }) {
  return (
    <div className="shell">
      <TopBar sessionId={sessionId} onNewSession={() => {}} onOpenSession={() => {}} />

      <div className="workspace">
        <NotesPanel locked={locked} />
        <ProcessStage />
      </div>

      <BottomDock locked={locked} />
    </div>
  );
}
