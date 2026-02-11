import { useEffect, useMemo, useState } from "react";
import { uid } from "../../lib/ids";
import { ensureDraftShape, readDraft, writeDraft } from "../../lib/draft";
import * as api from "../../lib/api";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

function draftRoles(draft) {
  const roles = Array.isArray(draft?.roles) ? draft.roles : [];
  return roles.filter((r) => r && typeof r.role_id === "string");
}

function safeNodes(draft) {
  const arr = Array.isArray(draft?.nodes) ? draft.nodes : [];
  return arr.filter((n) => n && (typeof n.id === "string" || typeof n.node_id === "string"));
}

function safeEdges(draft) {
  const arr = Array.isArray(draft?.edges) ? draft.edges : [];
  return arr.filter((e) => e && (typeof e.id === "string" || typeof e.edge_id === "string"));
}

function nodeIdOf(n) {
  return (typeof n?.node_id === "string" && n.node_id) || (typeof n?.id === "string" && n.id) || "";
}

async function saveSessionViaApi(sessionId, payload) {
  const candidates = [
    api.apiSaveSession,
    api.saveSession,
    api.apiUpdateSession,
    api.updateSession,
    api.patchSession,
    api.putSession,
  ].filter((fn) => typeof fn === "function");

  if (candidates.length > 0) {
    try {
      const r = await candidates[0](sessionId, payload);
      if (r && typeof r.ok === "boolean") return r;
      return { ok: true, статус: 200, method: "api" };
    } catch {
      // fall through to fetch
    }
  }

  // Fallback: direct fetch (PATCH -> PUT on 405)
  const id = encodeURIComponent(String(sessionId || ""));
  const url = `/api/sessions/${id}`;

  async function send(method) {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });
    if (res.ok) return { ok: true, статус: res.status, method };
    return { ok: false, статус: res.status, method };
  }

  try {
    const r1 = await send("PATCH");
    if (r1.ok) return r1;
    if (r1.status === 405) {
      const r2 = await send("PUT");
      return r2;
    }
    return r1;
  } catch {
    return { ok: false, статус: 0, method: "PATCH" };
  }
}

export default function GraphEditorOverlay({ sessionId }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => ensureDraftShape(readDraft()));
  const [status, setStatus] = useState("");

  const roles = useMemo(() => draftRoles(draft), [draft]);
  const nodes = useMemo(() => safeNodes(draft), [draft]);
  const edges = useMemo(() => safeEdges(draft), [draft]);

  const [nodeType, setNodeType] = useState("step");
  const [nodeLabel, setNodeLabel] = useState("");
  const [nodeActor, setNodeActor] = useState("");

  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");

  useEffect(() => {
    const onUpdate = () => setDraft(ensureDraftShape(readDraft()));
    window.addEventListener("fpc:draft-updated", onUpdate);
    return () => window.removeEventListener("fpc:draft-updated", onUpdate);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraft(ensureDraftShape(readDraft()));
  }, [open]);

  useEffect(() => {
    if (nodeActor) return;
    const sr = typeof draft?.start_role === "string" ? draft.start_role : "";
    if (sr) setNodeActor(sr);
  }, [draft, nodeActor]);

  async function persist(next) {
    writeDraft(next);
    window.dispatchEvent(new Event("fpc:draft-updated"));

    if (!sessionId || isLocalSessionId(sessionId)) {
      setStatus("local: сохранено только в браузере");
      return;
    }

    setStatus("saving…");
    const r = await saveSessionViaApi(sessionId, next);
    if (r.ok) setStatus(`saved (${r.method || "api"})`);
    else setStatus("save failed (API)");
    window.dispatchEvent(new Event("fpc:graph-saved"));
  }

  async function addNode() {
    const label = nodeLabel.trim();
    if (!label) return;

    const id = uid("n");
    const role = nodeActor || "";

    const node = {
      id,
      node_id: id,
      type: nodeType,
      label,
      actor_role: role || undefined,
      recipient_role: undefined,
    };

    const next = {
      ...draft,
      session_id: draft?.session_id || sessionId || "",
      nodes: [...nodes, node],
      edges: edges,
    };

    setNodeLabel("");
    if (!edgeFrom) setEdgeFrom(id);
    await persist(next);
  }

  async function addEdge() {
    if (!edgeFrom || !edgeTo || edgeFrom === edgeTo) return;

    const id = uid("e");
    const edge = {
      id,
      edge_id: id,
      from: edgeFrom,
      to: edgeTo,
      source: edgeFrom,
      target: edgeTo,
      source_id: edgeFrom,
      target_id: edgeTo,
      type: "sequence",
    };

    const next = {
      ...draft,
      session_id: draft?.session_id || sessionId || "",
      nodes: nodes,
      edges: [...edges, edge],
    };

    await persist(next);
  }

  async function clearGraph() {
    const next = {
      ...draft,
      session_id: draft?.session_id || sessionId || "",
      nodes: [],
      edges: [],
    };
    setEdgeFrom("");
    setEdgeTo("");
    await persist(next);
  }

  if (!open) {
    return (
      <div style={{ position: "absolute", right: 12, top: 12, zIndex: 30 }}>
        <button className="primaryBtn" onClick={() => setOpen(true)} style={{ padding: "6px 10px" }}>
          Graph
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", right: 12, top: 12, zIndex: 30, width: 360 }}>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ fontWeight: 900 }}>Редактор графа</div>
          <button className="ghostBtn" onClick={() => setOpen(false)} title="Close">
            ✕
          </button>
        </div>

        <div className="small muted" style={{ marginTop: 6 }}>
          nodes: <b>{nodes.length}</b> · edges: <b>{edges.length}</b>
        </div>

        <div className="hr" />

        <div style={{ fontWeight: 900, marginBottom: 6 }}>Добавить шаг</div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, alignItems: "center" }}>
            <div className="small muted">type</div>
            <select value={nodeType} onChange={(e) => setNodeType(e.target.value)} className="input">
              <option value="step">Шаг</option>
              <option value="decision">Решение</option>
              <option value="fork">Развилка</option>
              <option value="join">Слияние</option>
              <option value="end">Финиш</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, alignItems: "center" }}>
            <div className="small muted">actor_role</div>
            <select value={nodeActor} onChange={(e) => setNodeActor(e.target.value)} className="input">
              <option value="">—</option>
              {roles.map((r) => (
                <option key={r.role_id} value={r.role_id}>
                  {r.label || r.role_id}
                </option>
              ))}
            </select>
          </div>

          <input
            className="input"
            value={nodeLabel}
            onChange={(e) => setNodeLabel(e.target.value)}
            placeholder="название (например: Подготовка ингредиентов)"
          />

          <button className="primaryBtn" onClick={addNode} disabled={!nodeLabel.trim()}>
            + Добавить шаг
          </button>
        </div>

        <div className="hr" />

        <div style={{ fontWeight: 900, marginBottom: 6 }}>Добавить связь</div>
        <div style={{ display: "grid", gap: 8 }}>
          <select value={edgeFrom} onChange={(e) => setEdgeFrom(e.target.value)} className="input">
            <option value="">от…</option>
            {nodes.map((n) => (
              <option key={nodeIdOf(n)} value={nodeIdOf(n)}>
                {n.label || nodeIdOf(n)}
              </option>
            ))}
          </select>

          <select value={edgeTo} onChange={(e) => setEdgeTo(e.target.value)} className="input">
            <option value="">в…</option>
            {nodes.map((n) => (
              <option key={nodeIdOf(n)} value={nodeIdOf(n)}>
                {n.label || nodeIdOf(n)}
              </option>
            ))}
          </select>

          <button className="primaryBtn" onClick={addEdge} disabled={!edgeFrom || !edgeTo || edgeFrom === edgeTo}>
            + Добавить связь
          </button>
        </div>

        <div className="hr" />

        <div style={{ display: "flex", gap: 10 }}>
          <button className="dangerBtn" onClick={clearGraph}>
            Очистить граф
          </button>
          <button className="ghostBtn" onClick={() => window.dispatchEvent(new Event("fpc:graph-saved"))}>
            Обновить BPMN
          </button>
        </div>

        <div className="small muted" style={{ marginTop: 10 }}>
          статус: <b>{status || "—"}</b>
        </div>

        {sessionId && isLocalSessionId(sessionId) ? (
          <div className="small muted" style={{ marginTop: 8 }}>
            Сейчас <b>local_*</b> — BPMN берётся из mock. Для реального workflow создай сессию через <b>+ New (API)</b>.
          </div>
        ) : null}
      </div>
    </div>
  );
}
