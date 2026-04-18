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

export function upsertSessionPresenceActor(actorsRaw = [], actorRaw = null, {
  nowMs = Date.now(),
  ttlMs = 120000,
  minTouchMs = 15000,
  maxActors = 12,
} = {}) {
  const now = toPositiveEpochMs(nowMs, Date.now());
  const actor = normalizeActor(actorRaw, now);
  const current = pruneSessionPresenceActors(actorsRaw, { nowMs: now, ttlMs, maxActors });
  if (!actor) return current;
  const existingIndex = current.findIndex((item) => item.key === actor.key);
  if (existingIndex >= 0) {
    const existing = current[existingIndex];
    const nextSeenAt = Math.max(existing.lastSeenAt, actor.lastSeenAt || now);
    const shouldTouch = (
      nextSeenAt - existing.lastSeenAt >= Math.max(0, Number(minTouchMs || 0))
      || toText(existing.label) !== toText(actor.label)
    );
    if (!shouldTouch) return current;
    const updated = [...current];
    updated[existingIndex] = {
      ...existing,
      label: toText(actor.label) || existing.label,
      lastSeenAt: nextSeenAt,
    };
    updated.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    return updated;
  }
  const next = [
    ...current,
    {
      key: actor.key,
      userId: actor.userId,
      label: actor.label,
      lastSeenAt: actor.lastSeenAt || now,
    },
  ];
  next.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  return next.slice(0, maxActors);
}

function pluralizeUsersRu(count = 0) {
  const n = Math.abs(Number(count || 0));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "пользователь";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "пользователя";
  return "пользователей";
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
    label = `В сессии ещё ${names.length} ${pluralizeUsersRu(names.length)}`;
  }
  return {
    visible: true,
    count: names.length,
    label,
    title: `Активны сейчас: ${names.join(", ")}`,
    users: others,
  };
}

