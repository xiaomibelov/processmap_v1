import { useCallback, useState } from "react";
import { apiCreateProject, apiListProjects } from "../../../lib/api";

function projectIdFrom(p) {
  return (p && (p.id || p.project_id || p.slug)) || "";
}

export default function useProjects({ initialProjectId = "", onOk, onFail } = {}) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(initialProjectId || "");

  const refreshProjects = useCallback(async () => {
    const r = await apiListProjects();
    if (!r.ok) {
      onFail?.(String(r.error || "Не удалось загрузить проекты."));
      setProjects([]);
      return { ok: false, projects: [] };
    }

    onOk?.();
    const list = Array.isArray(r.projects) ? r.projects : [];
    setProjects(list);
    return { ok: true, projects: list };
  }, [onOk, onFail]);

  const createProject = useCallback(
    async (payload) => {
      const r = await apiCreateProject(payload || {});
      if (!r.ok) {
        onFail?.(String(r.error || "Не удалось создать проект."));
        return { ok: false, project: null, projectId: "" };
      }

      onOk?.();

      const project = r.project || null;
      const pid = projectIdFrom(project);

      if (pid) setProjectId(pid);

      // Мягко обновим список без полного refetch (refetch делает контроллер при необходимости)
      if (project) {
        setProjects((prev) => {
          const next = Array.isArray(prev) ? prev.slice() : [];
          const exists = next.some((x) => projectIdFrom(x) === pid);
          if (!exists) next.unshift(project);
          return next;
        });
      }

      return { ok: true, project, projectId: pid };
    },
    [onOk, onFail]
  );

  return {
    projects,
    projectId,
    setProjectId,
    refreshProjects,
    createProject,
  };
}
