import { useEffect, useMemo, useState } from "react";

import AppShell from "./components/AppShell";
import NotesPanel from "./components/NotesPanel";
import NoSession from "./components/stages/NoSession";
import ActorsSetup from "./components/stages/ActorsSetup";
import ProjectWizardModal from "./components/ProjectWizardModal";

import { uid } from "./lib/ids";
import {
  apiMeta,
  apiListProjects,
  apiCreateProject,
  apiListProjectSessions,
  apiCreateProjectSession,
  apiListSessions,
  apiCreateSession,
  apiGetSession,
  apiPatchSession,
  apiPostNote,
  apiDeleteProject,
  apiDeleteSession,
} from "./lib/api";

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

function ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

function ensureDraftShape(sessionId) {
  return {
    session_id: sessionId || null,
    title: "",
    roles: [],
    start_role: "",
    nodes: [],
    edges: [],
    notes: [],
    questions: [],
  };
}

function hasActors(draft) {
  const roles = ensureArray(draft?.roles).map((x) => String(x || "").trim()).filter(Boolean);
  const start = String(draft?.start_role || "").trim();
  return roles.length > 0 && !!start;
}

export default function App() {
  const [backendStatus, setBackendStatus] = useState("idle"); // idle|ok|fail
  const [backendHint, setBackendHint] = useState("");

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [modeFilter, setModeFilter] = useState("quick_skeleton");

  const [sessions, setSessions] = useState([]);
  const [draft, setDraft] = useState(ensureDraftShape(null));

  const [wizardOpen, setWizardOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [leftHidden, setLeftHidden] = useState(false);

  function markOk(hint) {
    setBackendStatus("ok");
    setBackendHint(String(hint || ""));
  }

  function markFail(err) {
    setBackendStatus("fail");
    setBackendHint(String(err || "API error"));
  }

  async function refreshMeta() {
    const r = await apiMeta();
    if (r.ok) {
      markOk("API OK");
      return true;
    }
    markFail(r.error);
    return false;
  }

  async function refreshProjects() {
    const ok = await refreshMeta();
    if (!ok) return;
    const r = await apiListProjects();
    if (!r.ok) return markFail(r.error);
    setProjects(ensureArray(r.items));
    if (!projectId && ensureArray(r.items).length) {
      setProjectId(String(r.items[0].id || ""));
    }
  }

  async function refreshSessions(pid) {
    const p = String(pid || "");
    if (!p) {
      setSessions([]);
      return;
    }
    const r = await apiListProjectSessions(p, modeFilter);
    if (!r.ok) {
      markFail(r.error);
      setSessions([]);
      return;
    }
    markOk("API OK");
    setSessions(ensureArray(r.items));
  }

  async function openSession(sessionId) {
    const sid = String(sessionId || "");
    if (!sid) return;

    if (isLocalSessionId(sid)) {
      setDraft(ensureDraftShape(sid));
      return;
    }

    const r = await apiGetSession(sid);
    if (!r.ok) return markFail(r.error);

    const next = r.session || ensureDraftShape(sid);
    setDraft({
      ...ensureDraftShape(sid),
      ...next,
      session_id: sid,
      roles: ensureArray(next.roles),
      nodes: ensureArray(next.nodes),
      edges: ensureArray(next.edges),
      notes: ensureArray(next.notes),
      questions: ensureArray(next.questions),
    });
    markOk("API OK");
  }

  function createLocalSession() {
    const sid = `local_${uid()}`;
    setDraft(ensureDraftShape(sid));
  }

  async function createBackendSession(mode) {
    const pid = String(projectId || "");
    if (!pid) return;

    const create = await apiCreateProjectSession(pid, mode);
    if (!create.ok) return markFail(create.error);

    const sid = String(create.session?.id || "");
    if (!sid) return markFail("create session: empty id");

    await refreshSessions(pid);
    await openSession(sid);
  }

  async function createProjectFromWizard({ name }) {
    const title = String(name || "").trim() || `Проект ${new Date().toLocaleString()}`;
    const r = await apiCreateProject(title);
    if (!r.ok) return markFail(r.error);

    const pid = String(r.project?.id || "");
    if (!pid) return markFail("create project: empty id");

    await refreshProjects();
    setProjectId(pid);
    await refreshSessions(pid);
    markOk("API OK");
  }

  async function patchDraft(partial) {
    const sid = String(draft?.session_id || "");
    if (!sid || isLocalSessionId(sid)) {
      setDraft((d) => ({ ...d, ...partial }));
      return;
    }

    const r = await apiPatchSession(sid, partial);
    if (!r.ok) return markFail(r.error);

    setDraft((d) => ({ ...d, ...partial }));
    markOk("API OK");
  }

  async function saveActors({ roles, start_role }) {
    const cleanRoles = ensureArray(roles).map((x) => String(x || "").trim()).filter(Boolean);
    const start = String(start_role || "").trim();

    await patchDraft({ roles: cleanRoles, start_role: start });
  }

  async function addNote(text) {
    const sid = String(draft?.session_id || "");
    const t = String(text || "").trim();
    if (!sid || !t) return;

    if (isLocalSessionId(sid)) {
      setDraft((d) => ({ ...d, notes: [...ensureArray(d.notes), { id: uid(), text: t, ts: Date.now() }] }));
      return;
    }

    const r = await apiPostNote(sid, t);
    if (!r.ok) return markFail(r.error);

    setDraft((d) => ({ ...d, notes: ensureArray(r.notes || d.notes) }));
    markOk("API OK");
  }

  async function deleteCurrentProject() {
    const pid = String(projectId || "");
    if (!pid) return;
    const ok = confirm("Удалить проект и все сессии?");
    if (!ok) return;

    const r = await apiDeleteProject(pid);
    if (!r.ok) return markFail(r.error);

    setProjectId("");
    setSessions([]);
    setDraft(ensureDraftShape(null));
    await refreshProjects();
    markOk("API OK");
  }

  async function deleteCurrentSession() {
    const sid = String(draft?.session_id || "");
    if (!sid || isLocalSessionId(sid)) {
      setDraft(ensureDraftShape(null));
      return;
    }
    const ok = confirm("Удалить сессию?");
    if (!ok) return;

    const r = await apiDeleteSession(sid);
    if (!r.ok) return markFail(r.error);

    setDraft(ensureDraftShape(null));
    await refreshSessions(projectId);
    markOk("API OK");
  }

  const locked = useMemo(() => !hasActors(draft), [draft]);

  const phase = useMemo(() => {
    const sid = String(draft?.session_id || "");
    if (!sid) return "no_session";
    if (locked) return "actors_setup";
    return "notes";
  }, [draft, locked]);

  const left = useMemo(() => {
    if (phase === "no_session") {
      return (
        <NoSession
          mode={modeFilter}
          backendStatus={backendStatus}
          backendHint={backendHint}
          onNewBackendSession={() => createBackendSession(modeFilter)}
          onNewLocalSession={createLocalSession}
        />
      );
    }

    if (phase === "actors_setup") {
      return <ActorsSetup draft={draft} onSaveActors={saveActors} />;
    }

    return <NotesPanel draft={draft} onAddNote={addNote} disabled={locked} />;
  }, [phase, backendStatus, backendHint, draft, modeFilter, locked]);

  useEffect(() => {
    refreshProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!projectId) return;
    refreshSessions(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, modeFilter]);

  return (
    <>
      <AppShell
        draft={draft}
        locked={locked}
        left={left}
        leftHidden={leftHidden}
        onToggleLeft={() => setLeftHidden((x) => !x)}
        onPatchDraft={patchDraft}
        reloadKey={reloadKey}
        backendStatus={backendStatus}
        backendHint={backendHint}
        projects={projects}
        projectId={projectId}
        onProjectChange={async (pid) => {
          const next = String(pid || "");
          setProjectId(next);
          await refreshSessions(next);
        }}
        onDeleteProject={deleteCurrentProject}
        modeFilter={modeFilter}
        onModeFilterChange={async (m) => {
          const next = String(m || "");
          setModeFilter(next);
          await refreshSessions(projectId);
        }}
        sessions={sessions}
        sessionId={String(draft?.session_id || "")}
        onOpenSession={openSession}
        onDeleteSession={deleteCurrentSession}
        onRefresh={async () => {
          await refreshProjects();
          await refreshSessions(projectId);
        }}
        onNewProject={() => setWizardOpen(true)}
        onNewLocalSession={createLocalSession}
        onNewBackendSession={() => createBackendSession(modeFilter)}
      />

      <ProjectWizardModal open={wizardOpen} onClose={() => setWizardOpen(false)} onCreate={createProjectFromWizard} />
    </>
  );
}
