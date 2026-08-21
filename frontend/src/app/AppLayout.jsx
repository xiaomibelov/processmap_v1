import TopBarContainer from "../features/topbar/TopBarContainer";
import SidePanelContainer from "../features/sidepanel/SidePanelContainer";
import ProcessContainer from "../features/process/ProcessContainer";
import BottomDock from "../components/BottomDock";

export default function AppLayout({ ctl }) {
  return (
    <div className="shell">
      <TopBarContainer ctl={ctl} />

      <div className="workspace">
        <SidePanelContainer ctl={ctl} />
        <ProcessContainer ctl={ctl} />
      </div>

      <BottomDock />
    </div>
  );
}
