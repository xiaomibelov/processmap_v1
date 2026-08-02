#!/usr/bin/env node
// T1: выгрузка error-events телеметрии stage за 14 дней + частотная карта.
// Не код продукта — инструмент диагностики (docs/telemetry/).
// Usage: BASE_URL=https://stage.processmap.ru node docs/telemetry/fetch_error_events.mjs
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "https://stage.processmap.ru";
const EMAIL = process.env.W4_EMAIL || "technologist-demo@local";
const PASS = process.env.W4_PASS || "technologist-demo";
const DAYS = Number(process.env.DAYS || 60);
const PAGE = 500;

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  if (!r.ok) throw new Error(`login ${r.status}`);
  return (await r.json()).access_token;
}

async function fetchAll(token) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - DAYS * 86400;
  const items = [];
  const seen = new Set();
  // offset-пагинация эндпоинта нестабильна (проверено: offset-обход теряет события) —
  // идём суточными окнами occurred_from/to, внутри окна offset.
  for (let w = from; w < to; w += 86400) {
    for (let offset = 0; ; offset += PAGE) {
      const u = `${BASE}/api/notifications/error_events?occurred_from=${w}&occurred_to=${w + 86399}&limit=${PAGE}&offset=${offset}&order=asc`;
      const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`list ${r.status} @${w}/${offset}`);
      const d = await r.json();
      const batch = d.items || [];
      for (const e of batch) { if (!seen.has(e.id)) { seen.add(e.id); items.push(e); } }
      if (batch.length < PAGE) break;
    }
  }
  items.sort((a, b) => a.occurred_at - b.occurred_at);
  return { from, to, items };
}

const ep = (e) => e.context_json?.endpoint || e.context_json?.url || e.route || "(no-route)";
const status = (e) => e.context_json?.status ?? "";

const { from, to, items } = await fetchAll(await login());
writeFileSync(new URL("./error_events_raw.json", import.meta.url), JSON.stringify({ from, to, items }, null, 1));

// --- T1 агрегация: event_type × source × route(endpoint) ---
const agg = new Map();
for (const e of items) {
  const key = `${e.event_type}||${e.source}||${ep(e)}`;
  if (!agg.has(key)) agg.set(key, { event_type: e.event_type, source: e.source, endpoint: ep(e), count: 0, sessions: new Set(), users: new Set(), statuses: new Map(), messages: new Map() });
  const a = agg.get(key);
  a.count++;
  if (e.session_id) a.sessions.add(e.session_id);
  if (e.user_id) a.users.add(e.user_id);
  const st = String(status(e)); if (st) a.statuses.set(st, (a.statuses.get(st) || 0) + 1);
  const m = String(e.message || "").slice(0, 90); a.messages.set(m, (a.messages.get(m) || 0) + 1);
}
const top = [...agg.values()]
  .map((a) => ({
    ...a,
    sessions: a.sessions.size, users: a.users.size,
    statuses: Object.fromEntries([...a.statuses.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5)),
    top_messages: Object.fromEntries([...a.messages.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3)),
  }))
  .sort((a, b) => b.count - a.count);

// --- известные подозреваемые ---
const sus = {
  auth_refresh: items.filter((e) => ep(e).includes("/api/auth/refresh")),
  save_conflicts: items.filter((e) => /\/bpmn|\/sessions/.test(ep(e)) && [409, 423, 500].includes(Number(status(e)))),
  version_create: items.filter((e) => /version/i.test(ep(e)) || /version/i.test(String(e.message))),
  presence: items.filter((e) => /presence/i.test(ep(e))),
  telemetry_self: items.filter((e) => /telemetry|error.events|error_events/i.test(ep(e))),
  domain_invariant: items.filter((e) => e.event_type === "domain_invariant_violation"),
  net_err: items.filter((e) => /net::ERR|Failed to fetch|NetworkError|aborted/i.test(String(e.message) + JSON.stringify(e.context_json || {}))),
};
const suspectSummary = Object.fromEntries(Object.entries(sus).map(([k, arr]) => [k, {
  count: arr.length,
  sessions: new Set(arr.map((e) => e.session_id).filter(Boolean)).size,
  users: new Set(arr.map((e) => e.user_id).filter(Boolean)).size,
  statuses: [...new Set(arr.map((e) => status(e)).filter((s) => s !== ""))].join(","),
  sample: arr.slice(0, 2).map((e) => ({ t: e.occurred_at, ep: ep(e), st: status(e), msg: String(e.message || "").slice(0, 80) })),
}]));

// подневая динамика для T3
const byDay = new Map();
for (const e of items) {
  const day = new Date(e.occurred_at * 1000).toISOString().slice(0, 10);
  const key = `${day}||${e.event_type}`;
  byDay.set(key, (byDay.get(key) || 0) + 1);
}

const out = { window: { from, to, days: DAYS }, total: items.length, top, suspects: suspectSummary, by_day: Object.fromEntries([...byDay.entries()].sort()) };
writeFileSync(new URL("./aggregation.json", import.meta.url), JSON.stringify(out, null, 1));

console.log(`[t1] window ${new Date(from * 1000).toISOString()} .. ${new Date(to * 1000).toISOString()}, events=${items.length}`);
console.log("[t1] TOP-15:");
for (const t of top.slice(0, 15)) console.log(`  ${String(t.count).padStart(5)}  ${t.event_type} | ${t.source} | ${t.endpoint.slice(0, 70)} | sess=${t.sessions} users=${t.users} st=${JSON.stringify(t.statuses)}`);
console.log("[t1] suspects:", JSON.stringify(Object.fromEntries(Object.entries(suspectSummary).map(([k, v]) => [k, { count: v.count, sessions: v.sessions, users: v.users, statuses: v.statuses }])), null, 1));
