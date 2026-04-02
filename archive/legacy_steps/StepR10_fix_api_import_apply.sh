#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="fix/frontend-r10-api-import-v1"
TAG_START="cp/foodproc_frontend_r10_api_import_fix_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r10_api_import_fix_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r10_api_import_fix_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R10 api import fix start (${TS})" >/dev/null 2>&1 || true
echo "$TAG_START"

echo
echo "== git (before) =="
git status -sb || true
git show -s --format='%ci %h %d %s' || true

echo
echo "== branch =="
git switch -c "$BR" >/dev/null 2>&1 || git switch "$BR" >/dev/null
git status -sb || true

echo
echo "== guard: frontend-only (stash backend changes if any) =="
if git status --porcelain | awk '{print $2}' | grep -q '^backend/'; then
  echo "backend changes detected -> stashing only backend/"
  git stash push -u -m "WIP backend (auto-stash before frontend api import fix) ${TS}" -- backend >/dev/null 2>&1 || true
else
  echo "no backend changes"
fi

TARGET="frontend/src/components/process/GraphEditorOverlay.jsx"
if [ ! -f "$TARGET" ]; then
  echo "BLOCKER: missing $TARGET"
  false
fi

echo
echo "== patch GraphEditorOverlay.jsx: stop importing missing named export =="
cat > "$TARGET" <<'EOF'
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
      return { ok: true, status: 200, method: "api" };
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
    if (res.ok) return { ok: true, status: res.status, method };
    return { ok: false, status: res.status, method };
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
    return { ok: false, status: 0, method: "PATCH" };
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
          <div style={{ fontWeight: 900 }}>Graph editor</div>
          <button className="ghostBtn" onClick={() => setOpen(false)} title="Close">
            ✕
          </button>
        </div>

        <div className="small muted" style={{ marginTop: 6 }}>
          nodes: <b>{nodes.length}</b> · edges: <b>{edges.length}</b>
        </div>

        <div className="hr" />

        <div style={{ fontWeight: 900, marginBottom: 6 }}>Add node</div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, alignItems: "center" }}>
            <div className="small muted">type</div>
            <select value={nodeType} onChange={(e) => setNodeType(e.target.value)} className="input">
              <option value="step">step</option>
              <option value="decision">decision</option>
              <option value="fork">fork</option>
              <option value="join">join</option>
              <option value="end">end</option>
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
            placeholder="label (например: Подготовка ингредиентов)"
          />

          <button className="primaryBtn" onClick={addNode} disabled={!nodeLabel.trim()}>
            + Add node
          </button>
        </div>

        <div className="hr" />

        <div style={{ fontWeight: 900, marginBottom: 6 }}>Add edge</div>
        <div style={{ display: "grid", gap: 8 }}>
          <select value={edgeFrom} onChange={(e) => setEdgeFrom(e.target.value)} className="input">
            <option value="">from…</option>
            {nodes.map((n) => (
              <option key={nodeIdOf(n)} value={nodeIdOf(n)}>
                {n.label || nodeIdOf(n)}
              </option>
            ))}
          </select>

          <select value={edgeTo} onChange={(e) => setEdgeTo(e.target.value)} className="input">
            <option value="">to…</option>
            {nodes.map((n) => (
              <option key={nodeIdOf(n)} value={nodeIdOf(n)}>
                {n.label || nodeIdOf(n)}
              </option>
            ))}
          </select>

          <button className="primaryBtn" onClick={addEdge} disabled={!edgeFrom || !edgeTo || edgeFrom === edgeTo}>
            + Add edge
          </button>
        </div>

        <div className="hr" />

        <div style={{ display: "flex", gap: 10 }}>
          <button className="dangerBtn" onClick={clearGraph}>
            Clear graph
          </button>
          <button className="ghostBtn" onClick={() => window.dispatchEvent(new Event("fpc:graph-saved"))}>
            Reload BPMN
          </button>
        </div>

        <div className="small muted" style={{ marginTop: 10 }}>
          status: <b>{status || "—"}</b>
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
EOF

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== diff stat =="
git diff --stat || true

echo
echo "== commit (frontend only) =="
git add -A frontend
git status -sb || true
git commit -m "fix(frontend): avoid missing named export apiSaveSession (use api namespace + fetch fallback)" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R10 api import fix done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend -x "frontend/node_modules/*" -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
