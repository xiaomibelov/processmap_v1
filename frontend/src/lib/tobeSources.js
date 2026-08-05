// UXF/B4: классификация сессий-источников TO BE в сайдбаре.
// Основной список — сессии проекта с человеческими именами;
// служебные/безымянные — в «Прочие».
// T1: сабпроцессы определяются по ФОРМАЛЬНОМУ признаку (is_subprocess /
// parent_session_id из summary-контракта) и исключаются из пикера полностью.
// Regex по имени — только fallback для старых данных без флага (логируется).
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

// T1: антиспам для fallback-логирования (по id сессии, один раз за сессию).
const regexFallbackLogged = new Set();

function hasFormalSubprocessFlag(session) {
  // Контракт есть, если присутствует хотя бы одно из полей: summary отдаёт
  // оба, полный dump модели — только parent_session_id. Старые закэшированные
  // данные без обоих полей → regex-fallback ниже.
  return session != null && typeof session === "object"
    && ("is_subprocess" in session || "parent_session_id" in session);
}

function logRegexFallback(session, title) {
  const sid = String(session?.id || session?.session_id || title || "?");
  if (regexFallbackLogged.has(sid)) return;
  regexFallbackLogged.add(sid);
  // eslint-disable-next-line no-console
  console.warn(
    `[tobeSources] T1 regex-fallback: сессия «${title}» (${sid}) помечена сабпроцессом по ИМЕНИ — ` +
    "в данных нет формального признака is_subprocess. Удалить fallback можно после полной миграции summary-контракта.",
  );
}

// T1: формальный признак сабпроцесса. Сабпроцесс (в т.ч. orphan с удалённым
// родителем — осознанное решение, см. docs/spec/T1_TOBE_SOURCE_PICKER_DATA_AUDIT.md)
// никогда не является источником TO BE.
export function isSubprocessSession(session) {
  if (hasFormalSubprocessFlag(session)) {
    return session.is_subprocess === true
      || String(session?.parent_session_id || "").trim() !== "";
  }
  const title = String(session?.title || "").trim();
  if (SUBPROCESS_RE.test(title)) {
    logRegexFallback(session, title);
    return true;
  }
  return false;
}

export function isServiceSession(session) {
  if (isSubprocessSession(session)) return true;
  const title = String(session?.title || "").trim();
  if (!title) return true;
  if (isGibberishTitle(title)) return true;
  return false;
}

// T1: кандидаты в источники TO BE — сабпроцессы исключены ПОЛНОСТЬЮ
// (не показываются ни в основном списке, ни в «Прочие»).
export function pickTobeSourceCandidates(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  return list.filter((s) => !isSubprocessSession(s));
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
