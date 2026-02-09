let sessionId = null;
function el(id) { return document.getElementById(id); }
async function api(path, method = "GET", body = null) {
  const opt = { method, headers: { "Content-Type": "application/json" } };
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch(path, opt);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
function badge(type) { return `<span class="badge">${type}</span>`; }
function renderMermaid(code) {
  const m = el("mermaid");
  m.textContent = code || "flowchart TD\n  A[Нет данных] --> B[Начни вводить заметки]\n";
  mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
  mermaid.run({ querySelector: ".mermaid" });
}
function renderQuestions(qs) {
  const wrap = el("questions");
  wrap.innerHTML = "";
  qs.filter(q => q.status === "open").slice(0, 40).forEach(q => {
    const div = document.createElement("div");
    div.className = "q";
    const opts = (q.options && q.options.length)
      ? `<select data-qid="${q.id}">
           <option value="">—</option>
           ${q.options.map(o => `<option value="${o}">${o}</option>`).join("")}
         </select>`
      : "";
    div.innerHTML = `
      <div class="qTop">
        <div>${badge(q.issue_type)} <span style="opacity:.85">узел ${q.node_id}</span></div>
        <div style="opacity:.7;font-size:12px;">${q.id}</div>
      </div>
      <div class="qText">${q.question}</div>
      <div class="qActions">
        ${opts}
        <input data-qid="${q.id}" placeholder="ответ..." />
        <button data-act="answer" data-qid="${q.id}">Ответить</button>
      </div>
    `;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll('button[data-act="answer"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const qid = btn.getAttribute("data-qid");
      const inp = wrap.querySelector(`input[data-qid="${qid}"]`);
      const sel = wrap.querySelector(`select[data-qid="${qid}"]`);
      const val = (sel && sel.value) ? sel.value : (inp ? inp.value : "");
      if (!val) return;
      await api(`/api/sessions/${sessionId}/answer`, "POST", { question_id: qid, answer: val });
      await refresh();
    });
  });
}
async function refresh() {
  const s = await api(`/api/sessions/${sessionId}`);
  el("sessionMeta").textContent = `session: ${s.id} • ${s.title} • v${s.version}`;
  renderMermaid(s.mermaid);
  renderQuestions(s.questions || []);
}
async function newSession() {
  const title = prompt("Название процесса (например: Бульон Фо Бо / Борщ):", "Бульон Фо Бо");
  if (!title) return;
  const s = await api("/api/sessions", "POST", { title });
  sessionId = s.id;
  await refresh();
}
async function sendNotes() {
  const notes = el("notes").value || "";
  if (!notes.trim()) return;
  await api(`/api/sessions/${sessionId}/notes`, "POST", { notes });
  await refresh();
}
async function exportSession() {
  await api(`/api/sessions/${sessionId}/export`, "POST", {});
  alert("Экспортировано в workspace/processes (смотри git diff)");
}
el("btnNew").addEventListener("click", newSession);
el("btnSend").addEventListener("click", sendNotes);
el("btnExport").addEventListener("click", exportSession);
(async () => { await newSession(); })();
