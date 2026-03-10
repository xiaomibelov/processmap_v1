import { useCallback, useState } from "react";

export default function useProcessStageDialogState() {
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [versionsList, setVersionsList] = useState([]);
  const [previewSnapshotId, setPreviewSnapshotId] = useState("");
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffBaseSnapshotId, setDiffBaseSnapshotId] = useState("");
  const [diffTargetSnapshotId, setDiffTargetSnapshotId] = useState("");
  const [qualityAutoFixOpen, setQualityAutoFixOpen] = useState(false);
  const [qualityAutoFixBusy, setQualityAutoFixBusy] = useState(false);
  const [insertBetweenOpen, setInsertBetweenOpen] = useState(false);
  const [insertBetweenBusy, setInsertBetweenBusy] = useState(false);
  const [insertBetweenName, setInsertBetweenName] = useState("");
  const [insertBetweenDraft, setInsertBetweenDraft] = useState(null);

  const resetDialogsForSession = useCallback(() => {
    setVersionsOpen(false);
    setVersionsBusy(false);
    setVersionsList([]);
    setPreviewSnapshotId("");
    setDiffOpen(false);
    setDiffBaseSnapshotId("");
    setDiffTargetSnapshotId("");
    setQualityAutoFixOpen(false);
    setQualityAutoFixBusy(false);
    setInsertBetweenOpen(false);
    setInsertBetweenBusy(false);
    setInsertBetweenName("");
    setInsertBetweenDraft(null);
  }, []);

  return {
    versionsOpen,
    setVersionsOpen,
    versionsBusy,
    setVersionsBusy,
    versionsList,
    setVersionsList,
    previewSnapshotId,
    setPreviewSnapshotId,
    diffOpen,
    setDiffOpen,
    diffBaseSnapshotId,
    setDiffBaseSnapshotId,
    diffTargetSnapshotId,
    setDiffTargetSnapshotId,
    qualityAutoFixOpen,
    setQualityAutoFixOpen,
    qualityAutoFixBusy,
    setQualityAutoFixBusy,
    insertBetweenOpen,
    setInsertBetweenOpen,
    insertBetweenBusy,
    setInsertBetweenBusy,
    insertBetweenName,
    setInsertBetweenName,
    insertBetweenDraft,
    setInsertBetweenDraft,
    resetDialogsForSession,
  };
}
