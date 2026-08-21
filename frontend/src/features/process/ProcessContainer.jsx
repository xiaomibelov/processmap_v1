import ProcessStage from "../../components/ProcessStage";

export default function ProcessContainer({ ctl }) {
  const sessionId = ctl?.draft?.session_id || "";

  return (
    <ProcessStage
      sessionId={sessionId}
      locked={!!ctl.locked}
      draft={ctl.draft}
      onPatchDraft={(next) => ctl.patchDraft?.(next)}
      reloadKey={ctl.reloadKey}
    />
  );
}
