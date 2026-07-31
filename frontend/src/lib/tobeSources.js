// UXF/B4: классификация сессий-источников TO BE в сайдбаре.
// Основной список — сессии проекта с человеческими именами;
// служебные/безымянные/подпроцессы — в «Прочие».
const SUBPROCESS_RE = /(подпроцесс|subprocess|Activity_[a-z0-9]+)/i;
// «клавиатурный мусор» вида fsefw: только латиница без пробелов, 4+ символов,
// и либо 3+ согласных подряд, либо ≤1 гласной (случайный набор, не слово)
const LATIN_ONLY_RE = /^[a-z]{4,}$/i;
const CONS_RUN_RE = /[bcdfghjklmnpqrstvwxz]{3,}/i;
function isGibberishTitle(title) {
  if (!LATIN_ONLY_RE.test(title)) return false;
  if (CONS_RUN_RE.test(title)) return true;
  const vowels = (title.match(/[aeiouy]/gi) || []).length;
  return vowels <= 1;
}

export function isServiceSession(session) {
  const title = String(session?.title || "").trim();
  if (!title) return true;
  if (SUBPROCESS_RE.test(title)) return true;
  if (isGibberishTitle(title)) return true;
  return false;
}

export function classifySourceSessions(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const main = [];
  const other = [];
  list.forEach((s) => (isServiceSession(s) ? other : main).push(s));
  return { main, other };
}

// Статус источника: есть ли уже TO BE, производная от этой AS IS-сессии.
export function buildDerivedSet(tobeSessions) {
  const set = new Set();
  (Array.isArray(tobeSessions) ? tobeSessions : []).forEach((x) => {
    const id = String(x?.derived_from_session_id || "").trim();
    if (id) set.add(id);
  });
  return set;
}
