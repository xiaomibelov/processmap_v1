import { useEffect, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
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

function defaultPassport(title) {
  return {
    site_type: "dark_kitchen",
    language: "ru",
    units: { mass: "g", temp: "C", time: "min" },
    standards: { haccp: true, allergens: true, traceability: true },
    process_name: String(title || "").trim() || "Process",
    product_family: "General",
    kpi: { speed: true, quality: true, loss: false, safety: true },
    owner: { name: "", phone: "", email: "" },
  };
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
  const [selectedId, setSelectedId] = useState("local");
  const [draft, setDraft] = useState(() => ensureDraftShape({}));
  const [bpmnReloadKey, setBpmnReloadKey] = useState(0);

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

  async function refreshProjects() {
    if (!apiOk || !projectsEnabled) return;
    const r = await apiListProjects();
    if (!r.ok) return;

    const items = r.items || [];
    setProjects(items);

    // set default project if missing
    if (!projectId) {
      if (items[0]?.id) setProjectId(items[0].id);
      return;
    }

    const exists = items.some((p) => p?.id === projectId);
    if (!exists) {
      setProjectId(items[0]?.id || "");
    }
  }

  async function refreshSessions() {
    if (!apiOk) return;

    // project sessions mode
    if (projectSessionsEnabled && projectId) {
      const r = await apiListProjectSessions(projectId, modeFilter || null);
      if (!r.ok) return;
      const items = r.items || [];
      setSessions(items);
      // keep selected if still exists
      if (selectedId && selectedId !== "local") {
        const ok = items.some((s) => (s?.id || s?.session_id) === selectedId);
        if (!ok) setSelectedId(items[0]?.id || items[0]?.session_id || "local");
      }
      return;
    }

    // legacy sessions list
    const r = await apiListSessions();
    if (!r.ok) return;
    const items = r.items || [];
    setSessions(items);
    if (selectedId && selectedId !== "local") {
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
    // Load from backend when session changes
    if (!apiOk) return;
    if (!selectedId || selectedId === "local") {
      setDraft((prev) => ensureDraftShape(prev));
      return;
    }

    (async () => {
      const r = await apiGetSession(selectedId);
      if (r.ok && r.session) {
        setDraft(ensureDraftShape(r.session));
      }
    })();
  }, [selectedId, apiOk]);

  const currentTitle = useMemo(() => {
    if (selectedId === "local") return "Local draft";
    const s = sessions.find((x) => (x?.id || x?.session_id) === selectedId);
    return s?.title || selectedId;
  }, [selectedId, sessions]);

  async function onNewProject() {
    if (!apiOk || !projectsEnabled) return;

    const title = window.prompt("Название проекта", "Новый проект") || "";
    const t = title.trim();
    if (!t) return;

    const r = await apiCreateProject({ title: t, passport: defaultPassport(t) });
    if (!r.ok || !r.project) return;

    const pid = r.project.id;
    if (!pid) return;

    // update local state immediately
    setProjects((prev) => [r.project, ...(prev || [])]);
    setProjectId(pid);

    // auto-create first session
    if (projectSessionsEnabled) {
      const mode = modeFilter || "quick_skeleton";
      const title2 = suggestSessionTitle([], mode);
      const r2 = await apiCreateProjectSession(pid, mode, {
        title: title2,
        roles: ["cook_1", "technolog"],
      });
      if (r2.ok && r2.session?.id) {
        setSelectedId(r2.session.id);
        setDraft(ensureDraftShape(r2.session));
      }
      await refreshSessions();
    } else {
      await refreshSessions();
    }
  }

  async function onNewLocal() {
    setSelectedId("local");
    setDraft(ensureDraftShape({}));
    setBpmnReloadKey((x) => x + 1);
  }

  async function onNewApiSession(modeOverride) {
    if (!apiOk) return;

    const mode = (modeOverride ?? modeFilter ?? "").trim() || "quick_skeleton";

    // prefer project sessions if available + project selected
    if (projectSessionsEnabled && projectId) {
      const title = suggestSessionTitle(sessions, mode);
      const r = await apiCreateProjectSession(projectId, mode, {
        title,
        roles: ["cook_1", "technolog"],
      });
      if (r.ok && r.session?.id) {
        setSelectedId(r.session.id);
        setDraft(ensureDraftShape(r.session));
        setBpmnReloadKey((x) => x + 1);
        await refreshSessions();
      }
      return;
    }

    // fallback: legacy create session (no project)
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
    if (!sessionId || sessionId === "local") return;
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

  // small gate: if backend has projects but none selected, keep UX simple
  const needsProject = apiOk && projectsEnabled && !projectId;

  if (needsProject) {
    return (
      <div className="app" style={{ padding: 16 }}>
        <div className="panel" style={{ maxWidth: 720, margin: "0 auto" }}>
          <div className="panelHeader">
            <div className="panelTitle">Проект</div>
            <div className="panelSub">Создай первый проект, чтобы начать интервью и генерацию процесса.</div>
          </div>
          <div className="panelBody">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn" onClick={onNewProject}>
                Создать проект
              </button>
              <span style={{ opacity: 0.7 }}>{backendStatus === "ok" ? "backend ok" : backendHint}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
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
      setBpmnReloadKey={setBpmnReloadKey}
      patchDraftToBackend={patchDraftToBackend}
    />
  );
}
