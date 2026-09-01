// Formatting helpers for the projects table (explorer v2).
// Pure functions only — unit-tested via node --test (explorerTableFormat.test.mjs).

export const AVATAR_PALETTE = [
  "#2563eb",
  "#d97706",
  "#16a34a",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#be185d",
];

const PROJECT_FORMS = ["проект", "проекта", "проектов"];
const SESSION_FORMS = ["сессия", "сессии", "сессий"];
const SECTION_FORMS = ["раздел", "раздела", "разделов"];

export function pluralizeRu(count, forms) {
  const [one, few, many] = forms;
  const n = Number(count);
  if (!Number.isFinite(n) || n < 0) return many;
  const abs = Math.floor(Math.abs(n));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = abs % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function compositionProjectsText(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return `${n} ${pluralizeRu(n, PROJECT_FORMS)}`;
}

export function workspaceSectionCounterText(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return `${n} ${pluralizeRu(n, SECTION_FORMS)}`;
}

export function compositionSessionsText(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return `${n} ${pluralizeRu(n, SESSION_FORMS)}`;
}

export function sessionsCounterText(done, total) {
  const d = Math.max(0, Math.floor(Number(done) || 0));
  const t = Math.max(0, Math.floor(Number(total) || 0));
  return `${d}/${t}`;
}

export function sessionsProgressPercent(done, total) {
  const d = Math.max(0, Number(done) || 0);
  const t = Math.max(0, Number(total) || 0);
  if (t <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((d / t) * 100)));
}

export function sessionsTooltipText(done, total) {
  const d = Math.max(0, Math.floor(Number(done) || 0));
  const t = Math.max(0, Math.floor(Number(total) || 0));
  const pct = t > 0 ? Math.round((d / t) * 100) : 0;
  return `Заполнено ${d} из ${t} узлов процесса (${pct}%)`;
}

export function formatRelativeTime(epoch) {
  if (!epoch) return "";
  const d = new Date(epoch * 1000);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "только что";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} д назад`;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

export function formatAbsoluteDateTime(epoch) {
  if (!epoch) return "";
  const d = new Date(epoch * 1000);
  const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

export function avatarColorFromName(name) {
  const text = String(name || "");
  let h = 0;
  for (const c of text) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function initialsFromName(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] || "")
    .join("")
    .toUpperCase() || "?";
}

export function firstName(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  return words[0] || "";
}
