import { useMemo } from "react";
import AppShell from "./components/AppShell";
import { readJson } from "./lib/storage";

const LS_KEY = "fp_copilot_draft_v0";

export default function App() {
  const draft = useMemo(() => readJson(LS_KEY, null), []);
  const sessionId = draft?.session_id || "";
  const hasActors =
    Array.isArray(draft?.roles) &&
    draft.roles.length > 0 &&
    typeof draft?.start_role === "string" &&
    draft.start_role.length > 0;

  return <AppShell sessionId={sessionId} locked={!hasActors} />;
}
