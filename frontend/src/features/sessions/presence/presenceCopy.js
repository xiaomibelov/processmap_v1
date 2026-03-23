export function normalizeOtherActiveUsersCount(rawCount) {
  const next = Number(rawCount || 0);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.floor(next));
}

function russianPluralForm(count) {
  const value = Math.abs(Number(count || 0));
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return "one";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
  return "many";
}

export function buildSessionPresenceCopy(otherUsersCount) {
  const count = normalizeOtherActiveUsersCount(otherUsersCount);
  if (count <= 0) return "";
  const form = russianPluralForm(count);
  if (form === "one") return `в сессии ещё ${count} пользователь`;
  if (form === "few") return `в сессии ещё ${count} пользователя`;
  return `в сессии ещё ${count} пользователей`;
}

