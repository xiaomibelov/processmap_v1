let sessionId = null;
let sessionCache = null;

let overlayOpenNodeId = null;
let overlayOpenEl = null;
let overlayOpenAnchor = null;
let overlayOpenByNode = {};

let sessionsModalOpen = false;
let sessionsSearchTimer = null;

function el(id) { return document.getElementById(id); }

function getLastSessionId() {
  const v = (localStorage.getItem("last_session_id") || "").trim();
  return v ? v : null;
}

function setSessionId(id) {
  sessionId = id || null;
  if (sessionId) localStorage.setItem("last_session_id", sessionId);
}

function clearSessionId() {
  sessionId = null;
  localStorage.removeItem("last_session_id");
}

function setTopbarError(msg) {
  const s = (msg || "").toString().trim();
  const meta = el("sessionMeta");
  if (meta) meta.textContent = s ? `error: ${s}` : "session: —";
}

function _fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso || "";
  }
}

function _openSessionsModal() {
  const modal = el("sessionModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  sessionsModalOpen = true;
  _loadSessionsList().catch(e => alert(e.message || String(e)));
  const inp = el("sessSearch");
  if (inp) inp.focus();
}

function _closeSessionsModal() {
  const modal = el("sessionModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  sessionsModalOpen = false;
}

async function _loadSessionsList() {
  const list = el("sessList");
  const empty = el("sessEmpty");
  if (!list) return;
  const q = (el("sessSearch") ? el("sessSearch").value : "").trim();
  const url = q ? `/api/sessions?q=${encodeURIComponent(q)}&limit=200` : `/api/sessions?limit=200`;
  const data = await api(url);
  const items = (data && data.items) ? data.items : [];
  list.innerHTML = "";
  if (empty) empty.style.display = items.length ? "none" : "block";

  items.forEach(it => {
    const sid = (it.id || "").toString();
    const title = (it.title || "(без названия)").toString();
    const upd = _fmtDate(it.updated_at);
    const openN = Number(it.open_questions || 0);
    const ansN = Number(it.answered_questions || 0);
    const v = it.version || 0;
    const preview = (it.notes_preview || "").toString();
    const isCur = sessionId && sid === sessionId;

    const row = document.createElement("div");
    row.className = "sessItem";
    row.innerHTML = `
      <div class="sessLeft">
        <div class="sessTitle">${isCur ? "▶ " : ""}${title}</div>
        <div class="sessMeta">id: ${sid} • v${v} • ${upd}</div>
        <div class="sessPreview">${preview.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
      </div>
      <div class="sessRight">
        <span class="pill">answered: ${ansN}</span>
        <span class="pill">open: ${openN}</span>
        <button class="btnGhost" data-act="open" data-id="${sid}">Открыть</button>
        <button class="btnGhost" data-act="rename" data-id="${sid}">Переименовать</button>
      </div>
    `;
    list.appendChild(row);
  });
}

async function api(path, method = "GET", body = null) {
  const opt = { method, headers: { "Content-Type": "application/json" } };
  if (body) opt.body = JSON.stringify(body);

  const r = await fetch(path, opt);

  const ct = (r.headers.get("content-type") || "").toLowerCase();
  let data = null;

  if (ct.includes("application/json")) {
    data = await r.json();
  } else {
    const t = await r.text();
    if (!r.ok) throw new Error(t || r.statusText);
    return t;
  }

  if (!r.ok) {
    const msg = (data && (data.detail || data.error)) ? (data.detail || data.error) : r.statusText;
    throw new Error(msg);
  }

  if (data && typeof data === "object" && data.error) {
    throw new Error(data.error);
  }

  return data;
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

function _graphEls() {
  const wrap = el("graphWrap") || document.querySelector(".graphWrap");
  const inner = el("graphInner") || (wrap ? wrap.querySelector(".graphInner") : null);
  const overlay = el("graphOverlay") || (inner ? inner.querySelector(".graphOverlay") : null);
  return { wrap, inner, overlay };
}

function _getGraphSvg() {
  const { inner } = _graphEls();
  if (!inner) return null;
  const svg = inner.querySelector("svg");
  return svg || null;
}

function _closeOverlayPopover() {
  overlayOpenNodeId = null;
  overlayOpenAnchor = null;
  if (overlayOpenEl && overlayOpenEl.parentNode) overlayOpenEl.parentNode.removeChild(overlayOpenEl);
  overlayOpenEl = null;
}

function _buildQuestionIndex(s) {
  const idx = {};
  (s && s.questions ? s.questions : []).forEach(q => {
    if (!q) return;
    const nid = (q.node_id || '').toString().trim();
    if (!nid) return;
    if (!idx[nid]) idx[nid] = { open: [], answered: [] };
    const orphaned = !!q.orphaned;
    if (q.status === 'open' && !orphaned) idx[nid].open.push(q);
    if (q.status === 'answered') idx[nid].answered.push(q);
  });
  return idx;
}

function _groupOpenQuestionsByNode(s) {
  const idx = _buildQuestionIndex(s);
  const by = {};
  Object.keys(idx).forEach(nid => {
    const open = idx[nid].open || [];
    if (open.length) by[nid] = open;
  });
  return by;
}

function _toneForNodeQuestions(qs) {
  const types = (qs || []).map(q => (q.issue_type || "").toString().toLowerCase());
  if (types.includes("critical")) return "critical";
  if (types.includes("missing")) return "missing";
  if (types.includes("ambig")) return "ambig";
  return "ambig";
}

function _findAnchorForNode(svg, nodeId) {
  const wanted = `#node=${nodeId}`;
  const links = svg.querySelectorAll("a");
  for (const a of links) {
    const href = a.getAttribute("href") || a.getAttribute("xlink:href") || "";
    if (href === wanted) return a;
  }
  return null;
}

function _rectWithinInner(elem, inner) {
  const r = elem.getBoundingClientRect();
  const ir = inner.getBoundingClientRect();
  return {
    x: r.left - ir.left,
    y: r.top - ir.top,
    w: r.width,
    h: r.height,
    r
  };
}

function _clamp(v, a, b) {
  if (v < a) return a;
  if (v > b) return b;
  return v;
}

function _openOverlayPopover(nodeId, stats, anchorRect) {
  const { overlay, inner } = _graphEls();
  if (!overlay || !inner) return;

  _closeOverlayPopover();

  overlayOpenNodeId = nodeId;
  overlayOpenAnchor = anchorRect;

  const openQs = (stats && stats.open) ? stats.open : [];
  const answeredN = (stats && stats.answered) ? stats.answered.length : 0;

  const pop = document.createElement('div');
  pop.className = 'qPopover';
  pop.style.visibility = 'hidden';

  const title = `Узел ${nodeId}: open ${openQs.length}${answeredN ? ` • answered ${answeredN}` : ''}`;
  pop.innerHTML = `
    <div class="qPopoverTop">
      <div class="qPopoverTitle">${title}</div>
      <button class="qPopoverClose" id="qPopClose">Закрыть</button>
    </div>
    <div id="qPopList"></div>
  `;

  const list = pop.querySelector('#qPopList');

  (openQs || []).slice(0, 40).forEach(q => {
    const opts = (q.options && q.options.length) ? q.options.slice(0, 12) : [];
    const useButtons = opts.length > 0 && opts.length <= 6;

    const optButtons = useButtons
      ? `<div class="qOptRow">
          ${opts.map(o => `<button class="qOptBtn" data-act="opt" data-qid="${q.id}" data-val="${o.replace(/"/g, '&quot;')}">${o}</button>`).join('')}
         </div>`
      : '';

    const optSelect = (!useButtons && opts.length)
      ? `<select data-qid="${q.id}">
           <option value="">—</option>
           ${opts.map(o => `<option value="${o}">${o}</option>`).join('')}
         </select>`
      : '';

    const item = document.createElement('div');
    item.className = 'qPopItem';
    item.innerHTML = `
      <div class="qTop">
        <div>${badge(q.issue_type)} <span class="small" style="opacity:.85;">${q.id}</span></div>
        <div class="small" style="opacity:.65;">open</div>
      </div>
      <div class="qText">${q.question}</div>
      ${optButtons}
      <div class="qActions">
        ${optSelect}
        <input data-qid="${q.id}" placeholder="ответ..." />
        <button data-act="answer" data-qid="${q.id}">Ответить</button>
      </div>
    `;
    list.appendChild(item);
  });

  overlay.appendChild(pop);
  overlayOpenEl = pop;

  const ow = overlay.clientWidth || 600;
  const oh = overlay.clientHeight || 400;

  const pw = pop.offsetWidth || 320;
  const ph = pop.offsetHeight || 260;

  const pad = 8;

  const ax = anchorRect ? anchorRect.x : 20;
  const ay = anchorRect ? anchorRect.y : 20;
  const aw = anchorRect ? anchorRect.w : 0;
  const ah = anchorRect ? anchorRect.h : 0;

  const cand = [
    { x: ax + aw + 12, y: ay - 6 },
    { x: ax - pw - 12, y: ay - 6 },
    { x: ax + aw + 12, y: ay + ah - 22 },
    { x: ax - pw - 12, y: ay + ah - 22 },
  ];

  let chosen = null;
  for (const c of cand) {
    const okX = c.x >= pad && (c.x + pw) <= (ow - pad);
    const okY = c.y >= pad && (c.y + ph) <= (oh - pad);
    if (okX && okY) { chosen = c; break; }
  }

  let left = chosen ? chosen.x : (anchorRect ? (ax + aw + 12) : 20);
  let top = chosen ? chosen.y : (anchorRect ? (ay - 6) : 20);

  left = _clamp(left, pad, Math.max(pad, ow - pw - pad));
  top = _clamp(top, pad, Math.max(pad, oh - ph - pad));

  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.visibility = 'visible';

  const closeBtn = pop.querySelector('#qPopClose');
  closeBtn.addEventListener('click', () => _closeOverlayPopover());

  pop.querySelectorAll('button[data-act="opt"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const qid = btn.getAttribute('data-qid');
      const val = btn.getAttribute('data-val') || '';
      if (!val) return;

      await api(`/api/sessions/${sessionId}/answers`, 'POST', { node_id: nodeId, question_id: qid, answer: val });
      await refresh({ keepPopoverFor: nodeId });
    });
  });

  pop.querySelectorAll('button[data-act="answer"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const qid = btn.getAttribute('data-qid');
      const inp = pop.querySelector(`input[data-qid="${qid}"]`);
      const sel = pop.querySelector(`select[data-qid="${qid}"]`);
      const val = (sel && sel.value) ? sel.value : (inp ? inp.value : '');
      if (!val) return;

      await api(`/api/sessions/${sessionId}/answers`, 'POST', { node_id: nodeId, question_id: qid, answer: val });
      await refresh({ keepPopoverFor: nodeId });
    });
  });

  setTimeout(() => {
    const onDoc = (e) => {
      if (!overlayOpenEl) return;
      const t = e.target;
      if (!t) return;
      if (overlayOpenEl.contains(t)) return;
      if (t.closest && t.closest('.nodeBadgeBtn')) return;
      _closeOverlayPopover();
      document.removeEventListener('mousedown', onDoc, true);
    };
    document.addEventListener('mousedown', onDoc, true);
  }, 0);
}


function _renderInlineQuestions(s) {
  const { overlay, inner } = _graphEls();
  if (!overlay || !inner) return;

  overlay.innerHTML = '';

  const idx = _buildQuestionIndex(s);
  overlayOpenByNode = {};
  Object.keys(idx).forEach(nid => {
    if (idx[nid] && idx[nid].open && idx[nid].open.length) overlayOpenByNode[nid] = idx[nid].open;
  });

  const svg = _getGraphSvg();
  if (!svg) return;

  const keys = Object.keys(overlayOpenByNode).slice(0, 200);
  for (const nodeId of keys) {
    const openQs = overlayOpenByNode[nodeId] || [];
    if (!openQs.length) continue;

    const stats = idx[nodeId] || { open: openQs, answered: [] };
    const answeredN = (stats.answered || []).length;

    const a = _findAnchorForNode(svg, nodeId);
    if (!a) continue;

    const tgt = a.querySelector('g') || a;
    const rect = _rectWithinInner(tgt, inner);

    const tone = _toneForNodeQuestions(openQs);

    const holder = document.createElement('div');
    holder.className = 'nodeBadge';
    holder.style.left = `${rect.x + rect.w - 10}px`;
    holder.style.top = `${rect.y - 10}px`;

    const label = answeredN ? `${answeredN}/${openQs.length}` : `${openQs.length}`;
    const title = answeredN
      ? `answered: ${answeredN} • open: ${openQs.length}`
      : `open: ${openQs.length}`;

    holder.innerHTML = `<button class="nodeBadgeBtn tone-${tone}" data-node="${nodeId}" title="${title}">${label}</button>`;
    overlay.appendChild(holder);

    const btn = holder.querySelector('button');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      _openOverlayPopover(nodeId, stats, rect);
      setSelectedNodeId(nodeId);
    });
  }

  const selected = selectedNodeIdFromHash();
  if (selected && idx[selected] && idx[selected].open && idx[selected].open.length) {
    const a = _findAnchorForNode(svg, selected);
    const tgt = a ? (a.querySelector('g') || a) : null;
    if (tgt) {
      const rect = _rectWithinInner(tgt, inner);
      _openOverlayPopover(selected, idx[selected], rect);
    }
  }
}


async function renderMermaid(code) {
  const m = el("mermaid");
  const { inner } = _graphEls();
  if (inner) inner.scrollTop = inner.scrollTop;

  m.removeAttribute("data-processed");
  m.textContent = code || "flowchart TD\n  A[Нет данных] --> B[Начни вводить заметки]\n";
  mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });

  try {
    const res = mermaid.run({ nodes: [m] });
    if (res && typeof res.then === "function") await res;
  } catch (e) {
    console.error(e);
  }
}

function renderResources(s) {
  const wrap = el("resources");
  const r = (s && s.resources) ? s.resources : null;
  if (!wrap) return;
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
  if (!wrap) return;

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

async function refresh() {
  const { overlay } = _graphEls();
  if (!sessionId) {
    setTopbarError("нет sessionId");
    sessionCache = null;
    _closeOverlayPopover();
    if (overlay) overlay.innerHTML = "";
    await renderMermaid(mermaidCodeForSession(null));
    renderResources(null);
    renderInspector(null);
    return;
  }

  try {
    const s = await api(`/api/sessions/${sessionId}`);
    sessionCache = s;
    el("sessionMeta").textContent = `session: ${s.id} • ${s.title} • v${s.version}`;
    updateViewBtn();

    await renderMermaid(mermaidCodeForSession(s));
    renderResources(s);
    renderInspector(s);
    _renderInlineQuestions(s);
  } catch (e) {
    setTopbarError(e.message || String(e));
    throw e;
  }
}

async function autoBootstrapSession() {
  const last = getLastSessionId();
  if (last) {
    setSessionId(last);
    try {
      await refresh();
      return;
    } catch (e) {
      clearSessionId();
    }
  }

  const s = await api("/api/sessions", "POST", { title: "Новый процесс", roles: ["cook_1","cook_2","brigadir","technolog"] });
  setSessionId(s.id);
  await refresh();
}

async function newSession() {
  const title = prompt("Название процесса:", "Новый процесс");
  const t = (title || "").trim() || "Новый процесс";

  const rolesStr = prompt("Роли (через запятую):", "cook_1,cook_2,brigadir,technolog");
  const roles = (rolesStr || "").split(",").map(x => x.trim()).filter(Boolean);

  const s = await api("/api/sessions", "POST", { title: t, roles: roles.length ? roles : undefined });
  setSessionId(s.id);
  _closeOverlayPopover();
  await refresh();
}

async function sendNotes() {
  if (!sessionId) {
    await autoBootstrapSession();
  }
  const notes = el("notes").value || "";
  if (!notes.trim()) return;
  await api(`/api/sessions/${sessionId}/notes`, "POST", { notes });
  _closeOverlayPopover();
  await refresh();
}

async function exportSession() {
  if (!sessionId) {
    await autoBootstrapSession();
  }
  const r = await api(`/api/sessions/${sessionId}/export`, "POST", {});
  alert(`Экспортировано: ${r.exported_to}`);
}

el("btnNew").addEventListener("click", () => newSession().catch(e => alert(e.message || String(e))));
el("btnSessions").addEventListener("click", () => _openSessionsModal());
el("btnSend").addEventListener("click", () => sendNotes().catch(e => alert(e.message || String(e))));
el("btnExport").addEventListener("click", () => exportSession().catch(e => alert(e.message || String(e))));

if (el("sessClose")) el("sessClose").addEventListener("click", () => _closeSessionsModal());
if (el("sessReload")) el("sessReload").addEventListener("click", () => _loadSessionsList().catch(e => alert(e.message || String(e))));
if (el("sessSearch")) {
  el("sessSearch").addEventListener("input", () => {
    if (sessionsSearchTimer) clearTimeout(sessionsSearchTimer);
    sessionsSearchTimer = setTimeout(() => {
      _loadSessionsList().catch(e => alert(e.message || String(e)));
    }, 250);
  });
}

if (el("sessionModal")) {
  el("sessionModal").addEventListener("click", (e) => {
    const actEl = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
    const act = actEl ? actEl.getAttribute("data-act") : null;
    if (act === "close") {
      _closeSessionsModal();
      return;
    }
  });
}

if (el("sessList")) {
  el("sessList").addEventListener("click", async (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("button[data-act]") : null;
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    const sid = btn.getAttribute("data-id");
    if (!sid) return;

    if (act === "open") {
      setSessionId(sid);
      _closeSessionsModal();
      _closeOverlayPopover();
      await refresh();
      return;
    }

    if (act === "rename") {
      const cur = btn.closest(".sessItem") ? (btn.closest(".sessItem").querySelector(".sessTitle")?.textContent || "") : "";
      const newTitle = prompt("Новое название:", cur.replace(/^▶\s*/, "").trim());
      const t = (newTitle || "").trim();
      if (!t) return;
      await api(`/api/sessions/${sid}`, "PATCH", { title: t });
      if (sessionId && sessionId === sid) await refresh();
      await _loadSessionsList();
      return;
    }
  });
}

el("btnView").addEventListener("click", () => {
  const v = getView();
  setView(v === "lanes" ? "simple" : "lanes");
  updateViewBtn();
  if (sessionCache) {
    renderMermaid(mermaidCodeForSession(sessionCache)).then(() => _renderInlineQuestions(sessionCache));
  }
});

window.addEventListener("hashchange", () => {
  if (sessionCache) {
    renderInspector(sessionCache);
    _renderInlineQuestions(sessionCache);
  }
});

document.addEventListener("click", (e) => {
  if (!overlayOpenEl) return;
  if (overlayOpenEl.contains(e.target)) return;
  const btn = e.target && e.target.closest ? e.target.closest(".nodeBadgeBtn") : null;
  if (btn) return;
  _closeOverlayPopover();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (sessionsModalOpen) {
      _closeSessionsModal();
      return;
    }
    _closeOverlayPopover();
  }
});

window.addEventListener("resize", () => {
  if (sessionCache) _renderInlineQuestions(sessionCache);
});

(async () => {
  if (!localStorage.getItem("mermaid_view")) setView("lanes");
  updateViewBtn();
  try {
    await autoBootstrapSession();
  } catch (e) {
    setTopbarError(e.message || String(e));
  }
})();
