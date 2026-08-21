function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function toTs(value, fallback = 0) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return Number(fallback || 0);
  return Math.round(n);
}

function toBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return Boolean(fallback);
}

function uid(userIdRaw) {
  return toText(userIdRaw);
}

export function normalizeAttentionMarkers(raw) {
  return asArray(raw)
    .map((entryRaw) => {
      const entry = asObject(entryRaw);
      const id = toText(entry.id);
      const message = toText(entry.message || entry.text);
      if (!id || !message) return null;
      const seenBy = asObject(entry.last_seen_at_by_user || entry.last_seen_by_user || entry.last_seen_by);
      const normalizedSeenBy = {};
      Object.keys(seenBy).forEach((keyRaw) => {
        const key = toText(keyRaw);
        if (!key) return;
        const value = toTs(seenBy[key], 0);
        if (value > 0) normalizedSeenBy[key] = value;
      });
      return {
        id,
        created_at: toTs(entry.created_at, Math.floor(Date.now() / 1000)),
        created_by: toText(entry.created_by),
        message,
        node_id: toText(entry.node_id || entry.nodeId),
        is_checked: toBool(entry.is_checked, false),
        last_seen_at_by_user: normalizedSeenBy,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
}

export function createAttentionMarker({
  message = "",
  nodeId = "",
  createdBy = "",
  createdAt = 0,
} = {}) {
  const now = toTs(createdAt, Math.floor(Date.now() / 1000));
  const stamp = Math.max(1, now);
  const rand = Math.random().toString(36).slice(2, 8);
  return {
    id: `att_${stamp}_${rand}`,
    created_at: stamp,
    created_by: toText(createdBy),
    message: toText(message),
    node_id: toText(nodeId),
    is_checked: false,
    last_seen_at_by_user: {},
  };
}

export function isAttentionMarkerUnread(markerRaw, userIdRaw = "", sessionLastOpenedAtRaw = 0) {
  const marker = asObject(markerRaw);
  const userId = uid(userIdRaw);
  const seenBy = asObject(marker.last_seen_at_by_user || marker.last_seen_by_user || marker.last_seen_by);
  const seenAt = userId ? toTs(seenBy[userId], 0) : 0;
  const createdAt = toTs(marker.created_at, 0);
  const openedAt = toTs(sessionLastOpenedAtRaw, 0);
  if (toBool(marker.is_checked, false)) return false;
  if (seenAt > 0 && seenAt >= createdAt) return false;
  if (openedAt > 0 && createdAt <= openedAt && seenAt > 0) return false;
  return true;
}

export function markAttentionMarkersSeen(markersRaw, userIdRaw, markerIdsRaw = null, seenAtRaw = 0) {
  const userId = uid(userIdRaw);
  if (!userId) return normalizeAttentionMarkers(markersRaw);
  const targetIds = markerIdsRaw
    ? new Set(asArray(markerIdsRaw).map((id) => toText(id)).filter(Boolean))
    : null;
  const seenAt = toTs(seenAtRaw, Math.floor(Date.now() / 1000));
  const normalized = normalizeAttentionMarkers(markersRaw);
  return normalized.map((marker) => {
    if (toBool(marker.is_checked, false)) return marker;
    if (targetIds && !targetIds.has(marker.id)) return marker;
    const nextSeenBy = {
      ...asObject(marker.last_seen_at_by_user),
      [userId]: seenAt,
    };
    return { ...marker, last_seen_at_by_user: nextSeenBy };
  });
}

export function countAttentionMarkers(markersRaw, { showOnWorkspace = true } = {}) {
  if (!showOnWorkspace) return 0;
  return normalizeAttentionMarkers(markersRaw).filter((marker) => !toBool(marker.is_checked, false)).length;
}

export function countUnreadAttentionMarkers(markersRaw, userIdRaw = "", sessionLastOpenedAtRaw = 0) {
  return normalizeAttentionMarkers(markersRaw).filter((marker) => (
    isAttentionMarkerUnread(marker, userIdRaw, sessionLastOpenedAtRaw)
  )).length;
}
