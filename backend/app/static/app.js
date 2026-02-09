let sessionId = null;
let sessionCache = null;

function el(id) { return document.getElementById(id); }

async function api(path, method = "GET", body = null) {
  const opt = { method, headers: { "Content-Type": "application/json" } };
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch(path, opt);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || r.statusText);
  }
  return r.json();
}

function badge(type) {
  return `<span class="badge">${type}</span>`;
}

function selectedNodeIdFromHash() {
  const h = (window.location.hash || "").trim();
  const m = h.match(/node=([a-zA-Z0-9_]+)/);
  return m ? m[1] : null;
}

function setSelectedNodeId(nodeId) {
  window.location.hash = `node=${nodeId}`;
}

function renderMermaid(code) {
  const m = el("mermaid");
  m.textContent = code || "flowchart TD\n  A[Нет данных] --> B[Начни вводить заметки]\n";
  mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
  mermaid.run({ querySelector: ".mermaid" });
}

function renderNormalized(s) {
  const wrap = el("normalized");
  const n = (s && s.normalized) ? s.normalized : null;
  if (!n) {
    wrap.innerHTML = `<div class="small">Нет данных</div>`;
    return;
  }

  const eq = (n.equipment || []).slice(0, 30);
  const res = (n.resources || []).slice(0, 30);
  const unk = (n.unknown_terms || []).slice(0, 30);
  const units = (n.units || []).slice(0, 20);

  wrap.innerHTML = `
    <div class="small"><b>Оборудование</b>: ${eq.length}</div>
    <div class="small">${eq.map(x => `${x.title} <span style="opacity:.7">(${x.canon})</span>`).join(", ") || "—"}</div>

    <div class="small" style="margin-top:10px;"><b>Ресурсы</b>: ${res.length}</div>
    <div class="small">${res.map(x => `${x.title} <span style="opacity:.7">(${x.canon})</span>`).join(", ") || "—"}</div>

    <div class="small" style="margin-top:10px;"><b>Единицы</b>: ${units.length}</div>
    <div class="small">${units.map(u => `${u.raw} → ${u.unit_canon}`).join(", ") || "—"}</div>

    <div class="small" style="margin-top:10px;"><b>Unknown</b>: ${unk.length}</div>
    <div class="small">${unk.map(x => `${x.term} <span style="opacity:.7">x${x.count}</span>`).join(", ") || "—"}</div>

    <div class="small" style="margin-top:10px;opacity:.7;">Seed-словарь: backend/app/knowledge/glossary_seed.yml</div>
  `;
}

function renderQuestions(qs) {
  const wrap = el("questions");
  wrap.innerHTML = "";
  qs.filter(q => q.status === "open").slice(0, 50).forEach(q => {
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
        <div>${badge(q.issue_type)} <a class="link" href="#node=${q.node_id}">узел ${q.node_id}</a></div>
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

function safeJsonParse(s) {
  const t = (s || "").trim();
  if (!t) return {};
  return JSON.parse(t);
}

function renderInspector(s) {
  const wrap = el("inspector");
  if (!s || !s.nodes) {
    wrap.innerHTML = `<div class="small">Нет данных</div>`;
    return;
  }
  const nodeId = selectedNodeIdFromHash() || (s.nodes[0] ? s.nodes[0].id : null);
  if (!nodeId) {
    wrap.innerHTML = `<div class="small">Нет узлов</div>`;
    return;
  }

  const n = s.nodes.find(x => x.id === nodeId);
  if (!n) {
    wrap.innerHTML = `<div class="small">Узел не найден</div>`;
    return;
  }

  const roles = (s.roles || []).slice();
  if (!roles.includes("")) roles.unshift("");

  const typeOptions = ["step","decision","fork","join","loss_event","timer","message"];

  const params = JSON.stringify(n.parameters || {}, null, 2);
  const disp = JSON.stringify(n.disposition || {}, null, 2);

  wrap.innerHTML = `
    <div class="small">ID: <b>${n.id}</b></div>

    <div class="insRow">
      <label>title</label>
      <input id="ins_title" class="grow" value="${(n.title || "").replace(/"/g, "&quot;")}" />
    </div>

    <div class="insRow">
      <label>type</label>
      <select id="ins_type" class="grow">
        ${typeOptions.map(t => `<option value="${t}" ${t===n.type ? "selected" : ""}>${t}</option>`).join("")}
      </select>
    </div>

    <div class="insRow">
      <label>actor</label>
      <select id="ins_actor" class="grow">
        ${roles.map(r => `<option value="${r}" ${r=== (n.actor_role || "") ? "selected" : ""}>${r || "—"}</option>`).join("")}
      </select>
    </div>

    <div class="insRow">
      <label>equip</label>
      <input id="ins_equip" class="grow" value="${(n.equipment || []).join(", ").replace(/"/g, "&quot;")}" placeholder="kotel_1, pot_1" />
    </div>

    <div class="insRow">
      <label>duration</label>
      <input id="ins_dur" class="grow" value="${n.duration_min ?? ""}" placeholder="минуты" />
    </div>

    <div class="small">parameters (JSON)</div>
    <textarea id="ins_params" class="insTextarea">${params}</textarea>

    <div class="small">disposition (JSON)</div>
    <textarea id="ins_disp" class="insTextarea">${disp}</textarea>

    <div class="insRow" style="margin-top:8px;">
      <button id="ins_save">Сохранить узел</button>
      <span class="small">узлы кликаются в схеме</span>
    </div>
  `;

  const btn = document.getElementById("ins_save");
  btn.addEventListener("click", async () => {
    const payload = {};
    payload.title = document.getElementById("ins_title").value;
    payload.type = document.getElementById("ins_type").value;
    payload.actor_role = document.getElementById("ins_actor").value || null;

    const equipStr = document.getElementById("ins_equip").value || "";
    payload.equipment = equipStr.split(",").map(x => x.trim()).filter(Boolean);

    const durStr = (document.getElementById("ins_dur").value || "").trim();
    payload.duration_min = durStr ? parseInt(durStr, 10) : null;

    try {
      payload.parameters = safeJsonParse(document.getElementById("ins_params").value);
      payload.disposition = safeJsonParse(document.getElementById("ins_disp").value);
    } catch (e) {
      alert("JSON ошибка в parameters/disposition");
      return;
    }

    await api(`/api/sessions/${sessionId}/nodes/${n.id}`, "POST", payload);
    await refresh();
    setSelectedNodeId(n.id);
  });
}

async function refresh() {
  const s = await api(`/api/sessions/${sessionId}`);
  sessionCache = s;
  el("sessionMeta").textContent = `session: ${s.id} • ${s.title} • v${s.version}`;
  renderMermaid(s.mermaid);
  renderNormalized(s);
  renderInspector(s);
  renderQuestions(s.questions || []);
}

async function newSession() {
  const title = prompt("Название процесса (например: Бульон Фо Бо / Борщ):", "Бульон Фо Бо");
  if (!title) return;

  const rolesStr = prompt("Роли (через запятую, IDs). Пример: cook_1,cook_2,brigadir,technolog", "cook_1,cook_2,brigadir,technolog");
  const roles = (rolesStr || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);

  const s = await api("/api/sessions", "POST", { title, roles: roles.length ? roles : undefined });
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
  const r = await api(`/api/sessions/${sessionId}/export`, "POST", {});
  alert(`Экспортировано: ${r.exported_to}`);
}

el("btnNew").addEventListener("click", newSession);
el("btnSend").addEventListener("click", sendNotes);
el("btnExport").addEventListener("click", exportSession);

window.addEventListener("hashchange", () => {
  if (sessionCache) renderInspector(sessionCache);
});

(async () => {
  await newSession();
})();
