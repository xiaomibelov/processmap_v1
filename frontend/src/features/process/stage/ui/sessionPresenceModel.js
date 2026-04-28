function toText(value) {
  return String(value || "").trim();
}

function normalizePresenceKey(userId = "", label = "") {
  const uid = toText(userId).toLowerCase();
  if (uid) return `uid:${uid}`;
  const fallback = toText(label).toLowerCase();
  if (!fallback) return "";
  return `label:${fallback}`;
}

function toPositiveEpochMs(value, fallback = 0) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return Math.max(0, Number(fallback || 0));
  return Math.round(raw);
}

function normalizeActor(raw = null, fallbackNowMs = 0) {
  const value = raw && typeof raw === "object" ? raw : {};
  const userId = toText(value.userId || value.user_id || value.actorUserId || value.actor_user_id);
  const label = toText(value.label || value.userLabel || value.actorLabel || value.actor_label || userId);
  const key = normalizePresenceKey(userId, label);
  if (!key) return null;
  return {
    key,
    userId,
    label: label || "Пользователь",
    lastSeenAt: toPositiveEpochMs(value.lastSeenAt || value.last_seen_at, fallbackNowMs),
  };
}

export function pruneSessionPresenceActors(actorsRaw = [], {
  nowMs = Date.now(),
  ttlMs = 120000,
  maxActors = 12,
} = {}) {
  const now = toPositiveEpochMs(nowMs, Date.now());
  const ttl = Math.max(10000, Number(ttlMs || 120000));
  const cutoff = now - ttl;
  const items = Array.isArray(actorsRaw) ? actorsRaw : [];
  const next = [];
  const seen = new Set();
  items.forEach((item) => {
    const actor = normalizeActor(item, now);
    if (!actor) return;
    if (actor.lastSeenAt < cutoff) return;
    if (seen.has(actor.key)) return;
    seen.add(actor.key);
    next.push(actor);
  });
  next.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  if (next.length > maxActors) {
    return next.slice(0, maxActors);
  }
  return next;
}

export function buildSessionPresenceView({
  actorsRaw = [],
  currentUserIdRaw = "",
  nowMs = Date.now(),
  ttlMs = 120000,
} = {}) {
  const actors = pruneSessionPresenceActors(actorsRaw, { nowMs, ttlMs });
  const currentUserId = toText(currentUserIdRaw).toLowerCase();
  const others = actors.filter((actor) => {
    const uid = toText(actor.userId).toLowerCase();
    if (!currentUserId) return true;
    return !uid || uid !== currentUserId;
  });
  if (!others.length) {
    return {
      visible: false,
      count: 0,
      label: "",
      title: "",
      users: [],
    };
  }
  const names = others.map((actor) => toText(actor.label)).filter(Boolean);
  let label = "";
  if (names.length <= 2) {
    label = `В сессии: ${names.join(", ")}`;
  } else {
    label = `В сессии: ${names[0]} +${names.length - 1}`;
  }
  return {
    visible: true,
    count: names.length,
    label,
    title: `Активны сейчас: ${names.join(", ")}`,
    users: others,
  };
}
