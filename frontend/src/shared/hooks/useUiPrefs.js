import { useCallback, useEffect, useMemo, useState } from "react";
import { readJson, writeJson } from "../../lib/storage";

export default function useUiPrefs({ key, defaults } = {}) {
  const k = String(key || "").trim();
  if (!k) throw new Error("useUiPrefs: missing key");

  const def = defaults && typeof defaults === "object" ? defaults : { project_id: "", mode_filter: "" };

  const initial = useMemo(() => readJson(k, def), [k]);

  const [projectIdPref, setProjectIdPref] = useState(
    typeof initial.project_id === "string" ? initial.project_id : ""
  );

  const [modeFilter, setModeFilter] = useState(
    typeof initial.mode_filter === "string" && initial.mode_filter
      ? initial.mode_filter
      : "quick_skeleton"
  );

  useEffect(() => {
    writeJson(k, {
      project_id: String(projectIdPref || ""),
      mode_filter: String(modeFilter || ""),
    });
  }, [k, projectIdPref, modeFilter]);

  const syncProjectId = useCallback(
    (pid) => {
      const next = String(pid || "");
      if (next !== String(projectIdPref || "")) setProjectIdPref(next);
    },
    [projectIdPref]
  );

  return {
    projectIdPref,
    setProjectIdPref,
    syncProjectId,

    modeFilter,
    setModeFilter,
  };
}
