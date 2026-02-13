import { useEffect, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import ProjectWizardModal from "./components/ProjectWizardModal";
import {
  apiCreateProject,
  apiCreateProjectSession,
  apiCreateSession,
  apiGetSession,
  apiListProjectSessions,
  apiListProjects,
  apiListSessions,
  apiMeta,
  apiPatchSession,
} from "./lib/api";
import { ensureDraftShape } from "./lib/draft";
import "./styles/app.css";

const LS_PROJECT_ID = "fpc.project_id";
const LS_MODE_FILTER = "fpc.mode_filter";
const LS_SELECTED_ID = "fpc.selected_id";
const LS_LOCAL_DRAFT = "fpc.local_draft_v1";

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

function safeJsonParse(s) {
  try {
    return JSON.parse(String(s || ""));
  } catch {
    return null;
  }
}

function suggestSessionTitle(sessions, mode) {
  const m = String(mode || "").trim();
  const base = m ? (m === "deep_audit" ? "Audit" : "Interview") : "Interview";
  const n = (Array.isArray(sessions) ? sessions.length : 0) + 1;
  return `${base} #${n}`;
}

export default function App() {
  const [backendStatus, setBackendStatus] = useState("checking");
  const [backendHint, setBackendHint] = useState("");
  const [apiOk, setApiOk] = useState(false);
  const [features, setFeatures] = useState({});

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(() => localStorage.getItem(LS_PROJECT_ID) || "");
  const [modeFilter, setModeFilter] = useState(
    () => localStorage.getItem(LS_MODE_FILTER) || "quick_skeleton"
  );

  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(LS_SELECTED_ID) || "local");

  const [draft, setDraft] = useState(() => {
    const sid = localStorage.getItem(LS_SELECTED_ID) || "local";
    if (isLocalSessionId(sid)) {
      const raw = localStorage.getItem(LS_LOCAL_DRAFT);
      const j = safeJsonParse(raw);
      return ensureDraftShape(j || {});
    }
    return ensureDraftShape({});
  });

  const [bpmnReloadKey, setBpmnReloadKey] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [wizardOpen, setWizardOpen] = useState(false);

  const projectsEnabled = !!features?.projects;
  const projectSessionsEnabled = !!features?.project_sessions;

  useEffect(() => {
    (async () => {
      const r = await apiMeta();
      if (!r.ok) {
        setApiOk(false);
        setBackendStatus("offline");
        setBackendHint(r.error || "backend not reachable");
        return;
      }
      setApiOk(true);
      setBackendStatus("ok");
      setBackendHint("");
      setFeatures(r.meta?.features || {});
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_PROJECT_ID, projectId || "");
  }, [projectId]);

  useEffect(() => {
    localStorage.setItem(LS_MODE_FILTER, modeFilter || "");
  }, [modeFilter]);

  useEffect(() => {
    localStorage.setItem(LS_SELECTED_ID, selectedId || "local");
  }, [selectedId]);

  useEffect(() => {
    if (isLocalSessionId(selectedId)) {
      try {
        localStorage.setItem(LS_LOCAL_DRAFT, JSON.stringify(draft || {}));
      } catch {
        // ignore
      }
    }
  }, [draft, selectedId]);

  async function refreshProjects() {
    if (!apiOk || !projectsEnabled) return;
    const r = await apiListProjects();
    if (!r.ok) return;

    const items = r.items || [];
    setProjects(items);

    if (!projectId) {
      if (items[0]?.id) setProjectId(items[0].id);
      return;
    }

    const exists = items.some((p) => p?.id === projectId);
    if (!exists) setProjectId(items[0]?.id || "");
  }

  async function refreshSessions() {
    if (!apiOk) return;

    if (projectSessionsEnabled && projectId) {
      const r = await apiListProjectSessions(projectId, modeFilter || null);
      if (!r.ok) return;

      const items = r.items || [];
      setSessions(items);

      if (selectedId && !isLocalSessionId(selectedId)) {
        const ok = items.some((s) => (s?.id || s?.session_id) === selectedId);
        if (!ok) setSelectedId(items[0]?.id || items[0]?.session_id || "local");
      }
      return;
    }

    const r = await apiListSessions();
    if (!r.ok) return;

    const items = r.items || [];
    setSessions(items);

    if (selectedId && !isLocalSessionId(selectedId)) {
      const ok = items.some((s) => (s?.id || s?.session_id) === selectedId);
      if (!ok) setSelectedId(items[0]?.id || items[0]?.session_id || "local");
    }
  }

  useEffect(() => {
    refreshProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiOk, projectsEnabled]);

  useEffect(() => {
    refreshSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiOk, projectId, modeFilter, projectSessionsEnabled]);

  useEffect(() => {
    if (!apiOk) return;

    if (!selectedId || isLocalSessionId(selectedId)) {
      const raw = localStorage.getItem(LS_LOCAL_DRAFT);
      const j = safeJsonParse(raw);
      setDraft(ensureDraftShape(j || {}));
      return;
    }

    (async () => {
      const r = await apiGetSession(selectedId);
      if (r.ok && r.session) setDraft(ensureDraftShape(r.session));
    })();
  }, [selectedId, apiOk]);

  const currentTitle = useMemo(() => {
    if (isLocalSessionId(selectedId)) return "Local draft";
    const s = sessions.find((x) => (x?.id || x?.session_id) === selectedId);
    return s?.title || selectedId;
  }, [selectedId, sessions]);

  async function createProjectAndFirstSession({ title, passport, mode }) {
    if (!apiOk || !projectsEnabled) return;

    const r = await apiCreateProject({ title, passport });
    if (!r.ok || !r.project?.id) {
      setErrorText(String(r.error || "create project failed"));
      return;
    }

    const pid = r.project.id;

    setProjects((prev) => [r.project, ...(prev || [])]);
    setProjectId(pid);

    const chosenMode = String(mode || "").trim() || "quick_skeleton";
    setModeFilter(chosenMode);

    if (projectSessionsEnabled) {
      const title2 = suggestSessionTitle([], chosenMode);
      const r2 = await apiCreateProjectSession(pid, chosenMode, {
        title: title2,
        roles: ["cook_1", "technolog"],
      });

      if (r2.ok && r2.session?.id) {
        setSelectedId(r2.session.id);
        setDraft(ensureDraftShape(r2.session));
        setBpmnReloadKey((x) => x + 1);
      } else {
        setErrorText(String(r2.error || "create session failed"));
      }

      await refreshSessions();
      return;
    }

    await refreshSessions();
  }

  function onNewProject() {
    setWizardOpen(true);
  }

  async function onNewLocal() {
    setSelectedId("local");
    setDraft(ensureDraftShape({}));
    setBpmnReloadKey((x) => x + 1);
  }

  async function onNewApiSession(modeOverride) {
    if (!apiOk) return;

    const mode = (modeOverride ?? modeFilter ?? "").trim() || "quick_skeleton";

    if (projectSessionsEnabled && projectId) {
      const title = suggestSessionTitle(sessions, mode);
      const r = await apiCreateProjectSession(projectId, mode, { title, roles: ["cook_1", "technolog"] });
      if (r.ok && r.session?.id) {
        setSelectedId(r.session.id);
        setDraft(ensureDraftShape(r.session));
        setBpmnReloadKey((x) => x + 1);
        await refreshSessions();
      }
      return;
    }

    const title = suggestSessionTitle(sessions, "");
    const r = await apiCreateSession({ title });
    if (r.ok && r.session?.id) {
      setSelectedId(r.session.id);
      setDraft(ensureDraftShape(r.session));
      setBpmnReloadKey((x) => x + 1);
      await refreshSessions();
    }
  }

  async function onOpen(id) {
    const sid = String(id || "");
    if (!sid) return;
    setSelectedId(sid);
    setBpmnReloadKey((x) => x + 1);
  }

  async function patchDraftToBackend(sessionId, newDraft) {
    if (!sessionId || isLocalSessionId(sessionId)) return;

    const payload = {
      title: newDraft.title,
      roles: newDraft.roles,
      start_role: newDraft.start_role,
      notes: newDraft.notes,
      nodes: newDraft.nodes,
      edges: newDraft.edges,
      questions: newDraft.questions,
    };

    await apiPatchSession(sessionId, payload);
  }

  async function onGenerate() {
    if (!selectedId || isLocalSessionId(selectedId)) return;

    setGenerating(true);
    setErrorText("");

    try {
      await patchDraftToBackend(selectedId, draft);
      setBpmnReloadKey((x) => x + 1);
    } catch (e) {
      setErrorText(String(e?.message || e));
    } finally {
      setGenerating(false);
    }
  }

  function onAddNote(text) {
    const t = String(text || "").trim();
    if (!t) return;

    const note = { note_id: `note_${Date.now()}`, text: t, ts: new Date().toISOString() };

    const next = ensureDraftShape({
      ...(draft || {}),
      notes: [...(Array.isArray(draft?.notes) ? draft.notes : []), note],
    });

    setDraft(next);

    if (!isLocalSessionId(selectedId)) {
      patchDraftToBackend(selectedId, next).catch((e) => setErrorText(String(e?.message || e)));
    }
  }

  const needsProject = apiOk && projectsEnabled && !projectId;

  return (
    <>
      <ProjectWizardModal
        open={wizardOpen || needsProject}
        onClose={() => setWizardOpen(false)}
        onCreate={async (payload) => {
          setErrorText("");
          await createProjectAndFirstSession(payload);
          setWizardOpen(false);
        }}
      />

      {!needsProject ? (
        <AppShell
          backendStatus={backendStatus}
          backendHint={backendHint}
          projects={projects}
          projectId={projectId}
          onProjectChange={setProjectId}
          modeFilter={modeFilter}
          onModeFilterChange={setModeFilter}
          sessions={sessions}
          selectedId={selectedId}
          onOpen={onOpen}
          onRefreshSessions={async () => {
            await refreshProjects();
            await refreshSessions();
          }}
          onNewProject={onNewProject}
          onNewLocal={onNewLocal}
          onNewApiSession={onNewApiSession}
          draft={draft}
          setDraft={setDraft}
          bpmnReloadKey={bpmnReloadKey}
          patchDraftToBackend={patchDraftToBackend}
          onGenerate={onGenerate}
          generating={generating}
          onAddNote={onAddNote}
          errorText={errorText}
          currentTitle={currentTitle}
        />
      ) : (
        <div className="app" style={{ padding: 16 }}>
          <div className="panel" style={{ maxWidth: 720, margin: "0 auto" }}>
            <div className="panelHeader">
              <div className="panelTitle">Проект</div>
              <div className="panelSub">Создай первый проект, чтобы начать интервью и генерацию процесса.</div>
            </div>
            <div className="panelBody">
              <div style={{ opacity: 0.75 }}>
                {backendStatus === "ok" ? "backend ok" : backendHint}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
