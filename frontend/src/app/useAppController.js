import { useEffect, useState } from "react";
import useProjects from "../features/projects/hooks/useProjects";
import useSessions from "../features/sessions/hooks/useSessions";
import useDraft from "../features/draft/hooks/useDraft";
import useApiStatus from "../shared/hooks/useApiStatus";
import useUiPrefs from "../shared/hooks/useUiPrefs";

const UI_KEY = "fp_copilot_ui_v1";

function sessionIdFrom(obj) {
  return (
    (obj && typeof obj.session_id === "string" && obj.session_id) ||
    (obj && typeof obj.id === "string" && obj.id) ||
    ""
  );
}

function projectIdFrom(obj) {
  return (obj && (obj.id || obj.project_id || obj.slug)) || "";
}

export default function useAppController() {
  const ui = useUiPrefs({
    key: UI_KEY,
    defaults: { project_id: "", mode_filter: "" },
  });

  const [wizardOpen, setWizardOpen] = useState(false);

  const apiStatus = useApiStatus();

  const projectsCtl = useProjects({
    initialProjectId: ui.projectIdPref,
    onOk: apiStatus.markOk,
    onFail: apiStatus.markFail,
  });

  const sessionsCtl = useSessions({
    projectId: projectsCtl.projectId,
    onOk: apiStatus.markOk,
    onFail: apiStatus.markFail,
  });

  const draftCtl = useDraft({
    onOk: apiStatus.markOk,
    onFail: apiStatus.markFail,
  });

  // keep persisted project_id in sync with actual selected projectId
  useEffect(() => {
    ui.syncProjectId(projectsCtl.projectId || "");
  }, [projectsCtl.projectId]);

  async function refreshAll() {
    const pr = await projectsCtl.refreshProjects();

    let pid = projectsCtl.projectId;
    if (!pid && pr.ok && Array.isArray(pr.projects) && pr.projects.length > 0) {
      const first = pr.projects[0];
      const inferred = projectIdFrom(first);
      if (typeof inferred === "string" && inferred) {
        pid = inferred;
        projectsCtl.setProjectId(inferred);
      }
    }

    await sessionsCtl.refreshSessions(pid);
  }

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    sessionsCtl.refreshSessions(projectsCtl.projectId);
  }, [projectsCtl.projectId]);

  async function openSession(sessionId) {
    const sid = String(sessionId || "").trim();
    if (!sid) return;

    const r = await sessionsCtl.openSession(sid);
    if (!r.ok || !r.session) return;

    draftCtl.setDraftFromSession(r.session);
  }

  async function createBackendSession(modeArg, pidOverride) {
    const m =
      String(modeArg || ui.modeFilter || draftCtl.draft?.mode || "quick_skeleton").trim() ||
      "quick_skeleton";

    const pid = typeof pidOverride === "string" ? pidOverride : projectsCtl.projectId;

    const r = await sessionsCtl.createBackendSession({
      projectId: pid,
      mode: m,
      payload: { title: "Interview session" },
    });

    if (!r.ok || !r.session) return;

    const sid = sessionIdFrom(r.session);
    if (sid) await openSession(sid);

    await sessionsCtl.refreshSessions(pid);
  }

  async function createProjectFromWizard(payload) {
    const title = String(payload?.title || "").trim() || "Новый проект";
    const passport = payload?.passport || {};
    const mode = String(payload?.mode || "").trim() || "quick_skeleton";

    const r = await projectsCtl.createProject({ title, passport });
    if (!r.ok) return;

    setWizardOpen(false);

    await refreshAll();

    const pid = r.projectId || projectsCtl.projectId;
    await createBackendSession(mode, pid);
  }

  return {
    draft: draftCtl.draft,
    phase: draftCtl.phase,
    locked: draftCtl.locked,

    projects: projectsCtl.projects,
    sessions: sessionsCtl.sessions,

    projectId: projectsCtl.projectId,
    setProjectId: projectsCtl.setProjectId,

    modeFilter: ui.modeFilter,
    setModeFilter: ui.setModeFilter,

    backendStatus: apiStatus.backendStatus,
    backendHint: apiStatus.backendHint,

    wizardOpen,
    setWizardOpen,

    reloadKey: draftCtl.reloadKey,

    refreshAll,

    createLocalSession: draftCtl.createLocalSession,
    createBackendSession,
    openSession,

    patchDraft: draftCtl.patchDraft,
    saveActors: draftCtl.saveActors,
    addNote: draftCtl.addNote,

    createProjectFromWizard,
  };
}
