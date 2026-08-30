#!/usr/bin/env python3
"""Tests for tools/graphify-render-graph.py."""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import networkx as nx

SCRIPT = Path(__file__).with_name("graphify-render-graph.py").resolve()


def _write_fixture(graph_dir: Path) -> None:
    """Create a small graph.json + .graphify_analysis.json for testing."""
    G = nx.Graph()
    # Three communities:
    #   0: auth hub (create_access_token) connected to helpers
    #   1: api hub (lib/api.js) connected to internal nodes
    #   2: isolated node
    nodes = [
        ("create_access_token", {"label": "create_access_token"}),
        ("verify_token", {"label": "verify_token"}),
        ("hash_password", {"label": "hash_password"}),
        ("lib/api.js", {"label": "lib/api.js"}),
        ("api/get", {"label": "api/get"}),
        ("api/post", {"label": "api/post"}),
        ("api/patch", {"label": "api/patch"}),
        ("orphan", {"label": "orphan"}),
    ]
    G.add_nodes_from(nodes)
    G.add_edges_from([
        ("create_access_token", "verify_token", {"relation": "calls"}),
        ("create_access_token", "hash_password", {"relation": "calls"}),
        ("create_access_token", "api/post", {"relation": "calls"}),  # makes create_access_token the hub
        ("lib/api.js", "api/get", {"relation": "imports"}),
        ("lib/api.js", "api/post", {"relation": "imports"}),
        ("lib/api.js", "api/patch", {"relation": "imports"}),  # makes lib/api.js the hub
        ("verify_token", "api/get", {"relation": "calls"}),  # cross-community
    ])

    graph_data = nx.node_link_data(G, edges="links")
    graph_path = graph_dir / "graph.json"
    graph_path.write_text(json.dumps(graph_data), encoding="utf-8")

    communities = {
        0: ["create_access_token", "verify_token", "hash_password"],
        1: ["lib/api.js", "api/get", "api/post"],
        2: ["orphan"],
    }
    analysis = {"communities": {str(k): v for k, v in communities.items()}}
    (graph_dir / ".graphify_analysis.json").write_text(
        json.dumps(analysis), encoding="utf-8"
    )


def test_render_produces_readable_html() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        graph_dir = Path(tmp) / "graphify-out"
        graph_dir.mkdir()
        _write_fixture(graph_dir)
        output = graph_dir / "graph.html"

        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--graph-dir", str(graph_dir), "--output", str(output)],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr
        assert output.exists()

        html = output.read_text(encoding="utf-8")

        # 1. Stats mention the aggregate meta-graph and categories.
        assert "community nodes" in html
        assert "cross-community edges" in html
        assert "core" in html
        assert "isolated" in html

        # 2. Legend is populated with all communities.
        legend_match = re.search(r"const LEGEND = (\[.*?\]);", html, re.DOTALL)
        assert legend_match, "LEGEND not found"
        legend = json.loads(legend_match.group(1))
        assert len(legend) == 3, f"Expected 3 legend entries, got {len(legend)}"
        labels = {item["label"] for item in legend}
        assert "create_access_token" in labels, f"Hub label missing: {labels}"
        assert "lib/api.js" in labels, f"Hub label missing: {labels}"
        assert "orphan" in labels, f"Isolated community label missing: {labels}"

        # 3. Community labels are used as node titles/labels, not placeholders.
        assert '"Community 0"' not in html
        assert '"Community 1"' not in html
        assert '"Community 2"' not in html

        # 4. Node Info panel fields are present in the script.
        assert "showInfo(nodeId)" in html
        assert "Community:" in html
        assert "Category:" in html
        assert "Degree:" in html
        assert "Neighbors" in html or "No connected communities" in html

        # 4b. Category filter controls exist.
        assert 'data-cat="all"' in html
        assert 'data-cat="core"' in html
        assert 'data-cat="isolated"' in html
        assert "filterCategory(" in html

        # 5. Physics layout uses forceAtlas2Based (better grouping of isolated nodes).
        assert "solver: 'forceAtlas2Based'" in html

        # 6. Search and filter controls exist.
        assert 'id="search"' in html
        assert 'id="legend"' in html
        assert 'id="select-all-cb"' in html


def _write_semantic_fixture(graph_dir: Path, config_path: Path) -> None:
    """Create a graph with frontend/backend/persistence layers and a trace scenario."""
    G = nx.Graph()
    nodes = [
        ("SaveCoordinator.js", {"label": "SaveCoordinator.js", "source_file": "frontend/src/saveCoordinator.js"}),
        ("lib/api.js", {"label": "lib/api.js", "source_file": "frontend/src/lib/api.js"}),
        ("session_service.py", {"label": "session_service.py", "source_file": "backend/app/services/session_service.py"}),
        ("sessions.py", {"label": "sessions.py", "source_file": "backend/app/routers/sessions.py"}),
        ("models.py", {"label": "models.py", "source_file": "backend/app/models.py"}),
        ("Session", {"label": "Session", "source_file": "backend/app/models.py"}),
        ("orphan", {"label": "orphan", "source_file": "backend/app/orphan.py"}),
    ]
    G.add_nodes_from(nodes)
    # Real edges within layers
    G.add_edges_from([
        ("SaveCoordinator.js", "lib/api.js", {"relation": "imports"}),
        ("session_service.py", "sessions.py", {"relation": "calls"}),
        ("session_service.py", "models.py", {"relation": "imports"}),
        ("models.py", "Session", {"relation": "defines"}),
    ])

    graph_data = nx.node_link_data(G, edges="links")
    (graph_dir / "graph.json").write_text(json.dumps(graph_data), encoding="utf-8")

    communities = {
        0: ["SaveCoordinator.js", "lib/api.js"],
        1: ["session_service.py", "sessions.py"],
        2: ["models.py", "Session"],
        3: ["orphan"],
    }
    (graph_dir / ".graphify_analysis.json").write_text(
        json.dumps({"communities": {str(k): v for k, v in communities.items()}}),
        encoding="utf-8",
    )

    config = {
        "layers": [
            {"id": "frontend", "label": "FRONTEND", "color": "#4E79A7",
             "rules": [{"path_prefix": "frontend/src/", "weight": 1.0}]},
            {"id": "backend", "label": "BACKEND", "color": "#59A14F",
             "rules": [{"path_prefix": "backend/app/", "weight": 1.0}]},
            {"id": "persistence", "label": "STORAGE", "color": "#E15759",
             "rules": [{"path_glob": "*/models.py", "weight": 1.0}, {"label_regex": "^Session$", "weight": 1.0}]},
        ],
        "default_layer": "unclassified",
        "layer_zone_threshold": {"min_nodes": 2, "min_width": 50, "min_height": 50},
        "scenarios": [
            {
                "id": "save-diagram",
                "label": "Сохранение диаграммы",
                "seeds": {
                    "frontend": [{"path_glob": "**/saveCoordinator.js", "weight": 2.0}],
                    "backend": [{"path_glob": "**/session_service.py", "weight": 2.0}],
                    "persistence": [{"label_regex": "^Session$", "weight": 2.0}],
                },
                "max_depth": 2,
                "note": "semantic link: no graph edge frontend↔backend",
            }
        ],
    }
    config_path.write_text(json.dumps(config), encoding="utf-8")


def test_semantic_zones_and_traces() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        graph_dir = Path(tmp) / "graphify-out"
        graph_dir.mkdir()
        config_path = Path(tmp) / "semantic-config.json"
        _write_semantic_fixture(graph_dir, config_path)
        output = graph_dir / "graph.html"

        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--graph-dir", str(graph_dir),
             "--output", str(output), "--semantic-config", str(config_path)],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr
        html = output.read_text(encoding="utf-8")

        # 1. Layer legend exists and includes persistence.
        assert "LAYERS" in html
        assert "STORAGE" in html
        assert "FRONTEND" in html
        assert "BACKEND" in html
        assert 'id="zones-toggle"' in html
        assert "toggleZones()" in html

        # 2. Trace data includes semantic steps.
        traces_match = re.search(r"const TRACES = (\[.*?\]);", html, re.DOTALL)
        assert traces_match, "TRACES not found"
        traces = json.loads(traces_match.group(1))
        assert len(traces) == 1
        trace = traces[0]
        assert trace["id"] == "save-diagram"
        steps = trace["steps"]
        layers = [s["layer"] for s in steps]
        assert "frontend" in layers
        assert "backend" in layers
        assert "persistence" in layers
        semantic_steps = [s for s in steps if s.get("semantic")]
        assert semantic_steps, "Expected at least one reconstructed semantic step"

        # 3. Semantic edges are reconstructed, visually distinct from real edges.
        sem_edges_match = re.search(r"const SEMANTIC_EDGES = (\[.*?\]);", html, re.DOTALL)
        assert sem_edges_match, "SEMANTIC_EDGES not found"
        sem_edges = json.loads(sem_edges_match.group(1))
        assert len(sem_edges) >= 1
        for e in sem_edges:
            assert e["kind"] == "semantic"
            assert e["dashes"] == [10, 6]

        # 4. Raw vs aggregate node counts are both exposed in stats.
        assert "raw nodes" in html
        assert "community nodes" in html


def test_missing_graph_json_fails() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        graph_dir = Path(tmp) / "graphify-out"
        graph_dir.mkdir()
        # No graph.json
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--graph-dir", str(graph_dir)],
            capture_output=True,
            text=True,
        )
        assert result.returncode != 0
        assert "graph.json not found" in result.stderr


if __name__ == "__main__":
    test_render_produces_readable_html()
    test_semantic_zones_and_traces()
    test_missing_graph_json_fails()
    print("OK")
