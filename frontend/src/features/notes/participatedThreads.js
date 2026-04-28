function text(value) {
  return String(value || "").trim();
}

function identity(value) {
  return text(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function matchesCurrentUser(value, currentUserId) {
  const current = identity(currentUserId);
  return !!current && identity(value) === current;
}

function mentionTargetsCurrentUser(mention, currentUserId) {
  if (!mention || typeof mention !== "object") return false;
  return matchesCurrentUser(
    mention.mentioned_user_id
      || mention.mentionedUserId
      || mention.user_id
      || mention.userId,
    currentUserId,
  );
}

export function isThreadParticipatedByCurrentUser(thread, currentUserId) {
  const current = identity(currentUserId);
  if (!current || !thread || typeof thread !== "object") return false;

  if (matchesCurrentUser(thread.created_by || thread.createdBy || thread.created_by_user_id, current)) {
    return true;
  }

  for (const mention of asArray(thread.mentions)) {
    if (mentionTargetsCurrentUser(mention, current)) return true;
  }

  for (const rawId of asArray(thread.mention_user_ids || thread.mentionUserIds)) {
    if (matchesCurrentUser(rawId, current)) return true;
  }

  for (const comment of asArray(thread.comments)) {
    if (matchesCurrentUser(comment?.author_user_id || comment?.authorUserId || comment?.created_by, current)) {
      return true;
    }
    for (const mention of asArray(comment?.mentions)) {
      if (mentionTargetsCurrentUser(mention, current)) return true;
    }
    for (const rawId of asArray(comment?.mention_user_ids || comment?.mentionUserIds)) {
      if (matchesCurrentUser(rawId, current)) return true;
    }
  }

  return false;
}

export function countParticipatedThreads(threads, currentUserId) {
  return asArray(threads).filter((thread) => isThreadParticipatedByCurrentUser(thread, currentUserId)).length;
}
