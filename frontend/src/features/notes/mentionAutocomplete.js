function asText(value) {
  return String(value || "").trim();
}

function lower(value) {
  return asText(value).toLowerCase();
}

export function mentionUserId(user) {
  return asText(user?.user_id || user?.userId || user?.id);
}

export function mentionDisplayLabel(user) {
  return asText(user?.full_name || user?.fullName || user?.label || user?.email || mentionUserId(user));
}

export function mentionSecondaryLabel(user) {
  const label = mentionDisplayLabel(user);
  const email = asText(user?.email);
  return email && email !== label ? email : "";
}

export function normalizeMentionUser(user) {
  const userId = mentionUserId(user);
  if (!userId) return null;
  const label = mentionDisplayLabel(user);
  return {
    user_id: userId,
    label,
    email: asText(user?.email),
    full_name: asText(user?.full_name || user?.fullName),
    job_title: asText(user?.job_title || user?.jobTitle),
    insertedText: `@${label}`,
  };
}

export function detectMentionQuery(value, caretIndex = 0) {
  const body = String(value || "");
  const caret = Math.max(0, Math.min(Number(caretIndex || 0), body.length));
  const beforeCaret = body.slice(0, caret);
  const match = beforeCaret.match(/(^|[\s([{])@([^\s@.,;:!?()[\]{}]*)$/u);
  if (!match) return null;
  const query = String(match[2] || "");
  const startIndex = beforeCaret.length - query.length - 1;
  return { startIndex, query };
}

export function filterMentionSuggestions(users, query = "", selectedMentions = [], limit = 6) {
  const selectedIds = new Set(selectedMentions.map((item) => mentionUserId(item)).filter(Boolean));
  const q = lower(query);
  const out = [];
  for (const rawUser of Array.isArray(users) ? users : []) {
    const user = normalizeMentionUser(rawUser);
    if (!user || selectedIds.has(user.user_id)) continue;
    const searchable = lower([
      user.label,
      user.email,
      user.full_name,
      user.job_title,
      user.user_id,
    ].filter(Boolean).join(" "));
    if (q && !searchable.includes(q)) continue;
    out.push(user);
    if (out.length >= Number(limit || 6)) break;
  }
  return out;
}

export function insertMentionText(value, activeQuery, user, caretIndex = 0) {
  const normalized = normalizeMentionUser(user);
  if (!normalized || !activeQuery) return { text: String(value || ""), mention: null, caretIndex };
  const body = String(value || "");
  const start = Math.max(0, Number(activeQuery.startIndex || 0));
  const end = Math.max(start, Math.min(Number(caretIndex || 0), body.length));
  const before = body.slice(0, start);
  const after = body.slice(end);
  const needsSpace = after.length > 0 && !/^\s/u.test(after);
  const inserted = `${normalized.insertedText}${needsSpace ? " " : " "}`;
  const nextText = `${before}${inserted}${after}`;
  return {
    text: nextText,
    mention: normalized,
    caretIndex: before.length + inserted.length,
  };
}

export function pruneSelectedMentions(value, selectedMentions = []) {
  const body = String(value || "");
  const seen = new Set();
  const out = [];
  for (const rawMention of Array.isArray(selectedMentions) ? selectedMentions : []) {
    const mention = normalizeMentionUser(rawMention);
    if (!mention || seen.has(mention.user_id)) continue;
    if (!body.includes(mention.insertedText)) continue;
    seen.add(mention.user_id);
    out.push(mention);
  }
  return out;
}

export function mentionUserIdsForSubmit(value, selectedMentions = []) {
  return pruneSelectedMentions(value, selectedMentions).map((mention) => mention.user_id);
}
