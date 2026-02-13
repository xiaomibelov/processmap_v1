import NotesPanel from "../../components/NotesPanel";
import NoSession from "../../components/stages/NoSession";
import ActorsSetup from "../../components/stages/ActorsSetup";

export default function SidePanelContainer({ ctl }) {
  const phase = ctl?.phase || "no_session";

  if (phase === "no_session") {
    return (
      <NoSession
        backendHint={ctl.backendHint}
        onCreateBackend={() => ctl.createBackendSession?.(ctl.modeFilter)}
        onCreateLocal={() => ctl.createLocalSession?.()}
      />
    );
  }

  if (phase === "actors_setup") {
    return <ActorsSetup draft={ctl.draft} onSaveActors={(payload) => ctl.saveActors?.(payload)} />;
  }

  return <NotesPanel draft={ctl.draft} onAddNote={(t) => ctl.addNote?.(t)} disabled={!!ctl.locked} />;
}
