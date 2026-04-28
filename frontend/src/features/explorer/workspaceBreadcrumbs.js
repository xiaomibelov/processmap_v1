function text(value) {
  return String(value || "").trim();
}

export function normalizeProjectBreadcrumbBase(crumbsRaw) {
  const crumbs = Array.isArray(crumbsRaw) ? crumbsRaw : [];
  return crumbs
    .map((crumb) => {
      const type = text(crumb?.type).toLowerCase();
      const id = text(crumb?.id);
      const name = text(crumb?.name);
      if (!name) return null;
      if (type !== "workspace" && type !== "folder") return null;
      if (!id) return null;
      return { type, id, name };
    })
    .filter(Boolean);
}

export function buildProjectBreadcrumbTrail(crumbsRaw, projectNameRaw) {
  const base = normalizeProjectBreadcrumbBase(crumbsRaw);
  const projectName = text(projectNameRaw);
  if (!projectName) return base;
  return [
    ...base,
    { type: "project", id: "", name: projectName, active: true },
  ];
}

export function resolveProjectBreadcrumbTarget(crumbRaw) {
  const crumb = crumbRaw && typeof crumbRaw === "object" ? crumbRaw : {};
  const type = text(crumb.type).toLowerCase();
  if (type === "workspace") return { folderId: "" };
  if (type === "folder") {
    const id = text(crumb.id);
    if (!id) return null;
    return { folderId: id };
  }
  return null;
}
