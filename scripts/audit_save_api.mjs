// АУДИТ save-pipeline — API-сценарии (только воспроизведение, код не меняется).
// Sandbox-сессия 5ae321f04f («AUDIT save-pipeline sandbox») — копия XML супа.
// Сценарии: S4 (Rev/V), S1-race (параллельные save), S2 (дубли сессий), S3 (кэш/синхрон).
import fs from "node:fs";

const BASE = "https://stage.processmap.ru";
const TOKEN = process.env.W4_TOKEN;
const SID = "5ae321f04f";
const PID = "c0494e0667";
const SOUP = "13f1f10b20";
const OUT = [];
const log = (s, ...a) => { const line = `[audit-api] ${s}`; console.log(line, ...a); };

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function api(method, path, body, raw = false) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: H,
    body: body === undefined ? undefined : (raw ? body : JSON.stringify(body)),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* raw */ }
  return { status: r.status, json, text };
}

const getRev = async (sid) => (await api("GET", `/api/sessions/${sid}`)).json?.diagram_state_version;
const getXml = async (sid) => (await api("GET", `/api/sessions/${sid}/bpmn?raw=1`)).text;

function variantXml(xml, marker) {
  // безобидная мутация: комментарий-маркер перед </bpmn:definitions>
  return xml.replace("</bpmn:definitions>", `  <!-- audit:${marker} -->\n</bpmn:definitions>`);
}

async function putBpmn(sid, xml, opts = {}) {
  return api("PUT", `/api/sessions/${sid}/bpmn`, {
    xml,
    base_diagram_state_version: opts.base,
    source_action: opts.action || "manual_save",
    import_note: opts.note,
  });
}

function record(id, name, status, evidence, severity) {
  OUT.push({ id, name, status, evidence, severity });
  log(`${id} [${status}] ${name} :: ${evidence}`);
}

// ---------- S4: Rev инкременты ----------
async function s4_rev_series() {
  const rev0 = await getRev(SID);
  const xml = await getXml(SID);
  const seq = [];
  let base = rev0;
  for (let i = 1; i <= 3; i += 1) {
    const r = await putBpmn(SID, variantXml(xml, `s4-${i}`), { base });
    seq.push({ i, status: r.status, rev: r.json?.diagram_state_version });
    base = r.json?.diagram_state_version ?? base;
  }
  const revEnd = await getRev(SID);
  const ok = seq.every((s, idx) => s.status === 200 && s.rev === rev0 + idx + 1) && revEnd === rev0 + 3;
  record("S4.1", "Rev инкрементируется +1 на каждый save без пропусков",
    ok ? "OK" : "БАГ", `rev0=${rev0} seq=${JSON.stringify(seq)} revEnd=${revEnd}`,
    ok ? "" : "серьёзная");
}

// ---------- S4: CAS-ошибки ----------
async function s4_cas() {
  const rev = await getRev(SID);
  const xml = await getXml(SID);
  const stale = await putBpmn(SID, variantXml(xml, "s4-stale"), { base: rev - 2 });
  const noBase = await api("PUT", `/api/sessions/${SID}/bpmn`, { xml: variantXml(xml, "s4-nobase"), source_action: "manual_save" });
  const revAfter = await getRev(SID);
  const okStale = stale.status === 409 && String(stale.text).includes("CONFLICT");
  const okNoBase = noBase.status === 409;
  const stable = revAfter === rev;
  record("S4.2", "Stale base → 409 CONFLICT; без base → 409; rev не меняется",
    okStale && okNoBase && stable ? "OK" : "БАГ",
    `stale=${stale.status}:${(stale.json?.error || stale.text || "").slice(0, 60)} noBase=${noBase.status} rev ${rev}→${revAfter}`,
    okStale && okNoBase && stable ? "" : "серьёзная");
}

// ---------- S1-race: параллельные PUT /bpmn с одинаковым base ----------
async function s1_race_bpmn() {
  const rev = await getRev(SID);
  const xml = await getXml(SID);
  const results = await Promise.all([1, 2, 3, 4].map((i) =>
    putBpmn(SID, variantXml(xml, `race-${i}`), { base: rev }).then((r) => ({ i, status: r.status, rev: r.json?.diagram_state_version, err: (r.json?.error || "").slice(0, 40) }))));
  const revAfter = await getRev(SID);
  const xmlAfter = await getXml(SID);
  const winners = results.filter((r) => r.status === 200);
  const markers = [1, 2, 3, 4].filter((i) => xmlAfter.includes(`audit:race-${i}`));
  const statuses = results.map((r) => `${r.i}:${r.status}`).join(" ");
  // Ожидание CAS: ровно один 200, остальные 409/423; rev ровно +1; один маркер.
  const casOk = winners.length === 1 && revAfter === rev + 1 && markers.length === 1;
  record("S1.1", "4 параллельных PUT /bpmn с одним base: CAS отсекает гонку",
    casOk ? "OK" : "БАГ",
    `statuses=[${statuses}] winners=${winners.length} rev ${rev}→${revAfter} markersInXml=[${markers}]`,
    casOk ? "" : "блокер");
}

// ---------- S1-race: PUT /bpmn ∥ PUT /sessions (разные пути, общий row) ----------
async function s1_race_mixed() {
  const rev = await getRev(SID);
  const xml = await getXml(SID);
  const sess = (await api("GET", `/api/sessions/${SID}`)).json;
  const [bpmnR, putR] = await Promise.all([
    putBpmn(SID, variantXml(xml, "mixed-bpmn"), { base: rev }),
    api("PUT", `/api/sessions/${SID}`, {
      title: sess.title, roles: sess.roles || [], start_role: sess.start_role,
      notes: sess.notes || [], notes_by_element: sess.notes_by_element || {},
      interview: sess.interview || {}, nodes: [{ id: "audit_node", name: "AUDIT NODE", role: "x" }],
      edges: [], questions: sess.questions || [], mermaid: "", mermaid_simple: "", mermaid_lanes: "",
      base_diagram_state_version: rev,
    }),
  ]);
  await new Promise((r) => setTimeout(r, 500));
  const xmlAfter = await getXml(SID);
  const sessAfter = (await api("GET", `/api/sessions/${SID}`)).json;
  const hasMarker = xmlAfter.includes("audit:mixed-bpmn");
  const nodePresent = (sessAfter.nodes || []).some((n) => n.id === "audit_node");
  const revAfter = await getRev(SID);
  // put_session рекомьютит bpmn из nodes → может затереть XML параллельного bpmn-save
  const clobbered = !hasMarker;
  record("S1.2", `PUT /bpmn ∥ PUT /sessions (statuses ${bpmnR.status}/${putR.status}): кто выиграл?`,
    clobbered ? "БАГ" : "OK",
    `markerInXml=${hasMarker} node=${nodePresent} rev ${rev}→${revAfter} bpmnBytes=${xmlAfter.length}`,
    clobbered ? "серьёзная" : "");
  // cleanup nodes
  await api("PUT", `/api/sessions/${SID}`, {
    title: sess.title, roles: sess.roles || [], start_role: sess.start_role,
    notes: sess.notes || [], notes_by_element: sess.notes_by_element || {},
    interview: sess.interview || {}, nodes: [], edges: [], questions: sess.questions || [],
    mermaid: "", mermaid_simple: "", mermaid_lanes: "",
    base_diagram_state_version: await getRev(SID),
  });
  // вернуть XML супа
  await putBpmn(SID, xml, { base: await getRev(SID), action: "manual_save" });
}

// ---------- S4: V-снапшоты + restore ----------
async function s4_versions() {
  const xml = await getXml(SID);
  const rev = await getRev(SID);
  const v0 = (await api("GET", `/api/sessions/${SID}/bpmn/versions`)).json;
  // «Создать версию BPMN»: user-facing snapshot = publish_manual_save
  const r1 = await putBpmn(SID, variantXml(xml, "s4-v2"), { base: rev, action: "publish_manual_save" });
  const v1 = (await api("GET", `/api/sessions/${SID}/bpmn/versions`)).json;
  const grew = (v1?.user_facing_count ?? 0) === (v0?.user_facing_count ?? 0) + 1;
  const latest = v1?.latest_user_facing_revision_number;
  // restore к предыдущей версии
  const list = (await api("GET", `/api/sessions/${SID}/bpmn/versions?limit=50`)).json;
  const items = list?.items || list?.versions || [];
  const target = items.find((v) => v.version_number === latest - 1) || items[items.length - 2];
  let restoreInfo = "нет цели";
  let restored = false;
  if (target) {
    const rr = await api("POST", `/api/sessions/${SID}/bpmn/restore/${target.id}`, { base_diagram_state_version: await getRev(SID) });
    const xmlAfter = await getXml(SID);
    restored = rr.status === 200 && !xmlAfter.includes("audit:s4-v2");
    restoreInfo = `restore=${rr.status} markerGone=${!xmlAfter.includes("audit:s4-v2")} rev=${await getRev(SID)}`;
  }
  record("S4.3", "V+1 при «Создать версию»; откат восстанавливает XML",
    grew && restored ? "OK" : "БАГ",
    `userFacing ${v0?.user_facing_count}→${v1?.user_facing_count} latestV=${latest} ${restoreInfo}`,
    grew && restored ? "" : "серьёзная");
}

// ---------- S4: параллельные V-снапшоты (MAX+1 race) ----------
async function s4_version_race() {
  const xml = await getXml(SID);
  const before = (await api("GET", `/api/sessions/${SID}/bpmn/versions?limit=100`)).json;
  const numsBefore = new Set((before?.items || before?.versions || []).map((v) => v.version_number));
  // последовательные rev-обновления, чтобы оба snapshot'а были валидны, но одновременны:
  const rev = await getRev(SID);
  const results = [];
  // два PUT с publish_manual_save, второй сразу с base=rev+1 (предсказание) — иначе CAS отсечёт;
  // честный race: два с одним base, но snapshot создаётся до CAS-save? Проверяем факт.
  const [a, b] = await Promise.all([
    putBpmn(SID, variantXml(xml, "vrace-a"), { base: rev, action: "publish_manual_save" }),
    putBpmn(SID, variantXml(xml, "vrace-b"), { base: rev, action: "publish_manual_save" }),
  ]);
  results.push(a.status, b.status);
  const after = (await api("GET", `/api/sessions/${SID}/bpmn/versions?limit=100`)).json;
  const items = after?.items || after?.versions || [];
  const newNums = items.map((v) => v.version_number).filter((n) => !numsBefore.has(n));
  const dupes = items.length - new Set(items.map((v) => v.version_number)).size;
  record("S4.4", "Параллельные V-снапшоты: нумерация без дублей",
    dupes === 0 ? "OK" : "БАГ",
    `statuses=${results} newVersions=[${newNums}] dupVersionNumbers=${dupes} total=${items.length}`,
    dupes === 0 ? "" : "серьёзная");
}

// ---------- S3: свежесть read-path сразу после save ----------
async function s3_cache() {
  const rev = await getRev(SID);
  const xml = await getXml(SID);
  const marker = `s3-${Date.now()}`;
  const put = await putBpmn(SID, variantXml(xml, marker), { base: rev });
  const t0 = Date.now();
  const probes = [];
  for (let i = 0; i < 4; i += 1) {
    const raw = await getXml(SID);
    const meta = (await api("GET", `/api/sessions/${SID}/meta`)).json;
    const sess = (await api("GET", `/api/sessions/${SID}`)).json;
    probes.push({
      dt: Date.now() - t0,
      rawFresh: raw.includes(marker),
      metaRev: meta?.diagram_state_version ?? meta?.diagramStateVersion ?? "?",
      sessRev: sess?.diagram_state_version,
    });
    if (raw.includes(marker)) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  const last = probes[probes.length - 1];
  const ok = last.rawFresh && last.sessRev === rev + 1;
  record("S3.1", "raw/sess сразу после save отдают свежее (кэш инвалидирован)",
    ok ? "OK" : "БАГ", `putRev=${put.json?.diagram_state_version} probes=${JSON.stringify(probes)}`,
    ok ? "" : "серьёзная");
}

// ---------- S2: дубли сессий (одинаковый title) ----------
async function s2_dups() {
  const title = `AUDIT dup probe ${Date.now() % 100000}`;
  const seq1 = await api("POST", `/api/projects/${PID}/sessions`, { title, mode: "quick_skeleton" });
  const seq2 = await api("POST", `/api/projects/${PID}/sessions`, { title, mode: "quick_skeleton" });
  const [p1, p2] = await Promise.all([
    api("POST", `/api/projects/${PID}/sessions`, { title: `${title}-par`, mode: "quick_skeleton" }),
    api("POST", `/api/projects/${PID}/sessions`, { title: `${title}-par`, mode: "quick_skeleton" }),
  ]);
  const seqBlocked = seq2.status === 409;
  const parBoth200 = p1.status === 200 && p2.status === 200 && p1.json?.id !== p2.json?.id;
  record("S2.1", "Дубли сессий: последовательный 409; параллельный race",
    seqBlocked && !parBoth200 ? "OK" : (seqBlocked ? "БАГ(race)" : "БАГ"),
    `seq: ${seq1.status}/${seq2.status} par: ${p1.status}/${p2.status} parIds=${p1.json?.id}/${p2.json?.id}`,
    seqBlocked && !parBoth200 ? "" : (parBoth200 ? "серьёзная" : "косметика"));
}

// ---------- S3: ui_model(nodes) vs bpmn_xml на soup ----------
async function s3_model_vs_xml() {
  const sess = (await api("GET", `/api/sessions/${SOUP}`)).json;
  const xml = await getXml(SOUP);
  const taskCount = (xml.match(/<bpmn:(task|userTask|serviceTask|manualTask)/g) || []).length
    + (xml.match(/<bpmn:task /g) || []).length;
  const nodes = (sess.nodes || []).length;
  const edges = (sess.edges || []).length;
  // nodes пусты при живом XML → bpmn_xml — единственная истина; nodes/edges НЕ синхронизируются
  const divergence = nodes === 0 && taskCount > 0;
  record("S3.2", "ui_model(nodes/edges) ↔ bpmn_xml: истина в XML, draft не синхронизирован",
    divergence ? "ФАКТ" : "OK",
    `nodes=${nodes} edges=${edges} xmlTasks≈${taskCount} xmlBytes=${xml.length} dsv=${sess.diagram_state_version}`,
    divergence ? "серьёзная" : "");
}

// ---------- S3: GET /bpmn с побочной записью (export_regenerate) ----------
async function s3_get_side_effect() {
  // у сессии с nodes но устаревшим fingerprint GET /bpmn триггерит regenerate+persist (без lock/CAS)
  const revBefore = await getRev(SID);
  const sess = (await api("GET", `/api/sessions/${SID}`)).json;
  const xml = await getXml(SID);
  // установить nodes (draft), чтобы fingerprint разошёлся
  await api("PUT", `/api/sessions/${SID}`, {
    title: sess.title, roles: sess.roles || [], start_role: sess.start_role,
    notes: sess.notes || [], notes_by_element: sess.notes_by_element || {},
    interview: sess.interview || {}, nodes: [{ id: "n1", name: "N1", role: "r" }, { id: "n2", name: "N2", role: "r" }],
    edges: [{ from: "n1", to: "n2" }], questions: sess.questions || [],
    mermaid: "", mermaid_simple: "", mermaid_lanes: "",
    base_diagram_state_version: await getRev(SID),
  });
  const revAfterPut = await getRev(SID);
  const g = await api("GET", `/api/sessions/${SID}/bpmn?raw=1`);
  const revAfterGet = await getRev(SID);
  const regenerated = !g.text.includes("audit:") && g.text.includes("N1");
  record("S3.3", "GET /bpmn с побочной записью (regenerate+persist) — rev меняется на GET?",
    revAfterGet !== revAfterPut ? "ФАКТ" : "OK",
    `rev put=${revAfterPut} get=${revAfterGet} regenerated=${regenerated} status=${g.status}`,
    revAfterGet !== revAfterPut ? "серьёзная" : "");
  // вернуть XML супа
  await putBpmn(SID, xml, { base: await getRev(SID), action: "manual_save" });
}

const t0 = Date.now();
log("старт API-аудита, sandbox", SID);
await s4_rev_series();
await s4_cas();
await s1_race_bpmn();
await s1_race_mixed();
await s4_versions();
await s4_version_race();
await s3_cache();
await s2_dups();
await s3_model_vs_xml();
await s3_get_side_effect();
log(`готово за ${((Date.now() - t0) / 1000).toFixed(0)}s`);
fs.writeFileSync("/tmp/audit_api_results.json", JSON.stringify(OUT, null, 2));
console.log(JSON.stringify(OUT, null, 2));
