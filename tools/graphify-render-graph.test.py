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
    test_missing_graph_json_fails()
    print("OK")
