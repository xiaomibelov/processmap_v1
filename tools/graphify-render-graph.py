#!/usr/bin/env python3
"""Render graphify graph.html with readable communities, semantic zones and trace scenarios.

This script reads `graphify-out/graph.json` and `.graphify_analysis.json`,
assigns hub-based community labels, classifies every node into an architectural
layer (frontend/backend/persistence/...), builds an aggregated community
meta-graph, and emits an improved `graph.html` with:

- community coloring and a populated COMMUNITIES sidebar;
- architectural LAYERS sidebar with visibility toggles;
- soft layer zone shading (convex hull / bounding box) behind nodes;
- scenario tracing with reconstructed dashed semantic links between layers;
- tuned force-directed layout that keeps isolated nodes grouped;
- labels only on the top communities (by size/degree) to avoid overlap;
- click-to-inspect NODE INFO panel (id, label, layer, community, degree,
  scenarios, semantic links, neighbors).

It does not re-extract the graph and does not modify product runtime code.
"""
from __future__ import annotations

import argparse
import fnmatch
import html as _html
import json
import math
import re
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path
from typing import Any

import networkx as nx


COMMUNITY_COLORS = [
    "#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F",
    "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC",
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
]


def _palette_for(cid: int) -> str:
    return COMMUNITY_COLORS[cid % len(COMMUNITY_COLORS)]


LAYER_DEFAULTS = {
    "frontend": {"label": "FRONTEND", "color": "#4E79A7", "visible_by_default": True, "draw_zone": True},
    "backend": {"label": "BACKEND", "color": "#59A14F", "visible_by_default": True, "draw_zone": True},
    "persistence": {"label": "STORAGE", "color": "#E15759", "visible_by_default": True, "draw_zone": True},
    "infra_tools": {"label": "INFRA & TOOLS", "color": "#F28E2B", "visible_by_default": True, "draw_zone": True},
    "docs_planning": {"label": "DOCS & PLANNING", "color": "#B07AA1", "visible_by_default": False, "draw_zone": False},
    "test": {"label": "TESTS", "color": "#76B7B2", "visible_by_default": False, "draw_zone": False},
    "unclassified": {"label": "UNCLASSIFIED", "color": "#BAB0AC", "visible_by_default": False, "draw_zone": False},
}


def _sanitize_label(label: Any) -> str:
    s = str(label) if label is not None else ""
    s = s.replace("\x00", "")[:120]
    return s


def _html_escape(s: str) -> str:
    return _html.escape(s)


def _js_safe(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


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


def _load_semantic_config(config_path: Path) -> dict[str, Any]:
    if not config_path.exists():
        raise FileNotFoundError(f"semantic config not found at {config_path}")
    return json.loads(config_path.read_text(encoding="utf-8"))


def _match_rule(node: dict[str, Any], rule: dict[str, Any]) -> float:
    """Return rule weight if node matches, else 0."""
    sf = node.get("source_file", "")
    label = node.get("label", "")
    weight = rule.get("weight", 1.0)

    if "path_prefix" in rule and sf.startswith(rule["path_prefix"]):
        return weight
    if "path_glob" in rule:
        pattern = rule["path_glob"]
        if fnmatch.fnmatch(sf, pattern) or fnmatch.fnmatch(Path(sf).name, pattern):
            return weight
    if "label_regex" in rule and re.search(rule["label_regex"], label):
        return weight
    return 0.0


def _classify_node(node: dict[str, Any], config: dict[str, Any]) -> tuple[str, float, list[tuple[str, float]]]:
    """Classify a single raw node into a layer."""
    scores: Counter[str] = Counter()
    reasons: list[tuple[str, float]] = []
    for layer in config.get("layers", []):
        sid = layer["id"]
        for rule in layer.get("rules", []):
            w = _match_rule(node, rule)
            if w:
                scores[sid] += w
                reasons.append((sid, w))
    if not scores:
        return config.get("default_layer", "unclassified"), 0.0, []
    best_sid, best_score = scores.most_common(1)[0]
    return best_sid, best_score, reasons


def _classify_all_nodes(
    G: nx.Graph, config: dict[str, Any]
) -> tuple[dict[str, str], dict[str, float], dict[str, list[tuple[str, float]]], Counter[str]]:
    """Classify every node in the raw graph."""
    node_layers: dict[str, str] = {}
    node_scores: dict[str, float] = {}
    node_reasons: dict[str, list[tuple[str, float]]] = {}
    layer_counts: Counter[str] = Counter()
    for nid, data in G.nodes(data=True):
        # data may be a dict or attrdict; normalize to plain dict
        node = dict(data)
        node["id"] = nid
        layer, score, reasons = _classify_node(node, config)
        node_layers[nid] = layer
        node_scores[nid] = score
        node_reasons[nid] = reasons
        layer_counts[layer] += 1
    return node_layers, node_scores, node_reasons, layer_counts


def _assign_community_layers(
    communities: dict[int, list[str]],
    node_layers: dict[str, str],
) -> tuple[dict[int, str], dict[int, float], dict[int, Counter[str]]]:
    """Assign a dominant layer to each community based on member votes."""
    community_layers: dict[int, str] = {}
    community_confidence: dict[int, float] = {}
    community_layer_distribution: dict[int, Counter[str]] = {}
    for cid, members in communities.items():
        votes: Counter[str] = Counter()
        for nid in members:
            votes[node_layers.get(nid, "unclassified")] += 1
        total = sum(votes.values()) or 1
        top_layer, top_count = votes.most_common(1)[0]
        community_layers[cid] = top_layer
        community_confidence[cid] = top_count / total
        community_layer_distribution[cid] = votes
    return community_layers, community_confidence, community_layer_distribution


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
) -> tuple[nx.Graph, dict[int, int], dict[int, str], dict[str, int]]:
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


def _layer_meta(lyr: str, config: dict[str, Any]) -> dict[str, Any]:
    """Return merged metadata for a layer."""
    for layer in config.get("layers", []):
        if layer["id"] == lyr:
            defaults = LAYER_DEFAULTS.get(lyr, {})
            merged = dict(defaults)
            merged.update(layer)
            return merged
    return LAYER_DEFAULTS.get(lyr, LAYER_DEFAULTS["unclassified"])


def _find_seeds(
    scenario: dict[str, Any],
    G: nx.Graph,
    node_layers: dict[str, str],
) -> dict[str, list[str]]:
    """Find seed node ids for each layer of a scenario."""
    seeds: dict[str, list[str]] = defaultdict(list)
    seed_layers = scenario.get("seeds", {})
    for layer_id, rules in seed_layers.items():
        seen = set()
        for rule in rules:
            for nid, data in G.nodes(data=True):
                if nid in seen:
                    continue
                node = dict(data)
                node["id"] = nid
                if node_layers.get(nid) != layer_id:
                    continue
                score = _match_rule(node, rule)
                if score:
                    seeds[layer_id].append(nid)
                    seen.add(nid)
    return seeds


def _bfs_to_layer(
    G: nx.Graph,
    start_ids: list[str],
    target_layer: str,
    node_layers: dict[str, str],
    node_to_community: dict[str, int],
    max_depth: int,
) -> dict[str, int]:
    """BFS from start ids until reaching nodes of target_layer."""
    found: dict[str, int] = {}
    visited: dict[str, int] = {}
    q: deque[str] = deque()
    for sid in start_ids:
        if sid not in visited:
            visited[sid] = 0
            q.append(sid)
    while q:
        cur = q.popleft()
        depth = visited[cur]
        if node_layers.get(cur) == target_layer and cur not in found:
            found[cur] = depth
        if depth >= max_depth:
            continue
        for nb in G.neighbors(cur):
            if nb not in visited:
                visited[nb] = depth + 1
                q.append(nb)
    return found


def _trace_scenario(
    scenario: dict[str, Any],
    G: nx.Graph,
    node_layers: dict[str, str],
    node_to_community: dict[str, int],
) -> dict[str, Any]:
    """Trace one scenario across layers.

    Because the AST-level graphify graph rarely contains direct edges between
    frontend and backend, the trace combines real-edge BFS with reconstructed
    semantic links between layer seeds.
    """
    max_depth = scenario.get("max_depth", 3)
    seeds_raw = _find_seeds(scenario, G, node_layers)

    # Keep only a small number of representative seeds per layer (most connected first)
    def _top_seeds(layer_id: str, n: int = 2) -> list[str]:
        candidates = seeds_raw.get(layer_id, [])
        # Prefer seeds that are connected in the raw graph
        return sorted(candidates, key=lambda nid: -G.degree(nid))[:n]

    frontend_seeds = _top_seeds("frontend", 2)
    backend_seeds = _top_seeds("backend", 2)
    persistence_seeds = _top_seeds("persistence", 2)

    # Real-edge BFS from frontend into backend, then from reached backend into persistence
    backend_reached = _bfs_to_layer(G, frontend_seeds, "backend", node_layers, node_to_community, max_depth)
    backend_reached_ids = sorted(backend_reached.keys(), key=lambda nid: -G.degree(nid))[:2]
    backend_semantic_ids = [nid for nid in backend_seeds if nid not in backend_reached][:2]

    persistence_reached = _bfs_to_layer(G, backend_reached_ids, "persistence", node_layers, node_to_community, max_depth)
    persistence_reached_ids = sorted(persistence_reached.keys(), key=lambda nid: -G.degree(nid))[:2]
    persistence_semantic_ids = [nid for nid in persistence_seeds if nid not in persistence_reached][:2]

    def _make_step(nid: str, layer: str, depth: int, semantic: bool) -> dict[str, Any]:
        return {
            "layer": layer,
            "node_id": nid,
            "node_label": _sanitize_label(G.nodes[nid].get("label", nid)),
            "community_id": node_to_community.get(nid),
            "depth": depth,
            "semantic": semantic,
        }

    steps: list[dict[str, Any]] = []
    for nid in frontend_seeds:
        steps.append(_make_step(nid, "frontend", 0, False))
    for nid in backend_reached_ids:
        steps.append(_make_step(nid, "backend", 1, False))
    for nid in backend_semantic_ids:
        steps.append(_make_step(nid, "backend", 1, True))
    for nid in persistence_reached_ids:
        steps.append(_make_step(nid, "persistence", 2, False))
    for nid in persistence_semantic_ids:
        steps.append(_make_step(nid, "persistence", 2, True))

    node_ids = set(frontend_seeds) | set(backend_reached_ids) | set(backend_semantic_ids) | set(persistence_reached_ids) | set(persistence_semantic_ids)
    community_ids: set[int] = set()
    for nid in node_ids:
        cid = node_to_community.get(nid)
        if cid is not None:
            community_ids.add(cid)

    # Build a small number of semantic edges: one representative link per layer transition.
    semantic_edges: list[dict[str, Any]] = []
    fe_repr = frontend_seeds[0] if frontend_seeds else None
    be_repr = (backend_reached_ids[0] if backend_reached_ids else backend_semantic_ids[0] if backend_semantic_ids else None)
    pe_repr = (persistence_reached_ids[0] if persistence_reached_ids else persistence_semantic_ids[0] if persistence_semantic_ids else None)

    if fe_repr and be_repr:
        fe_cid = node_to_community.get(fe_repr)
        be_cid = node_to_community.get(be_repr)
        if fe_cid is not None and be_cid is not None and not G.has_edge(fe_repr, be_repr):
            semantic_edges.append({
                "source_id": str(fe_cid),
                "target_id": str(be_cid),
                "source_layer": "frontend",
                "target_layer": "backend",
                "kind": "frontend_to_backend",
                "reconstructed": True,
                "reason": scenario.get("note", "semantic link: no graph edge frontend↔backend"),
            })

    if be_repr and pe_repr:
        be_cid = node_to_community.get(be_repr)
        pe_cid = node_to_community.get(pe_repr)
        if be_cid is not None and pe_cid is not None and not G.has_edge(be_repr, pe_repr):
            semantic_edges.append({
                "source_id": str(be_cid),
                "target_id": str(pe_cid),
                "source_layer": "backend",
                "target_layer": "persistence",
                "kind": "backend_to_persistence",
                "reconstructed": True,
                "reason": scenario.get("note", "semantic link: no graph edge backend↔persistence"),
            })

    return {
        "scenario_id": scenario["id"],
        "scenario_label": scenario.get("label", scenario["id"]),
        "seeds": {k: list(v) for k, v in seeds_raw.items()},
        "node_ids": list(node_ids),
        "community_ids": [str(c) for c in community_ids],
        "semantic_edges": semantic_edges,
        "steps": steps,
    }


def _compute_layer_zones(
    positions: dict[str, dict[str, float]],
    community_layers: dict[int, str],
    config: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    """Compute convex hull / bounding box zones per layer."""
    threshold = config.get("layer_zone_threshold", {"min_nodes": 8, "min_width": 120, "min_height": 80})
    layer_points: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for node_id, pos in positions.items():
        cid = int(node_id)
        layer = community_layers.get(cid, "unclassified")
        layer_points[layer].append((pos["x"], pos["y"]))

    zones: dict[str, dict[str, Any]] = {}
    for layer_id, pts in layer_points.items():
        meta = _layer_meta(layer_id, config)
        if not meta.get("draw_zone", True):
            continue
        if len(pts) < threshold.get("min_nodes", 8):
            continue
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        width = max_x - min_x
        height = max_y - min_y
        if width < threshold.get("min_width", 120) or height < threshold.get("min_height", 80):
            continue
        # Simple convex hull using shapely if available, else bounding box
        hull_pts = _convex_hull(pts) if len(pts) >= 3 else pts
        zones[layer_id] = {
            "layer": layer_id,
            "label": meta["label"],
            "color": meta["color"],
            "points": hull_pts,
            "bbox": {"min_x": min_x, "max_x": max_x, "min_y": min_y, "max_y": max_y, "cx": (min_x + max_x) / 2, "cy": (min_y + max_y) / 2},
            "node_count": len(pts),
        }
    return zones


def _convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Compute 2D convex hull (Graham scan / monotone chain)."""
    pts = sorted(set(points))
    if len(pts) <= 1:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def _layout_positions_for_isolated(
    isolated_ids: list[str], center_x: float = 250.0, center_y: float = 250.0, spread: float = 180.0
) -> dict[str, dict[str, float]]:
    """Place isolated nodes in a tight cloud so they do not fly off-screen."""
    positions: dict[str, dict[str, float]] = {}
    n = len(isolated_ids)
    if n == 0:
        return positions
    golden = (1 + 5 ** 0.5) / 2
    for i, nid in enumerate(isolated_ids):
        r = spread * math.sqrt(i / max(n, 1))
        theta = 2 * math.pi * i * golden
        positions[nid] = {
            "x": center_x + r * math.cos(theta),
            "y": center_y + r * math.sin(theta),
        }
    return positions


def _render_aggregate_html(
    G: nx.Graph,
    meta: nx.Graph,
    member_counts: dict[int, int],
    labels: dict[int, str],
    node_to_community: dict[str, int],
    node_layers: dict[str, str],
    node_scores: dict[str, float],
    community_layers: dict[int, str],
    community_confidence: dict[int, float],
    community_layer_distribution: dict[int, Counter[str]],
    layer_counts: Counter[str],
    traces: list[dict[str, Any]],
    config: dict[str, Any],
    output_path: Path,
    max_labels: int = 25,
) -> None:
    degree = dict(meta.degree(weight="weight"))
    max_deg = max(degree.values(), default=1) or 1
    max_mc = max(member_counts.values(), default=1) or 1

    sorted_by_size = sorted(member_counts.items(), key=lambda kv: -kv[1])
    top_cids = {cid for cid, _ in sorted_by_size[:max_labels]}
    top_degree_cids = {nid for nid, d in degree.items() if d >= max_deg * 0.12}
    labeled_cids = top_cids | top_degree_cids

    # Layer metadata
    layer_meta: dict[str, dict[str, Any]] = {}
    for layer_id in set(community_layers.values()) | set(LAYER_DEFAULTS.keys()):
        layer_meta[layer_id] = _layer_meta(layer_id, config)

    vis_nodes: list[dict[str, Any]] = []
    fixed_positions: dict[str, dict[str, float]] = {}
    isolated_ids: list[str] = []

    for node_id in meta.nodes():
        cid = int(node_id)
        layer_id = community_layers.get(cid, "unclassified")
        meta_layer = layer_meta[layer_id]
        color = meta_layer["color"]
        label_text = _sanitize_label(labels.get(cid, f"Community {cid}"))
        deg = degree.get(node_id, 0)
        mc = member_counts.get(cid, 1)
        size = 6 + 18 * (mc / max_mc)
        show_label = cid in labeled_cids
        category = "isolated" if deg == 0 else "core"

        # Gather member node labels and scenarios
        member_ids = []
        for nid, nc in node_to_community.items():
            if nc == cid:
                member_ids.append(nid)

        node_scenarios = []
        for tr in traces:
            if node_id in tr["community_ids"]:
                node_scenarios.append({"id": tr["scenario_id"], "label": tr["scenario_label"]})

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
            "layer": layer_id,
            "layer_label": meta_layer["label"],
            "layer_color": color,
            "layer_confidence": round(community_confidence.get(cid, 0.0), 2),
            "scenarios": node_scenarios,
        }

        if deg == 0:
            isolated_ids.append(node_id)
            node["mass"] = 1
        else:
            node["mass"] = 1 + 2 * (deg / max_deg)

        vis_nodes.append(node)

    start_positions = _layout_positions_for_isolated(isolated_ids, center_x=0.0, center_y=0.0, spread=500.0)
    for node in vis_nodes:
        if node["id"] in start_positions:
            node["fixed"] = True
            node["x"] = start_positions[node["id"]]["x"]
            node["y"] = start_positions[node["id"]]["y"]

    vis_edges: list[dict[str, Any]] = []
    for idx, (u, v, data) in enumerate(meta.edges(data=True)):
        weight = data.get("weight", 1)
        vis_edges.append({
            "id": f"e{idx}",
            "from": u,
            "to": v,
            "label": "",
            "title": _html_escape(data.get("relation", f"{weight} cross-community edges")),
            "dashes": True,
            "width": max(1, min(3, math.log(weight + 1))),
            "color": {"opacity": 0.25},
            "confidence": "AGGREGATED",
            "kind": "real",
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

    # Layer legend data
    layer_legend = []
    for layer_id in ["frontend", "backend", "persistence", "infra_tools", "docs_planning", "test", "unclassified"]:
        meta_layer = layer_meta.get(layer_id, LAYER_DEFAULTS.get(layer_id, LAYER_DEFAULTS["unclassified"]))
        layer_legend.append({
            "id": layer_id,
            "label": meta_layer["label"],
            "color": meta_layer["color"],
            "count": layer_counts.get(layer_id, 0),
            "visible_by_default": meta_layer.get("visible_by_default", True),
            "draw_zone": meta_layer.get("draw_zone", True),
        })

    # Semantic trace edges (community level)
    semantic_trace_edges: list[dict[str, Any]] = []
    for tr in traces:
        for e in tr.get("semantic_edges", []):
            src_layer = e["source_layer"]
            color = layer_meta.get(src_layer, LAYER_DEFAULTS["unclassified"])["color"]
            semantic_trace_edges.append({
                "id": f"sem_{tr['scenario_id']}_{e['source_id']}_{e['target_id']}",
                "from": e["source_id"],
                "to": e["target_id"],
                "color": {"color": color, "opacity": 0.85},
                "width": 2,
                "dashes": [10, 6],
                "title": _html_escape(e["reason"]),
                "scenario_id": tr["scenario_id"],
                "kind": "semantic",
            })

    # Trace steps data
    trace_data = [
        {
            "id": tr["scenario_id"],
            "label": tr["scenario_label"],
            "community_ids": tr["community_ids"],
            "steps": [
                {
                    "layer": s["layer"],
                    "node_id": s["node_id"],
                    "node_label": _sanitize_label(s["node_label"]),
                    "community_id": s["community_id"],
                    "depth": s["depth"],
                    "semantic": s.get("semantic", False),
                }
                for s in tr["steps"]
            ],
            "semantic_edges": tr["semantic_edges"],
        }
        for tr in traces
    ]

    # Initial zones will be recomputed in JS after stabilization; pass layer metadata
    zones_init = []
    for layer_id, meta_layer in layer_meta.items():
        zones_init.append({
            "layer": layer_id,
            "label": meta_layer["label"],
            "color": meta_layer["color"],
            "visible_by_default": meta_layer.get("visible_by_default", True),
            "draw_zone": meta_layer.get("draw_zone", True),
        })

    nodes_json = _js_safe(vis_nodes)
    edges_json = _js_safe(vis_edges)
    legend_json = _js_safe(legend_data)
    layer_legend_json = _js_safe(layer_legend)
    zones_json = _js_safe(zones_init)
    trace_json = _js_safe(trace_data)
    semantic_edges_json = _js_safe(semantic_trace_edges)

    raw_node_count = G.number_of_nodes()
    raw_edge_count = G.number_of_edges()

    stats = (
        f"{meta.number_of_nodes()} community nodes &middot; "
        f"{meta.number_of_edges()} cross-community edges &middot; "
        f"{core_count} core &middot; {isolated_count} isolated &middot; "
        f"{raw_node_count} raw nodes &middot; {raw_edge_count} raw edges"
    )

    html = _HTML_TEMPLATE.format(
        title=_html_escape(_html_document_title(output_path)),
        stats=stats,
        nodes_json=nodes_json,
        edges_json=edges_json,
        legend_json=legend_json,
        layer_legend_json=layer_legend_json,
        zones_json=zones_json,
        trace_json=trace_json,
        semantic_edges_json=semantic_edges_json,
    )
    output_path.write_text(html, encoding="utf-8")

    # Also emit a machine-readable nodes.json for downstream analytics/API consumers.
    # This file mirrors RAW_NODES and is guaranteed to match the rendered graph.html.
    nodes_json_path = output_path.with_name("nodes.json")
    nodes_json_path.write_text(
        json.dumps(vis_nodes, ensure_ascii=False, indent=2), encoding="utf-8"
    )


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
  #graph-wrap {{ flex: 1; position: relative; overflow: hidden; }}
  #graph {{ width: 100%; height: 100%; }}
  #zone-svg {{ position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }}
  #zone-svg .layer-zone {{ fill-opacity: 0.08; stroke-width: 1; stroke-opacity: 0.15; }}
  #zone-svg .layer-zone-label {{ font-size: 28px; font-weight: 700; fill-opacity: 0.12; text-anchor: middle; dominant-baseline: middle; pointer-events: none; }}
  #zone-svg.hidden {{ display: none; }}
  #sidebar {{ width: 320px; background: #1a1a2e; border-left: 1px solid #2a2a4e; display: flex; flex-direction: column; overflow: hidden; z-index: 2; }}
  #search-wrap {{ padding: 12px; border-bottom: 1px solid #2a2a4e; }}
  #search {{ width: 100%; background: #0f0f1a; border: 1px solid #3a3a5e; color: #e0e0e0; padding: 7px 10px; border-radius: 6px; font-size: 13px; outline: none; }}
  #search:focus {{ border-color: #4E79A7; }}
  #search-results {{ max-height: 140px; overflow-y: auto; padding: 4px 12px; border-bottom: 1px solid #2a2a4e; display: none; }}
  .search-item {{ padding: 4px 6px; cursor: pointer; border-radius: 4px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
  .search-item:hover {{ background: #2a2a4e; }}
  #info-panel {{ padding: 14px; border-bottom: 1px solid #2a2a4e; min-height: 180px; overflow-y: auto; }}
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
  .section {{ border-bottom: 1px solid #2a2a4e; padding-bottom: 10px; margin-bottom: 10px; }}
  .layer-badge {{ display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; text-transform: uppercase; color: #fff; margin-left: 6px; }}
  .scenario-link {{ display: inline-block; padding: 2px 6px; margin: 2px 4px 2px 0; border-radius: 3px; background: #2a2a4e; color: #aaa; font-size: 11px; cursor: pointer; }}
  .scenario-link:hover {{ background: #3a3a5e; color: #e0e0e0; }}
  .semantic-badge {{ font-size: 10px; color: #888; font-style: italic; }}
  #trace-panel {{ padding: 12px; border-bottom: 1px solid #2a2a4e; display: none; }}
  #trace-panel h3 {{ font-size: 13px; color: #aaa; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }}
  #trace-steps {{ max-height: 200px; overflow-y: auto; font-size: 12px; }}
  .trace-step {{ display: flex; align-items: center; gap: 6px; padding: 3px 0; }}
  .trace-step-icon {{ width: 10px; text-align: center; color: #888; }}
  .trace-step.semantic {{ color: #aaa; font-style: italic; }}
  #trace-legend {{ margin-top: 8px; padding-top: 8px; border-top: 1px solid #2a2a4e; font-size: 11px; color: #888; }}
  #trace-legend span {{ display: inline-block; vertical-align: middle; margin-right: 6px; }}
  .trace-line-real {{ display: inline-block; width: 20px; height: 2px; background: #888; vertical-align: middle; }}
  .trace-line-semantic {{ display: inline-block; width: 20px; height: 0; border-top: 2px dashed #888; vertical-align: middle; }}
  .reset-trace {{ margin-top: 8px; background: #0f0f1a; border: 1px solid #3a3a5e; color: #aaa; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; }}
  .reset-trace:hover {{ border-color: #4E79A7; color: #e0e0e0; }}
</style>
</head>
<body>
<div id="graph-wrap">
  <div id="graph"></div>
  <svg id="zone-svg" xmlns="http://www.w3.org/2000/svg"></svg>
</div>
<div id="sidebar">
  <div id="search-wrap">
    <input id="search" type="text" placeholder="Search communities..." autocomplete="off">
    <div id="search-results"></div>
  </div>
  <div id="info-panel">
    <h3>Node Info</h3>
    <div id="info-content"><span class="empty">Click a node to inspect it</span></div>
  </div>
  <div id="trace-panel">
    <h3>Trace Steps</h3>
    <div id="trace-steps"></div>
    <div id="trace-legend">
      <span class="trace-line-real"></span> real graph edge
      <br>
      <span class="trace-line-semantic"></span> semantic link (reconstructed)
    </div>
    <button class="reset-trace" onclick="resetTrace()">Reset trace</button>
  </div>
  <div id="legend-wrap">
    <div class="section">
      <h3>Communities</h3>
      <div id="legend-controls">
        <label><input type="checkbox" id="select-all-cb" checked onchange="toggleAllCommunities(!this.checked)">Select All</label>
        <button class="cat-filter active" data-cat="all" onclick="filterCategory('all')">All</button>
        <button class="cat-filter" data-cat="core" onclick="filterCategory('core')">Core</button>
        <button class="cat-filter" data-cat="isolated" onclick="filterCategory('isolated')">Isolated</button>
      </div>
      <div id="legend"></div>
    </div>
    <div class="section">
      <h3>Layers</h3>
      <div id="layer-controls" style="margin-bottom:8px;">
        <label style="font-size:11px;color:#888;cursor:pointer;"><input type="checkbox" id="zones-toggle" checked onchange="toggleZones()"> Zones on/off</label>
      </div>
      <div id="layer-legend"></div>
    </div>
  </div>
  <div id="stats">{stats}</div>
</div>
<script>
const RAW_NODES = {nodes_json};
const RAW_EDGES = {edges_json};
const LEGEND = {legend_json};
const LAYERS = {layer_legend_json};
const ZONES_META = {zones_json};
const TRACES = {trace_json};
const SEMANTIC_EDGES = {semantic_edges_json};

function esc(s) {{
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}}

const nodesDS = new vis.DataSet(RAW_NODES.map(n => ({{
  id: n.id, label: n.label, color: n.color, size: n.size,
  font: n.font, title: n.title,
  _community: n.community, _community_name: n.community_name,
  _member_count: n.member_count, _degree: n.degree,
  _category: n.category,
  _layer: n.layer, _layer_label: n.layer_label, _layer_color: n.layer_color,
  _layer_confidence: n.layer_confidence, _scenarios: n.scenarios,
}})));

const edgesDS = new vis.DataSet(RAW_EDGES.map(e => ({{
  id: e.id, from: e.from, to: e.to,
  label: e.label, title: e.title, dashes: e.dashes,
  width: e.width, color: e.color, _kind: e.kind,
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

let currentTraceId = null;
let semanticEdgesDS = new vis.DataSet([]);

network.once('stabilizationIterationsDone', () => {{
  network.setOptions({{ physics: {{ enabled: false }} }});
  drawZones();
  network.fit({{ animation: false }});
}});

network.on('afterDrawing', () => {{
  if (document.getElementById('zones-toggle').checked) drawZones();
}});

function getLayerColor(layerId) {{
  const l = LAYERS.find(x => x.id === layerId);
  return l ? l.color : '#888';
}}

function drawZones() {{
  const svg = document.getElementById('zone-svg');
  if (!svg) return;
  if (!document.getElementById('zones-toggle').checked) {{
    svg.innerHTML = '';
    return;
  }}
  const canvasPositions = network.getPositions();
  const layerPoints = {{}};
  nodesDS.get().forEach(n => {{
    if (n.hidden) return;
    const layer = n._layer;
    const meta = LAYERS.find(l => l.id === layer);
    if (!meta || !meta.draw_zone) return;
    const p = canvasPositions[n.id];
    if (!p) return;
    if (!layerPoints[layer]) layerPoints[layer] = [];
    layerPoints[layer].push(p);
  }});

  let html = '';
  Object.keys(layerPoints).forEach(layer => {{
    const pts = layerPoints[layer];
    if (pts.length < 8) return;
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    if (maxX - minX < 120 || maxY - minY < 80) return;
    const color = getLayerColor(layer);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Use bounding box with rounded corners to avoid overlapping clutter
    const w = maxX - minX + 60;
    const h = maxY - minY + 60;
    const rx = Math.min(w / 6, 40);
    html += `<rect class="layer-zone" x="${{minX-30}}" y="${{minY-30}}" width="${{w}}" height="${{h}}" rx="${{rx}}" fill="${{color}}" stroke="${{color}}" />`;
    html += `<text class="layer-zone-label" x="${{cx}}" y="${{cy}}" fill="${{color}}">${{esc(LAYERS.find(l=>l.id===layer).label)}}</text>`;
  }});
  svg.innerHTML = html;
}}

function toggleZones() {{
  drawZones();
}}

function toggleLayer(layerId, visible) {{
  const updates = RAW_NODES.filter(n => n.layer === layerId).map(n => ({{ id: n.id, hidden: !visible }}));
  nodesDS.update(updates);
  drawZones();
}}

function showInfo(nodeId) {{
  const n = nodesDS.get(nodeId);
  if (!n) return;
  const neighborIds = network.getConnectedNodes(nodeId);
  const neighborItems = neighborIds.map(nid => {{
    const nb = nodesDS.get(nid);
    const color = nb ? nb.color.background : '#555';
    return `<span class="neighbor-link" style="border-left-color:${{esc(color)}}" data-nid="${{esc(nid)}}">${{esc(nb ? nb.label || nb._community_name : nid)}}</span>`;
  }}).join('');

  const layerBadge = n._layer ? `<span class="layer-badge" style="background:${{esc(n._layer_color)}}">${{esc(n._layer_label)}}</span>` : '';
  const scenariosHtml = (n._scenarios || []).length
    ? `<div class="field" style="margin-top:8px"><b>Scenarios:</b><br>${{(n._scenarios || []).map(s => `<span class="scenario-link" data-scenario="${{esc(s.id)}}">${{esc(s.label)}}</span>`).join('')}}</div>`
    : '';

  document.getElementById('info-content').innerHTML = `
    <div class="field"><b>${{esc(n._community_name)}}</b>${{layerBadge}}</div>
    <div class="field"><b>ID:</b> ${{esc(n.id)}}</div>
    <div class="field"><b>Community:</b> ${{n._community}}</div>
    <div class="field"><b>Category:</b> ${{n._category}}</div>
    <div class="field"><b>Layer confidence:</b> ${{Math.round((n._layer_confidence || 0)*100)}}%</div>
    <div class="field"><b>Members:</b> ${{n._member_count}}</div>
    <div class="field"><b>Degree:</b> ${{n._degree}}</div>
    ${{scenariosHtml}}
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
  const sc = e.target.closest('.scenario-link');
  if (sc && sc.dataset.scenario !== undefined) activateTrace(sc.dataset.scenario);
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
  drawZones();
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
  drawZones();
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
    drawZones();
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

const layerLegendEl = document.getElementById('layer-legend');
LAYERS.forEach(l => {{
  const item = document.createElement('div');
  item.className = 'legend-item';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'legend-cb';
  cb.checked = l.visible_by_default;
  cb.dataset.layer = l.id;
  cb.addEventListener('change', () => toggleLayer(l.id, cb.checked));
  item.innerHTML = `<div class="legend-dot" style="background:${{l.color}}"></div>
    <span class="legend-label">${{esc(l.label)}}</span>
    <span class="legend-count">${{l.count}}</span>`;
  item.prepend(cb);
  layerLegendEl.appendChild(item);
  if (!l.visible_by_default) toggleLayer(l.id, false);
}});

// Trace mode
function resetTrace() {{
  currentTraceId = null;
  document.getElementById('trace-panel').style.display = 'none';
  semanticEdgesDS.clear();
  nodesDS.update(RAW_NODES.map(n => ({{ id: n.id, color: n.color, opacity: 1.0 }})));
  edgesDS.update(RAW_EDGES.map(e => ({{ id: e.id, color: e.color, width: e.width }})));
}}

function activateTrace(scenarioId) {{
  const tr = TRACES.find(t => t.id === scenarioId);
  if (!tr) return;
  currentTraceId = scenarioId;
  document.getElementById('trace-panel').style.display = 'block';

  const inTrace = new Set(tr.community_ids);
  const updates = RAW_NODES.map(n => ({{
    id: n.id,
    opacity: inTrace.has(n.id) ? 1.0 : 0.08,
    size: inTrace.has(n.id) ? n.size * 1.3 : n.size,
  }}));
  nodesDS.update(updates);

  edgesDS.update(RAW_EDGES.map(e => ({{
    id: e.id,
    color: inTrace.has(e.from) && inTrace.has(e.to)
      ? {{ color: getLayerColor(nodesDS.get(e.from)._layer), opacity: 0.9 }}
      : {{ color: '#cccccc', opacity: 0.05 }},
    width: inTrace.has(e.from) && inTrace.has(e.to) ? 3 : e.width,
  }})));

  const semEdges = SEMANTIC_EDGES.filter(e => e.scenario_id === scenarioId);
  semanticEdgesDS.clear();
  semanticEdgesDS.add(semEdges.map(e => ({{
    id: e.id, from: e.from, to: e.to,
    dashes: e.dashes, width: e.width,
    color: e.color, title: e.title,
    _kind: 'semantic',
  }})));

  const traceSteps = document.getElementById('trace-steps');
  traceSteps.innerHTML = tr.steps.map((s, i) => {{
    const isSem = s.semantic === true;
    const icon = isSem ? '~' : '•';
    const color = getLayerColor(s.layer);
    const semHint = isSem ? ' <span class="semantic-badge">(reconstructed)</span>' : '';
    return `<div class="trace-step ${{isSem ? 'semantic' : ''}}" data-nid="${{esc(s.community_id)}}">
      <span class="trace-step-icon">${{icon}}</span>
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${{color}};margin-right:6px"></span>
      <span>${{esc(s.node_label)}} <span style="color:#666">(${{esc(s.layer)}})</span>${{semHint}}</span>
    </div>`;
  }}).join('');
}}

// Activate trace when clicking scenario link in NODE INFO
// Semantic edges need to be added as a separate dataset to the network
network.setOptions({{ edges: {{ ...network.options.edges, hidden: false }} }});
// We add the semantic edge dataset by manipulating network.body.data.edges — safer to use a second DataSet
// Workaround: add semantic edges to the same edgesDS but with a special _kind; they will be hidden outside trace mode.
edgesDS.add(SEMANTIC_EDGES.map(e => ({{
  id: e.id, from: e.from, to: e.to,
  dashes: e.dashes, width: 0, color: {{ color: '#000', opacity: 0 }},
  title: e.title, _kind: 'semantic', _scenario: e.scenario_id,
  hidden: true,
}})));

const originalSetData = network.setData.bind(network);
// Override edge updates so semantic edges survive
function showSemanticEdgesFor(scenarioId) {{
  edgesDS.update(SEMANTIC_EDGES.filter(e => e.scenario_id === scenarioId).map(e => ({{
    id: e.id, hidden: false, width: e.width, color: e.color, dashes: e.dashes,
  }})));
}}
function hideSemanticEdges() {{
  edgesDS.update(SEMANTIC_EDGES.map(e => ({{ id: e.id, hidden: true, width: 0 }})));
}}

const _activateTrace = activateTrace;
activateTrace = function(scenarioId) {{
  _activateTrace(scenarioId);
  showSemanticEdgesFor(scenarioId);
}};
const _resetTrace = resetTrace;
resetTrace = function() {{
  _resetTrace();
  hideSemanticEdges();
}};
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
    parser.add_argument(
        "--semantic-config",
        type=Path,
        default=None,
        help="Path to graphify-semantic-config.json (default: <script-dir>/graphify-semantic-config.json)",
    )
    args = parser.parse_args(argv)

    graph_dir = args.graph_dir.resolve()
    output_path = args.output.resolve() if args.output else graph_dir / "graph.html"

    if args.semantic_config:
        config_path = args.semantic_config.resolve()
    else:
        config_path = Path(__file__).resolve().parent / "graphify-semantic-config.json"

    config = _load_semantic_config(config_path)

    G, communities, _analysis = _load_graph_and_communities(graph_dir)
    print(f"Loaded graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities")

    node_layers, node_scores, _node_reasons, layer_counts = _classify_all_nodes(G, config)
    community_layers, community_confidence, community_layer_distribution = _assign_community_layers(communities, node_layers)

    meta, member_counts, labels, node_to_community = _build_meta_graph(G, communities)
    print(f"Meta-graph: {meta.number_of_nodes()} community nodes, {meta.number_of_edges()} cross-community edges")

    traces = []
    for scenario in config.get("scenarios", []):
        traces.append(_trace_scenario(scenario, G, node_layers, node_to_community))
        print(f"Trace '{scenario['id']}': {len(traces[-1]['community_ids'])} communities, {len(traces[-1]['semantic_edges'])} semantic edges")

    _render_aggregate_html(
        G, meta, member_counts, labels, node_to_community,
        node_layers, node_scores, community_layers, community_confidence,
        community_layer_distribution, layer_counts, traces, config,
        output_path, max_labels=args.max_labels,
    )
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
