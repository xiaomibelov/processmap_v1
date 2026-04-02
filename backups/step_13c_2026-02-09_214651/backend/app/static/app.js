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

function getView() {
  const v = (localStorage.getItem("mermaid_view") || "lanes").trim();
  return (v === "simple") ? "simple" : "lanes";
}

function setView(v) {
  localStorage.setItem("mermaid_view", v);
}

function updateViewBtn() {
  const v = getView();
  el("btnView").textContent = (v === "lanes") ? "Вид: роли" : "Вид: простой";
}

function mermaidCodeForSession(s) {
  const v = getView();
  if (!s || !s.nodes || !s.nodes.length) return "flowchart TD\n  A[Нет шагов] --> B[Добавь заметки слева]\n";
  if (v === "simple") return s.mermaid_simple || s.mermaid || "";
  return s.mermaid_lanes || s.mermaid || "";
}

function renderMermaid(code) {
  const m = el("mermaid");
  m.removeAttribute("data-processed");
  m.textContent = code || "flowchart TD\n  A[Нет данных] --> B[Начни вводить заметки]\n";
  mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
  try { mermaid.run({ nodes: [m] }); } catch (e) { console.error(e); }
}

function renderResources(s) {
  const wrap = el("resources");
  const r = (s && s.resources) ? s.resources : null;
  if (!r) {
    wrap.innerHTML = `<div class="small">Нет данных</div>`;
    return;
  }
  const eq = (r.equipment || []).slice(0, 50);
  const conflicts = (r.conflict_nodes || []).length;

  const eqHtml = eq.length
    ? eq.map(item => {
        const id = String(item.equipment_id || "");
        const intervals = item.intervals || [];
        const confs = item.conflicts || [];
        const head = `<div class="small"><b>${id}</b> • интервалов: ${intervals.length} • конфликтов: ${confs.length}</div>`;

        const confHtml = confs.slice(0, 5).map(c => {
          const a = c.a || {};
          const b = c.b || {};
          return `<div class="small" style="margin-top:4px;">
                    ${badge("VARIANT")}
                    <a class="link" href="#node=${a.node_id}">${a.node_id}</a> (${a.actor_role}, ${a.start_min}-${a.end_min})
                    ↔
                    <a class="link" href="#node=${b.node_id}">${b.node_id}</a> (${b.actor_role}, ${b.start_min}-${b.end_min})
                  </div>`;
        }).join("");

        const intsHtml = intervals.slice(0, 6).map(x => {
          return `<div class="small" style="opacity:.85;">
                    <a class="link" href="#node=${x.node_id}">${x.node_id}</a> • ${x.actor_role} • ${x.start_min}-${x.end_min} мин
                  </div>`;
        }).join("");

        return `<div style="padding:8px;border:1px solid rgba(0,0,0,.08);border-radius:10px;margin-top:8px;">
                  ${head}
                  ${confs.length ? `<div class="small" style="margin-top:6px;opacity:.85;"><b>Конфликты (top)</b></div>${confHtml}` : ""}
                  <div class="small" style="margin-top:6px;opacity:.85;"><b>Интервалы (top)</b></div>
                  ${intsHtml || `<div class="small">—</div>`}
                </div>`;
      }).join("")
    : `<div class="small">Оборудование не задано в узлах</div>`;

  wrap.innerHTML = `
    <div class="small"><b>Оборудование</b>: ${eq.length} • конфликтных узлов: ${conflicts}</div>
    <div class="small" style="opacity:.75;">Конфликт = возможное пересечение по времени или неизвестная длительность</div>
    ${eqHtml}
  `;
}

function _parseEquipList(equipStr) {
  return (equipStr || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function _safeJsonParse(s) {
  try {
    return JSON.parse((s || "").trim() || "{}");
  } catch (e) {
    return null;
  }
}

function _renderDispositionQuickUI(equipList, dispObj) {
  const actions = [
    ["leave", "Оставить"],
    ["return_storage", "Вернуть"],
    ["wash", "Мойка"],
    ["sanitize", "Санобработка"],
    ["dispose", "Утилизация"],
  ];

  const current = (dispObj && dispObj.equipment_actions && typeof dispObj.equipment_actions === "object")
    ? dispObj.equipment_actions
    : {};

  const rows = equipList.slice(0, 8).map(eq => {
    const cur = current[eq] || "";
    const btns = actions.map(([code, label]) => {
      const active = (cur === code) ? `style="opacity:1;border:1px solid rgba(0,0,0,.25)"` : `style="opacity:.85"`;
      return `<button data-eq="${eq}" data-act="${code}" ${active}>${label}</button>`;
    }).join("");
    return `<div class="small" style="margin-top:6px;">
              <b>${eq}</b>
              <div class="row" style="margin-top:6px;gap:6px;flex-wrap:wrap;">${btns}</div>
            </div>`;
  }).join("");

  return `
    <div style="padding:8px;border:1px solid rgba(0,0,0,.08);border-radius:10px;margin-top:8px;">
      <div class="small"><b>После шага: оборудование</b> (быстрое действие)</div>
      <div class="small" style="opacity:.75;">Клик по действию заполнит disposition.equipment_actions</div>
      ${rows || `<div class="small">Оборудование не задано</div>`}
      <div class="small" style="margin-top:10px;"><b>Комментарий</b></div>
      <input id="disp_note" class="grow" placeholder="например: протереть и оставить рядом" value="${(dispObj && dispObj.note ? String(dispObj.note) : "").replace(/"/g, "&quot;")}" />
      <div class="row" style="margin-top:8px;gap:8px;">
        <button id="disp_apply_note">Применить комментарий</button>
        <button id="disp_clear">Очистить disposition</button>
      </div>
    </div>
  `;
}

function _renderLossQuickUI(nodeType, paramsObj) {
  if (nodeType !== "loss_event") return "";
  const loss = (paramsObj && paramsObj.loss && typeof paramsObj.loss === "object") ? paramsObj.loss : {};
  const reason = loss.reason ? String(loss.reason) : "";
  const volume = loss.volume ? String(loss.volume) : "";
  const approved = loss.approved_by ? String(loss.approved_by) : "";
  const recorded = loss.recorded_in ? String(loss.recorded_in) : "";
  const evidence = loss.evidence ? String(loss.evidence) : "";

  return `
    <div style="padding:8px;border:1px solid rgba(0,0,0,.08);border-radius:10px;margin-top:10px;">
      <div class="small"><b>Списание/потеря (loss)</b></div>

      <div class="insRow" style="margin-top:8px;">
        <label>reason</label>
        <input id="loss_reason" class="grow" value="${reason.replace(/"/g, "&quot;")}" placeholder="причина (можно текстом)" />
      </div>

      <div class="insRow">
        <label>volume</label>
        <input id="loss_volume" class="grow" value="${volume.replace(/"/g, "&quot;")}" placeholder="пример: 3 л, 1.5 кг, 2 шт" />
      </div>

      <div class="insRow">
        <label>approved</label>
        <input id="loss_approved" class="grow" value="${approved.replace(/"/g, "&quot;")}" placeholder="кто утвердил (роль/ФИО)" />
      </div>

      <div class="insRow">
        <label>recorded</label>
        <input id="loss_recorded" class="grow" value="${recorded.replace(/"/g, "&quot;")}" placeholder="где фиксируется (журнал/1C/...)"/>
      </div>

      <div class="insRow">
        <label>evidence</label>
        <input id="loss_evidence" class="grow" value="${evidence.replace(/"/g, "&quot;")}" placeholder="фото/акт/номер записи"/>
      </div>

      <div class="row" style="margin-top:8px;gap:8px;">
        <button id="loss_apply">Применить loss</button>
        <button id="loss_clear">Очистить loss</button>
      </div>
    </div>
  `;
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

  const sched = (n.parameters && n.parameters._sched) ? n.parameters._sched : null;
  const schedLine = sched ? `<div class="small" style="opacity:.85;">⏱ ${sched.start_min}-${sched.end_min} мин</div>` : "";

  const conflict = (n.parameters && n.parameters._res_conflict) ? `<div class="small" style="margin-top:6px;">${badge("VARIANT")} возможный конфликт оборудования</div>` : "";

  const params = JSON.stringify(n.parameters || {}, null, 2);
  const disp = JSON.stringify(n.disposition || {}, null, 2);

  const equipCsv = (n.equipment || []).join(", ");
  const equipList = _parseEquipList(equipCsv);
  const dispObj = (n.disposition && typeof n.disposition === "object") ? n.disposition : {};
  const paramsObj = (n.parameters && typeof n.parameters === "object") ? n.parameters : {};

  wrap.innerHTML = `
    <div class="small">ID: <b>${n.id}</b></div>
    ${schedLine}
    ${conflict}

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
      <input id="ins_equip" class="grow" value="${equipCsv.replace(/"/g, "&quot;")}" placeholder="kotel_1, skovoroda_1" />
    </div>

    <div class="insRow">
      <label>duration</label>
      <input id="ins_dur" class="grow" value="${n.duration_min ?? ""}" placeholder="минуты" />
    </div>

    ${_renderDispositionQuickUI(equipList, dispObj)}
    ${_renderLossQuickUI(n.type, paramsObj)}

    <div class="small" style="margin-top:10px;">parameters (JSON)</div>
    <textarea id="ins_params" class="insTextarea">${params}</textarea>

    <div class="small">disposition (JSON)</div>
    <textarea id="ins_disp" class="insTextarea">${disp}</textarea>

    <div class="insRow" style="margin-top:8px;">
      <button id="ins_save">Сохранить узел</button>
      <span class="small">клик по узлу на схеме открывает инспектор</span>
    </div>
  `;

  const saveNode = async () => {
    const payload = {};
    payload.title = document.getElementById("ins_title").value;
    payload.type = document.getElementById("ins_type").value;
    payload.actor_role = document.getElementById("ins_actor").value || null;

    const equipStr = document.getElementById("ins_equip").value || "";
    payload.equipment = _parseEquipList(equipStr);

    const durStr = (document.getElementById("ins_dur").value || "").trim();
    payload.duration_min = durStr ? parseInt(durStr, 10) : null;

    const pObj = _safeJsonParse(document.getElementById("ins_params").value);
    const dObj = _safeJsonParse(document.getElementById("ins_disp").value);
    if (pObj === null || dObj === null) {
      alert("JSON ошибка в parameters/disposition");
      return;
    }
    payload.parameters = pObj;
    payload.disposition = dObj;

    await api(`/api/sessions/${sessionId}/nodes/${n.id}`, "POST", payload);
    await refresh();
    setSelectedNodeId(n.id);
  };

  document.getElementById("ins_save").addEventListener("click", saveNode);

  wrap.querySelectorAll('button[data-eq][data-act]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const eq = btn.getAttribute("data-eq");
      const act = btn.getAttribute("data-act");
      const dispText = document.getElementById("ins_disp").value;
      const dObj = _safeJsonParse(dispText);
      if (dObj === null) {
        alert("JSON ошибка в disposition");
        return;
      }
      dObj.equipment_actions = dObj.equipment_actions && typeof dObj.equipment_actions === "object" ? dObj.equipment_actions : {};
      dObj.equipment_actions[eq] = act;
      const note = document.getElementById("disp_note").value || "";
      if (note.trim()) dObj.note = note.trim();
      document.getElementById("ins_disp").value = JSON.stringify(dObj, null, 2);
      await saveNode();
    });
  });

  const noteBtn = document.getElementById("disp_apply_note");
  if (noteBtn) {
    noteBtn.addEventListener("click", async () => {
      const dispText = document.getElementById("ins_disp").value;
      const dObj = _safeJsonParse(dispText);
      if (dObj === null) {
        alert("JSON ошибка в disposition");
        return;
      }
      const note = document.getElementById("disp_note").value || "";
      if (note.trim()) dObj.note = note.trim();
      document.getElementById("ins_disp").value = JSON.stringify(dObj, null, 2);
      await saveNode();
    });
  }

  const clearBtn = document.getElementById("disp_clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      document.getElementById("ins_disp").value = "{}";
      document.getElementById("disp_note").value = "";
      await saveNode();
    });
  }

  const lossApply = document.getElementById("loss_apply");
  if (lossApply) {
    lossApply.addEventListener("click", async () => {
      const pText = document.getElementById("ins_params").value;
      const pObj = _safeJsonParse(pText);
      if (pObj === null) {
        alert("JSON ошибка в parameters");
        return;
      }
      pObj.loss = pObj.loss && typeof pObj.loss === "object" ? pObj.loss : {};
      pObj.loss.reason = document.getElementById("loss_reason").value || "";
      pObj.loss.volume = document.getElementById("loss_volume").value || "";
      pObj.loss.approved_by = document.getElementById("loss_approved").value || "";
      pObj.loss.recorded_in = document.getElementById("loss_recorded").value || "";
      pObj.loss.evidence = document.getElementById("loss_evidence").value || "";
      document.getElementById("ins_params").value = JSON.stringify(pObj, null, 2);
      await saveNode();
    });
  }

  const lossClear = document.getElementById("loss_clear");
  if (lossClear) {
    lossClear.addEventListener("click", async () => {
      const pText = document.getElementById("ins_params").value;
      const pObj = _safeJsonParse(pText);
      if (pObj === null) {
        alert("JSON ошибка в parameters");
        return;
      }
      delete pObj.loss;
      document.getElementById("ins_params").value = JSON.stringify(pObj, null, 2);
      await saveNode();
    });
  }
}

function renderQuestions(qs) {
  const wrap = el("questions");
  wrap.innerHTML = "";
  (qs || []).filter(q => q.status === "open").slice(0, 60).forEach(q => {
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

async function refresh() {
  const s = await api(`/api/sessions/${sessionId}`);
  sessionCache = s;
  el("sessionMeta").textContent = `session: ${s.id} • ${s.title} • v${s.version}`;
  updateViewBtn();
  renderMermaid(mermaidCodeForSession(s));
  renderResources(s);
  renderInspector(s);
  renderQuestions(s.questions || []);
}

async function newSession() {
  const title = prompt("Название процесса:", "Бульон Фо Бо");
  if (!title) return;

  const rolesStr = prompt("Роли (через запятую):", "cook_1,cook_2,brigadir,technolog");
  const roles = (rolesStr || "").split(",").map(x => x.trim()).filter(Boolean);

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

el("btnView").addEventListener("click", async () => {
  const v = getView();
  setView(v === "lanes" ? "simple" : "lanes");
  updateViewBtn();
  if (sessionCache) renderMermaid(mermaidCodeForSession(sessionCache));
});

window.addEventListener("hashchange", () => {
  if (sessionCache) renderInspector(sessionCache);
});

(async () => {
  if (!localStorage.getItem("mermaid_view")) setView("lanes");
  updateViewBtn();
  await newSession();
})();
