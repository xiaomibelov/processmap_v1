const KEY = "fpc_node_meta_v1";

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return "{}";
  }
}

function readAll() {
  const raw = localStorage.getItem(KEY);
  const obj = safeParse(raw || "");
  return obj && typeof obj === "object" ? obj : {};
}

function writeAll(obj) {
  localStorage.setItem(KEY, safeStringify(obj || {}));
}

function qid() {
  return `q_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getNodeMeta(nodeId) {
  if (!nodeId) return { role_id: "", questions: [] };
  const all = readAll();
  const m = all[nodeId];
  if (!m || typeof m !== "object") return { role_id: "", questions: [] };
  return {
    role_id: typeof m.role_id === "string" ? m.role_id : "",
    questions: Array.isArray(m.questions) ? m.questions : [],
  };
}

export function setNodeRole(nodeId, roleId) {
  if (!nodeId) return;
  const all = readAll();
  const cur = all[nodeId] && typeof all[nodeId] === "object" ? all[nodeId] : {};
  all[nodeId] = { ...cur, role_id: roleId || "" };
  writeAll(all);
}

export function addNodeQuestion(nodeId, text) {
  if (!nodeId) return;
  const t = (text || "").trim();
  if (!t) return;

  const all = readAll();
  const cur = all[nodeId] && typeof all[nodeId] === "object" ? all[nodeId] : {};
  const questions = Array.isArray(cur.questions) ? cur.questions : [];
  questions.push({ question_id: qid(), ts: new Date().toISOString(), text: t });
  all[nodeId] = { ...cur, questions };
  writeAll(all);
}

export function removeNodeQuestion(nodeId, questionId) {
  if (!nodeId || !questionId) return;
  const all = readAll();
  const cur = all[nodeId] && typeof all[nodeId] === "object" ? all[nodeId] : {};
  const questions = Array.isArray(cur.questions) ? cur.questions : [];
  all[nodeId] = { ...cur, questions: questions.filter((q) => q.question_id !== questionId) };
  writeAll(all);
}
