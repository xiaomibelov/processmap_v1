const META = {
  selected: { tone: "selected", title: "Узел", accent: "172 72% 46%" },
  ai: { tone: "ai", title: "AI-вопросы", accent: "262 86% 66%" },
  notes: { tone: "notes", title: "Заметки", accent: "198 88% 60%" },
  actors: { tone: "actors", title: "Акторы", accent: "146 62% 46%" },
  templates: { tone: "templates", title: "Шаблоны", accent: "35 86% 58%" },
  // A9: иконки реальных секций сайдбара (ид = ключ аккордеона)
  tobe: { tone: "tobe", title: "TO BE", accent: "262 86% 66%" },
  properties: { tone: "properties", title: "Свойства", accent: "172 72% 46%" },
  paths: { tone: "paths", title: "Пути", accent: "35 86% 58%" },
  time: { tone: "time", title: "Время шага", accent: "198 88% 60%" },
  robotmeta: { tone: "robotmeta", title: "Robot Meta", accent: "220 20% 56%" },
  advanced: { tone: "templates", title: "Шаблоны", accent: "35 86% 58%" },
};

export function getSidebarSectionMeta(sectionId) {
  return META[String(sectionId || "").trim()] || { tone: "default", title: "Секция", accent: "220 20% 56%" };
}

export function SidebarSectionGlyph({ sectionId, className = "" }) {
  const id = String(sectionId || "").trim();
  if (id === "selected") {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "ai") {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        <path d="M8 1.6l1.4 3.1 3.2.3-2.4 2 0.7 3.2L8 8.7 5.1 10.2 5.8 7 3.4 5l3.2-.3L8 1.6z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === "notes") {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        <rect x="3" y="2.5" width="10" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5.2 5.5h5.6M5.2 8h5.6M5.2 10.5h3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "actors") {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        <circle cx="5.2" cy="5.4" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="10.8" cy="5.4" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M2.8 12.7c.2-1.7 1.4-2.8 2.9-2.8s2.7 1.1 2.9 2.8M8.3 12.7c.2-1.7 1.4-2.8 2.9-2.8s2.7 1.1 2.9 2.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "templates") {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        <rect x="2.5" y="3" width="11" height="9.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5 1.8v2.4M8 1.8v2.4M11 1.8v2.4M5.2 7.2h5.6M5.2 9.8h3.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "tobe") {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        <path d="M2.5 8a5.5 5.5 0 0 1 9.5-3.8M13.5 8a5.5 5.5 0 0 1-9.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M12.9 1.9v2.4h-2.4M3.1 14.1v-2.4h2.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === "properties") {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        <path d="M6.6 2.2h2.8l.4 1.9 1.8.8 1.7-1 2 2-1 1.7.8 1.8 1.9.4v2.8l-1.9.4-.8 1.8 1 1.7-2 2-1.7-1-1.8.8-.4 1.9H6.6l-.4-1.9-1.8-.8-1.7 1-2-2 1-1.7-.8-1.8-1.9-.4V9.2l1.9-.4.8-1.8-1-1.7 2-2 1.7 1 1.8-.8.4-1.9z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" transform="scale(0.94) translate(0.5 0.5)" />
        <circle cx="8" cy="8" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  if (id === "paths") {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        <circle cx="3.2" cy="8" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="12.8" cy="3.6" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="12.8" cy="12.4" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M4.9 8h3.4c1.6 0 2.2-.8 2.6-2M4.9 8h3.4c1.6 0 2.2.8 2.6 2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "time") {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        <circle cx="8" cy="8.6" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 5.4v3.2l2.2 1.4M6.4 1.6h3.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "robotmeta") {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        <rect x="3" y="5" width="10" height="7.5" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 5V2.6M6 2.2h4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="6" cy="8.6" r="0.9" fill="currentColor" />
        <circle cx="10" cy="8.6" r="0.9" fill="currentColor" />
        <path d="M5.2 12.5v1.4M10.8 12.5v1.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "advanced") {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        <rect x="2.5" y="3" width="11" height="9.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5 1.8v2.4M8 1.8v2.4M11 1.8v2.4M5.2 7.2h5.6M5.2 9.8h3.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
