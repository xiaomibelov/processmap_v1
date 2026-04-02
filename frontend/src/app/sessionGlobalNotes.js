export function normalizeGlobalNoteItem(raw, fallbackIndex = 0) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const text = String(obj.text || obj.note || obj.notes || obj.message || raw || "").trim();
  if (!text) return null;
  const rawTs = obj.ts ?? obj.createdAt ?? obj.created_at ?? obj.updatedAt ?? obj.updated_at;
  let ts = Number(rawTs);
  if (!Number.isFinite(ts) || ts <= 0) {
    const parsedDate = Date.parse(String(rawTs || "").trim());
    ts = Number.isFinite(parsedDate) && parsedDate > 0 ? parsedDate : Date.now();
  }
  const author = String(obj.author || obj.user || obj.created_by || obj.by || "you").trim() || "you";
  const id = String(obj.id || obj.note_id || obj.noteId || "").trim() || `note_${ts}_${fallbackIndex + 1}`;
  return { id, text, ts, author };
}

export function normalizeGlobalNotes(value) {
  let source = [];
  if (Array.isArray(value)) {
    source = value;
  } else if (value && typeof value === "object") {
    source = [value];
  } else {
    const text = String(value || "").trim();
    if (!text) source = [];
    else {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) source = parsed;
        else if (parsed && typeof parsed === "object") source = [parsed];
        else source = [{ text }];
      } catch {
        source = [{ text }];
      }
    }
  }
  const normalized = source
    .map((item, idx) => normalizeGlobalNoteItem(item, idx))
    .filter(Boolean);
  normalized.sort((a, b) => {
    const dt = Number(a?.ts || 0) - Number(b?.ts || 0);
    if (dt !== 0) return dt;
    return String(a?.id || "").localeCompare(String(b?.id || ""), "ru");
  });
  return normalized;
}

export function mergeGlobalNotesLists(baseRaw, incomingRaw) {
  const out = [];
  const byId = new Set();
  const bySignature = new Set();
  function add(rawItem, idx) {
    const item = normalizeGlobalNoteItem(rawItem, idx);
    if (!item) return;
    const id = String(item.id || "").trim();
    const signature = `${String(item.text || "").trim().toLowerCase()}|${Number(item.ts || 0)}|${String(item.author || "").trim().toLowerCase()}`;
    if (id && byId.has(id)) return;
    if (signature && bySignature.has(signature)) return;
    if (id) byId.add(id);
    if (signature) bySignature.add(signature);
    out.push(item);
  }
  normalizeGlobalNotes(baseRaw).forEach((item, idx) => add(item, idx));
  normalizeGlobalNotes(incomingRaw).forEach((item, idx) => add(item, idx));
  out.sort((a, b) => {
    const dt = Number(a?.ts || 0) - Number(b?.ts || 0);
    if (dt !== 0) return dt;
    return String(a?.id || "").localeCompare(String(b?.id || ""), "ru");
  });
  return out;
}
