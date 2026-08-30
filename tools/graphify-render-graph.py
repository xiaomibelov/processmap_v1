#!/usr/bin/env python3
"""Render graphify graph.html with readable communities, layout and node info.

This script reads `graphify-out/graph.json` and `.graphify_analysis.json`,
assigns hub-based community labels, builds an aggregated community meta-graph
when the original graph is too large, and emits an improved `graph.html` with:

- community coloring and a populated COMMUNITIES sidebar;
- tuned force-directed layout that keeps isolated nodes grouped;
- labels only on the top communities (by size/degree) to avoid overlap;
- click-to-inspect NODE INFO panel (id, label, community, degree, neighbors).

It does not re-extract the graph and does not modify product runtime code.
"""
from __future__ import annotations

import argparse
import html as _html
import json
import math
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import networkx as nx


def _label_communities_by_hub(
    G: nx.Graph, communities: dict[int, list[str]]
) -> dict[int, str]:
    """Deterministic hub-based community labels (mirrors graphify.cluster)."""
    labels: dict[int, str] = {}
    for cid, members in communities.items():
        present = [n for n in members if n in G]
        if not present:
            labels[cid] = f"Community {cid}"
            continue
        hub = min(present, key=lambda n: (-G.degree(n), str(n)))
        name = str(G.nodes[hub].get("label") or hub).strip()
        if name.endswith("()"):
            name = name[:-2]
        labels[cid] = name or f"Community {cid}"
    return labels


COMMUNITY_COLORS = [
    "#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F",
    "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC",
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
]


def _sanitize_label(label: Any) -> str:
    s = str(label) if label is not None else ""
    # Strip null bytes and very long labels.
    s = s.replace("\x00", "")[:120]
    return s


def _load_graph_and_communities(graph_dir: Path) -> tuple[nx.Graph, dict[int, list[str]], dict[str, Any]]:
    graph_path = graph_dir / "graph.json"
    analysis_path = graph_dir / ".graphify_analysis.json"

    if not graph_path.exists():
        raise FileNotFoundError(f"graph.json not found at {graph_path}")
    if not analysis_path.exists():
        raise FileNotFoundError(f".graphify_analysis.json not found at {analysis_path}")

    data = json.loads(graph_path.read_text(encoding="utf-8"))
    G = nx.node_link_graph(data, edges="links")

    analysis = json.loads(analysis_path.read_text(encoding="utf-8"))
    communities: dict[int, list[str]] = {}
    for cid_raw, members in analysis.get("communities", {}).items():
        communities[int(cid_raw)] = members

    return G, communities, analysis


def _build_meta_graph(
    G: nx.Graph, communities: dict[int, list[str]]
) -> tuple[nx.Graph, dict[int, int], dict[int, str], dict[int, int]]:
    """Build aggregate community meta-graph and hub-based labels."""
    labels = _label_communities_by_hub(G, communities)

    node_to_community: dict[str, int] = {}
    for cid, members in communities.items():
        for nid in members:
            node_to_community[nid] = cid

    meta = nx.Graph()
    member_counts: dict[int, int] = {}
    for cid, members in communities.items():
        meta.add_node(str(cid), label=_sanitize_label(labels.get(cid, f"Community {cid}")))
        member_counts[cid] = len(members)

    edge_counts: Counter[tuple[int, int]] = Counter()
    for u, v in G.edges():
        cu = node_to_community.get(u)
        cv = node_to_community.get(v)
        if cu is not None and cv is not None and cu != cv:
            edge_counts[(min(cu, cv), max(cu, cv))] += 1

    for (cu, cv), weight in edge_counts.items():
        meta.add_edge(str(cu), str(cv), weight=weight, relation=f"{weight} cross-community edges", confidence="AGGREGATED")

    return meta, member_counts, labels, node_to_community


def _palette_for(cid: int) -> str:
    return COMMUNITY_COLORS[cid % len(COMMUNITY_COLORS)]


def _html_escape(s: str) -> str:
    return _html.escape(s)


def _js_safe(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def _layout_positions_for_isolated(
    isolated_ids: list[str], center_x: float = 250.0, center_y: float = 250.0, spread: float = 180.0
) -> dict[str, dict[str, float]]:
    """Place isolated nodes in a tight cloud so they do not fly off-screen."""
    positions: dict[str, dict[str, float]] = {}
    n = len(isolated_ids)
    if n == 0:
        return positions
    # Pack into a small square cloud in the lower-right; deterministic jitter.
    golden = (1 + 5 ** 0.5) / 2
    for i, nid in enumerate(isolated_ids):
        # Fibonacci lattice in 2D mapped to a square-ish cloud.
        r = spread * math.sqrt(i / max(n, 1))
        theta = 2 * math.pi * i * golden
        positions[nid] = {
            "x": center_x + r * math.cos(theta),
            "y": center_y + r * math.sin(theta),
        }
    return positions


def _render_aggregate_html(
    meta: nx.Graph,
    member_counts: dict[int, int],
    labels: dict[int, str],
    output_path: Path,
    max_labels: int = 60,
) -> None:
    degree = dict(meta.degree(weight="weight"))
    max_deg = max(degree.values(), default=1) or 1
    max_mc = max(member_counts.values(), default=1) or 1

    sorted_by_size = sorted(member_counts.items(), key=lambda kv: -kv[1])
    top_cids = {cid for cid, _ in sorted_by_size[:max_labels]}
    # Also label nodes with meta-degree above threshold.
    top_degree_cids = {nid for nid, d in degree.items() if d >= max_deg * 0.12}
    labeled_cids = top_cids | top_degree_cids

    vis_nodes: list[dict[str, Any]] = []
    fixed_positions: dict[str, dict[str, float]] = {}
    isolated_ids: list[str] = []

    for node_id in meta.nodes():
        cid = int(node_id)
        color = _palette_for(cid)
        label_text = _sanitize_label(labels.get(cid, f"Community {cid}"))
        deg = degree.get(node_id, 0)
        mc = member_counts.get(cid, 1)
        # Keep nodes small so communities don't stack on top of each other.
        size = 6 + 18 * (mc / max_mc)
        show_label = cid in labeled_cids

        category = "isolated" if deg == 0 else "core"
        node = {
            "id": node_id,
            "label": label_text if show_label else "",
            "title": _html_escape(label_text),
            "color": {
                "background": color,
                "border": color,
                "highlight": {"background": "#ffffff", "border": color},
            },
            "size": round(size, 1),
            "font": {"size": 11, "color": "#ffffff"},
            "community": cid,
            "community_name": label_text,
            "member_count": mc,
            "degree": deg,
            "category": category,
        }

        if deg == 0:
            isolated_ids.append(node_id)
            node["mass"] = 1
        else:
            node["mass"] = 1 + 2 * (deg / max_deg)

        vis_nodes.append(node)

    # Pin isolated nodes to a loose cloud so they don't drift to the corners.
    start_positions = _layout_positions_for_isolated(isolated_ids, center_x=0.0, center_y=0.0, spread=500.0)
    for node in vis_nodes:
        if node["id"] in start_positions:
            node["fixed"] = True
            node["x"] = start_positions[node["id"]]["x"]
            node["y"] = start_positions[node["id"]]["y"]

    vis_edges: list[dict[str, Any]] = []
    for u, v, data in meta.edges(data=True):
        weight = data.get("weight", 1)
        vis_edges.append({
            "from": u,
            "to": v,
            "label": "",
            "title": _html_escape(data.get("relation", f"{weight} cross-community edges")),
            "dashes": True,
            "width": max(1, min(3, math.log(weight + 1))),
            "color": {"opacity": 0.25},
            "confidence": "AGGREGATED",
        })

    core_count = sum(1 for n in vis_nodes if n["category"] == "core")
    isolated_count = sum(1 for n in vis_nodes if n["category"] == "isolated")

    legend_data = []
    for cid, _ in sorted_by_size:
        color = _palette_for(cid)
        deg = degree.get(str(cid), 0)
        legend_data.append({
            "cid": cid,
            "color": color,
            "label": _html_escape(_sanitize_label(labels.get(cid, f"Community {cid}"))),
            "count": member_counts.get(cid, 0),
            "category": "isolated" if deg == 0 else "core",
        })

    nodes_json = _js_safe(vis_nodes)
    edges_json = _js_safe(vis_edges)
    legend_json = _js_safe(legend_data)
    stats = (
        f"{meta.number_of_nodes()} community nodes &middot; "
        f"{meta.number_of_edges()} cross-community edges &middot; "
        f"{core_count} core &middot; {isolated_count} isolated"
    )

    html = _HTML_TEMPLATE.format(
        title=_html_escape(_html_document_title(output_path)),
        stats=stats,
        nodes_json=nodes_json,
        edges_json=edges_json,
        legend_json=legend_json,
    )
    output_path.write_text(html, encoding="utf-8")


def _html_document_title(output_path: Path) -> str:
    raw = str(output_path).replace("\\", "/")
    for marker in ("graphify-out", "graph.html"):
        idx = raw.find(marker)
        if idx != -1:
            return raw[idx:]
    return output_path.name


_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>graphify - {title}</title>
<script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js"
        integrity="sha384-Ux6phic9PEHJ38YtrijhkzyJ8yQlH8i/+buBR8s3mAZOJrP1gwyvAcIYl3GWtpX1"
        crossorigin="anonymous"></script>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: #0f0f1a; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; display: flex; height: 100vh; overflow: hidden; }}
  #graph {{ flex: 1; }}
  #sidebar {{ width: 300px; background: #1a1a2e; border-left: 1px solid #2a2a4e; display: flex; flex-direction: column; overflow: hidden; }}
  #search-wrap {{ padding: 12px; border-bottom: 1px solid #2a2a4e; }}
  #search {{ width: 100%; background: #0f0f1a; border: 1px solid #3a3a5e; color: #e0e0e0; padding: 7px 10px; border-radius: 6px; font-size: 13px; outline: none; }}
  #search:focus {{ border-color: #4E79A7; }}
  #search-results {{ max-height: 140px; overflow-y: auto; padding: 4px 12px; border-bottom: 1px solid #2a2a4e; display: none; }}
  .search-item {{ padding: 4px 6px; cursor: pointer; border-radius: 4px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
  .search-item:hover {{ background: #2a2a4e; }}
  #info-panel {{ padding: 14px; border-bottom: 1px solid #2a2a4e; min-height: 160px; }}
  #info-panel h3 {{ font-size: 13px; color: #aaa; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }}
  #info-content {{ font-size: 13px; color: #ccc; line-height: 1.6; }}
  #info-content .field {{ margin-bottom: 5px; }}
  #info-content .field b {{ color: #e0e0e0; }}
  #info-content .empty {{ color: #555; font-style: italic; }}
  .neighbor-link {{ display: block; padding: 2px 6px; margin: 2px 0; border-radius: 3px; cursor: pointer; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 3px solid #333; }}
  .neighbor-link:hover {{ background: #2a2a4e; }}
  #neighbors-list {{ max-height: 160px; overflow-y: auto; margin-top: 4px; }}
  #legend-wrap {{ flex: 1; overflow-y: auto; padding: 12px; }}
  #legend-wrap h3 {{ font-size: 13px; color: #aaa; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em; }}
  .legend-item {{ display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; border-radius: 4px; font-size: 12px; }}
  .legend-item:hover {{ background: #2a2a4e; padding-left: 4px; }}
  .legend-item.dimmed {{ opacity: 0.35; }}
  .legend-dot {{ width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }}
  .legend-label {{ flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
  .legend-count {{ color: #666; font-size: 11px; }}
  #stats {{ padding: 10px 14px; border-top: 1px solid #2a2a4e; font-size: 11px; color: #555; }}
  #legend-controls {{ display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 4px 0; flex-wrap: wrap; }}
  #legend-controls label {{ display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; color: #aaa; user-select: none; }}
  #legend-controls label:hover {{ color: #e0e0e0; }}
  .cat-filter {{ background: #0f0f1a; border: 1px solid #3a3a5e; color: #aaa; padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; }}
  .cat-filter:hover {{ border-color: #4E79A7; color: #e0e0e0; }}
  .cat-filter.active {{ background: #4E79A7; border-color: #4E79A7; color: #fff; }}
  .legend-item.isolated {{ opacity: 0.75; }}
  .legend-cb, #select-all-cb {{ appearance: none; -webkit-appearance: none; width: 14px; height: 14px; border: 1.5px solid #3a3a5e; border-radius: 3px; background: #0f0f1a; cursor: pointer; position: relative; flex-shrink: 0; }}
  .legend-cb:checked, #select-all-cb:checked {{ background: #4E79A7; border-color: #4E79A7; }}
  .legend-cb:checked::after, #select-all-cb:checked::after {{ content: ''; position: absolute; left: 3.5px; top: 1px; width: 4px; height: 7px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }}
  #select-all-cb:indeterminate {{ background: #4E79A7; border-color: #4E79A7; }}
  #select-all-cb:indeterminate::after {{ content: ''; position: absolute; left: 2px; top: 5px; width: 8px; height: 2px; background: #fff; border: none; transform: none; }}
</style>
</head>
<body>
<div id="graph"></div>
<div id="sidebar">
  <div id="search-wrap">
    <input id="search" type="text" placeholder="Search communities..." autocomplete="off">
    <div id="search-results"></div>
  </div>
  <div id="info-panel">
    <h3>Node Info</h3>
    <div id="info-content"><span class="empty">Click a node to inspect it</span></div>
  </div>
  <div id="legend-wrap">
    <h3>Communities</h3>
    <div id="legend-controls">
      <label><input type="checkbox" id="select-all-cb" checked onchange="toggleAllCommunities(!this.checked)">Select All</label>
      <button class="cat-filter active" data-cat="all" onclick="filterCategory('all')">All</button>
      <button class="cat-filter" data-cat="core" onclick="filterCategory('core')">Core</button>
      <button class="cat-filter" data-cat="isolated" onclick="filterCategory('isolated')">Isolated</button>
    </div>
    <div id="legend"></div>
  </div>
  <div id="stats">{stats}</div>
</div>
<script>
const RAW_NODES = {nodes_json};
const RAW_EDGES = {edges_json};
const LEGEND = {legend_json};

function esc(s) {{
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}}

const nodesDS = new vis.DataSet(RAW_NODES.map(n => ({{
  id: n.id, label: n.label, color: n.color, size: n.size,
  font: n.font, title: n.title,
  _community: n.community, _community_name: n.community_name,
  _member_count: n.member_count, _degree: n.degree,
  _category: n.category,
}})));

const edgesDS = new vis.DataSet(RAW_EDGES.map((e, i) => ({{
  id: i, from: e.from, to: e.to,
  label: e.label,
  title: e.title,
  dashes: e.dashes,
  width: e.width,
  color: e.color,
}})));

const container = document.getElementById('graph');
const network = new vis.Network(container, {{ nodes: nodesDS, edges: edgesDS }}, {{
  physics: {{
    enabled: true,
    solver: 'forceAtlas2Based',
    forceAtlas2Based: {{
      gravitationalConstant: -180,
      centralGravity: 0.005,
      springLength: 220,
      springConstant: 0.015,
      damping: 0.6,
      avoidOverlap: 0.85,
    }},
    stabilization: {{ iterations: 600, updateInterval: 25, fit: true }},
  }},
  interaction: {{
    hover: true,
    tooltipDelay: 100,
    hideEdgesOnDrag: true,
    navigationButtons: true,
    keyboard: false,
  }},
  nodes: {{ shape: 'dot', borderWidth: 1.5, scaling: {{ min: 8, max: 32 }} }},
  edges: {{ smooth: {{ type: 'continuous', roundness: 0.2 }}, selectionWidth: 3 }},
}});

network.once('stabilizationIterationsDone', () => {{
  network.setOptions({{ physics: {{ enabled: false }} }});
  // Fit after stabilization so isolated pinned nodes stay in view.
  network.fit({{ animation: false }});
}});

function showInfo(nodeId) {{
  const n = nodesDS.get(nodeId);
  if (!n) return;
  const neighborIds = network.getConnectedNodes(nodeId);
  const neighborItems = neighborIds.map(nid => {{
    const nb = nodesDS.get(nid);
    const color = nb ? nb.color.background : '#555';
    return `<span class="neighbor-link" style="border-left-color:${{esc(color)}}" data-nid="${{esc(nid)}}">${{esc(nb ? nb.label || nb._community_name : nid)}}</span>`;
  }}).join('');
  document.getElementById('info-content').innerHTML = `
    <div class="field"><b>${{esc(n._community_name)}}</b></div>
    <div class="field"><b>ID:</b> ${{esc(n.id)}}</div>
    <div class="field"><b>Community:</b> ${{n._community}}</div>
    <div class="field"><b>Category:</b> ${{n._category}}</div>
    <div class="field"><b>Members:</b> ${{n._member_count}}</div>
    <div class="field"><b>Degree:</b> ${{n._degree}}</div>
    ${{neighborIds.length ? `<div class="field" style="margin-top:8px;color:#aaa;font-size:11px">Neighbors (${{neighborIds.length}})</div><div id="neighbors-list">${{neighborItems}}</div>` : '<div class="field" style="margin-top:8px;color:#555;font-size:11px">No connected communities</div>'}}
  `;
}}

function focusNode(nodeId) {{
  network.focus(nodeId, {{ scale: 1.4, animation: true }});
  network.selectNodes([nodeId]);
  showInfo(nodeId);
}}

document.addEventListener('click', e => {{
  const el = e.target.closest('.neighbor-link');
  if (el && el.dataset.nid !== undefined) focusNode(el.dataset.nid);
}});

let hoveredNodeId = null;
network.on('hoverNode', params => {{ hoveredNodeId = params.node; container.style.cursor = 'pointer'; }});
network.on('blurNode', () => {{ hoveredNodeId = null; container.style.cursor = 'default'; }});
container.addEventListener('click', () => {{
  if (hoveredNodeId !== null) {{
    showInfo(hoveredNodeId);
    network.selectNodes([hoveredNodeId]);
  }}
}});
network.on('click', params => {{
  if (params.nodes.length > 0) showInfo(params.nodes[0]);
  else if (hoveredNodeId === null)
    document.getElementById('info-content').innerHTML = '<span class="empty">Click a node to inspect it</span>';
}});

const searchInput = document.getElementById('search');
const searchResults = document.getElementById('search-results');
searchInput.addEventListener('input', () => {{
  const q = searchInput.value.toLowerCase().trim();
  searchResults.innerHTML = '';
  if (!q) {{ searchResults.style.display = 'none'; return; }}
  const matches = RAW_NODES.filter(n => n.title.toLowerCase().includes(q)).slice(0, 20);
  if (!matches.length) {{ searchResults.style.display = 'none'; return; }}
  searchResults.style.display = 'block';
  matches.forEach(n => {{
    const el = document.createElement('div');
    el.className = 'search-item';
    el.textContent = n.title;
    el.style.borderLeft = `3px solid ${{n.color.background}}`;
    el.style.paddingLeft = '8px';
    el.onclick = () => {{
      network.focus(n.id, {{ scale: 1.5, animation: true }});
      network.selectNodes([n.id]);
      showInfo(n.id);
      searchResults.style.display = 'none';
      searchInput.value = '';
    }};
    searchResults.appendChild(el);
  }});
}});
document.addEventListener('click', e => {{
  if (!searchResults.contains(e.target) && e.target !== searchInput)
    searchResults.style.display = 'none';
}});

const hiddenCommunities = new Set();
let currentCategory = 'all';
const selectAllCb = document.getElementById('select-all-cb');

function updateSelectAllState() {{
  const visibleLegend = Array.from(document.querySelectorAll('.legend-item')).filter(i => i.style.display !== 'none');
  const total = visibleLegend.length;
  const hidden = visibleLegend.filter(i => i.classList.contains('dimmed')).length;
  selectAllCb.checked = hidden === 0;
  selectAllCb.indeterminate = hidden > 0 && hidden < total;
}}

function toggleAllCommunities(hide) {{
  document.querySelectorAll('.legend-item').forEach(item => {{
    if (item.style.display === 'none') return;
    hide ? item.classList.add('dimmed') : item.classList.remove('dimmed');
  }});
  document.querySelectorAll('.legend-cb').forEach(cb => {{
    const item = cb.closest('.legend-item');
    if (item && item.style.display === 'none') return;
    cb.checked = !hide;
  }});
  LEGEND.forEach(c => {{
    if (currentCategory !== 'all' && c.category !== currentCategory) return;
    if (hide) hiddenCommunities.add(c.cid); else hiddenCommunities.delete(c.cid);
  }});
  const updates = RAW_NODES.map(n => {{
    const catMatch = currentCategory === 'all' || n.category === currentCategory;
    return {{ id: n.id, hidden: hide || !catMatch }};
  }});
  nodesDS.update(updates);
  updateSelectAllState();
}}

function filterCategory(cat) {{
  currentCategory = cat;
  document.querySelectorAll('.cat-filter').forEach(btn => {{
    btn.classList.toggle('active', btn.dataset.cat === cat);
  }});
  document.querySelectorAll('.legend-item').forEach(item => {{
    const match = cat === 'all' || item.dataset.category === cat;
    item.style.display = match ? 'flex' : 'none';
  }});
  const updates = RAW_NODES.map(n => {{
    const catMatch = cat === 'all' || n.category === cat;
    const manuallyHidden = hiddenCommunities.has(n.community);
    return {{ id: n.id, hidden: !catMatch || manuallyHidden }};
  }});
  nodesDS.update(updates);
  updateSelectAllState();
}}

const legendEl = document.getElementById('legend');
LEGEND.forEach(c => {{
  const item = document.createElement('div');
  item.className = 'legend-item' + (c.category === 'isolated' ? ' isolated' : '');
  item.dataset.category = c.category;
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'legend-cb';
  cb.checked = true;
  cb.addEventListener('change', (e) => {{
    e.stopPropagation();
    if (cb.checked) {{ hiddenCommunities.delete(c.cid); item.classList.remove('dimmed'); }}
    else {{ hiddenCommunities.add(c.cid); item.classList.add('dimmed'); }}
    const updates = RAW_NODES
      .filter(n => n.community === c.cid)
      .map(n => ({{ id: n.id, hidden: !cb.checked }}));
    nodesDS.update(updates);
    updateSelectAllState();
  }});
  item.innerHTML = `<div class="legend-dot" style="background:${{c.color}}"></div>
    <span class="legend-label">${{esc(c.label)}}</span>
    <span class="legend-count">${{c.count}}</span>`;
  item.prepend(cb);
  item.onclick = (e) => {{
    if (e.target === cb) return;
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change'));
  }};
  legendEl.appendChild(item);
}});
</script>
</body>
</html>
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Render an improved graph.html from graphify's graph.json and analysis."
    )
    parser.add_argument(
        "--graph-dir",
        type=Path,
        default=Path("graphify-out"),
        help="Directory containing graph.json and .graphify_analysis.json (default: ./graphify-out)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output HTML path (default: <graph-dir>/graph.html)",
    )
    parser.add_argument(
        "--max-labels",
        type=int,
        default=25,
        help="Show labels on the top N communities by size (default: 25)",
    )
    args = parser.parse_args(argv)

    graph_dir = args.graph_dir.resolve()
    output_path = args.output.resolve() if args.output else graph_dir / "graph.html"

    G, communities, _analysis = _load_graph_and_communities(graph_dir)
    print(f"Loaded graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities")

    meta, member_counts, labels, _node_to_community = _build_meta_graph(G, communities)
    print(f"Meta-graph: {meta.number_of_nodes()} community nodes, {meta.number_of_edges()} cross-community edges")

    _render_aggregate_html(meta, member_counts, labels, output_path, max_labels=args.max_labels)
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
