export function projectIdOf(p) {
  return String((p && (p.id || p.project_id || p.slug)) || "").trim();
}

export function sessionIdOf(s) {
  return String((s && (s.id || s.session_id)) || "").trim();
}

export function projectTitleOf(p) {
  return String((p && (p.title || p.name || p.id || p.project_id || p.slug)) || "").trim();
}
