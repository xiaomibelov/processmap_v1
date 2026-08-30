from __future__ import annotations

import json
import os
import re
import subprocess
import threading
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


GRAPHS_DIR_ENV = "GRAPHS_DIR"
DEFAULT_GRAPHS_DIR = "/app/graphify-out"
REBUILD_TIMEOUT_SECONDS = 600  # 10 minutes
MAX_SNAPSHOT_HISTORY = 10


def _graphs_dir() -> Path:
    """Base directory where graph artifacts and snapshots live."""
    raw = os.environ.get(GRAPHS_DIR_ENV, DEFAULT_GRAPHS_DIR)
    return Path(raw).resolve()


def _snapshots_dir() -> Path:
    return _graphs_dir() / "snapshots"


def _current_symlink() -> Path:
    return _snapshots_dir() / "current"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _snapshot_dir(snapshot_id: str) -> Path:
    return _snapshots_dir() / snapshot_id


def _git_info() -> Tuple[str, str]:
    """Return (commit_sha, commit_message) for the current checkout."""
    try:
        sha = (
            subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=_graphs_dir(), stderr=subprocess.DEVNULL, text=True
            )
            .strip()
        )
    except Exception:
        sha = "unknown"
    try:
        msg = (
            subprocess.check_output(
                ["git", "log", "-1", "--pretty=%s"], cwd=_graphs_dir(), stderr=subprocess.DEVNULL, text=True
            )
            .strip()
        )
    except Exception:
        msg = "unknown"
    return sha, msg


def _ensure_dirs() -> bool:
    try:
        _snapshots_dir().mkdir(parents=True, exist_ok=True)
        return True
    except (OSError, PermissionError):
        return False


def _is_current(snapshot_id: str) -> bool:
    link = _current_symlink()
    try:
        return link.is_symlink() and link.readlink().name == snapshot_id
    except Exception:
        return False


def _read_meta(snapshot_id: str) -> Optional[Dict[str, Any]]:
    path = _snapshot_dir(snapshot_id) / "meta.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        data["is_current"] = _is_current(snapshot_id)
        return data
    except Exception:
        return None


def list_snapshots() -> List[Dict[str, Any]]:
    """Return all snapshots ordered by creation time (newest first)."""
    if not _ensure_dirs():
        return []
    snapshots: List[Dict[str, Any]] = []
    if not _snapshots_dir().exists():
        return snapshots
    for entry in _snapshots_dir().iterdir():
        if not entry.is_dir():
            continue
        meta = _read_meta(entry.name)
        if meta:
            snapshots.append(meta)
    snapshots.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return snapshots


def current_snapshot() -> Optional[Dict[str, Any]]:
    """Return metadata for the current snapshot (the one pointed to by 'current' symlink)."""
    if not _ensure_dirs():
        return None
    link = _current_symlink()
    try:
        if not link.is_symlink():
            return None
        snapshot_id = link.readlink().name
        return _read_meta(snapshot_id)
    except Exception:
        return None


def read_snapshot_file(snapshot_id: str, filename: str) -> Optional[bytes]:
    """Read a file from a snapshot directory."""
    path = _snapshot_dir(snapshot_id) / filename
    try:
        if not path.exists():
            return None
        return path.read_bytes()
    except Exception:
        return None


def _trim_old_snapshots() -> None:
    """Keep only the newest MAX_SNAPSHOT_HISTORY snapshots."""
    snaps = list_snapshots()
    for old in snaps[MAX_SNAPSHOT_HISTORY:]:
        try:
            import shutil

            shutil.rmtree(_snapshot_dir(old["id"]), ignore_errors=True)
        except Exception:
            pass


def _update_status(snapshot_id: str, status: str, error: Optional[str] = None) -> None:
    status_path = _snapshot_dir(snapshot_id) / "status.json"
    try:
        data = {"status": status}
        if error is not None:
            data["error"] = error
        if status in ("running",):
            data["started_at"] = _now_iso()
        if status in ("success", "failed", "timeout"):
            data["finished_at"] = _now_iso()
        existing: Dict[str, Any] = {}
        if status_path.exists():
            try:
                existing = json.loads(status_path.read_text(encoding="utf-8"))
            except Exception:
                pass
        existing.update(data)
        status_path.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def _append_log(snapshot_id: str, line: str) -> None:
    log_path = _snapshot_dir(snapshot_id) / "rebuild.log"
    try:
        with log_path.open("a", encoding="utf-8") as f:
            f.write(f"{line}\n")
    except Exception:
        pass


def _resolve_render_script() -> Optional[Path]:
    """Locate graphify-render-graph.py across possible runtime layouts."""
    candidates = [
        # Canonical Docker layout: /app/tools/graphify-render-graph.py
        Path("/app/tools/graphify-render-graph.py"),
        # Repo root layout when backend/app is inside the repo.
        Path(__file__).resolve().parent.parent / "tools" / "graphify-render-graph.py",
        # Fallback: repo root is three levels up from backend/app/admin_graphs.py.
        Path(__file__).resolve().parent.parent.parent / "tools" / "graphify-render-graph.py",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _rebuild_worker(snapshot_id: str) -> None:
    """Background worker that rebuilds the graph snapshot."""
    snapshot_path = _snapshot_dir(snapshot_id)
    base_dir = _graphs_dir()
    script = _resolve_render_script()

    _update_status(snapshot_id, "running")
    _append_log(snapshot_id, f"[{_now_iso()}] Rebuild started for snapshot {snapshot_id}")
    _append_log(snapshot_id, f"[{_now_iso()}] graph-dir={base_dir}")
    _append_log(snapshot_id, f"[{_now_iso()}] script={script}")

    if script is None:
        _append_log(snapshot_id, f"[{_now_iso()}] ERROR: graphify-render-graph.py not found")
        _update_status(snapshot_id, "failed", error="graphify-render-graph.py not found")
        return

    output_html = snapshot_path / "graph.html"
    try:
        cmd = [
            "python",
            str(script),
            "--graph-dir",
            str(base_dir),
            "--output",
            str(output_html),
        ]
        _append_log(snapshot_id, f"[{_now_iso()}] running: {' '.join(cmd)}")

        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=base_dir,
            timeout=REBUILD_TIMEOUT_SECONDS,
        )

        for line in proc.stdout.splitlines():
            _append_log(snapshot_id, line)
        for line in proc.stderr.splitlines():
            _append_log(snapshot_id, f"[stderr] {line}")
        _append_log(snapshot_id, f"[{_now_iso()}] exit code={proc.returncode}")

        if proc.returncode != 0:
            summary = proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else f"exit code {proc.returncode}"
            _append_log(snapshot_id, f"[{_now_iso()}] ERROR: rebuild failed: {summary}")
            _update_status(snapshot_id, "failed", error=f"rebuild failed: {summary}")
            return

        # Copy input artifacts into the snapshot for consistency/history.
        for src_name in ("graph.json", ".graphify_analysis.json"):
            src = base_dir / src_name
            if src.exists():
                dst = snapshot_path / src_name
                dst.write_bytes(src.read_bytes())

        # The render script also emits nodes.json next to graph.html.
        if not (snapshot_path / "nodes.json").exists() and output_html.with_name("nodes.json").exists():
            (snapshot_path / "nodes.json").write_bytes(output_html.with_name("nodes.json").read_bytes())

        # Atomically update current symlink.
        current_link = _current_symlink()
        new_link = _snapshots_dir() / f".current.new.{snapshot_id}"
        try:
            if new_link.exists() or new_link.is_symlink():
                new_link.unlink()
            new_link.symlink_to(snapshot_path, target_is_directory=True)
            new_link.replace(current_link)
        except Exception as exc:
            _append_log(snapshot_id, f"[{_now_iso()}] WARNING: failed to update current symlink: {exc}")

        _trim_old_snapshots()
        _append_log(snapshot_id, f"[{_now_iso()}] SUCCESS: snapshot {snapshot_id} is now current")
        _update_status(snapshot_id, "success")
    except subprocess.TimeoutExpired as exc:
        _append_log(snapshot_id, f"[{_now_iso()}] ERROR: rebuild timed out after {REBUILD_TIMEOUT_SECONDS}s")
        _append_log(snapshot_id, f"[{_now_iso()}] partial stdout:\n{exc.stdout or ''}")
        _append_log(snapshot_id, f"[{_now_iso()}] partial stderr:\n{exc.stderr or ''}")
        _update_status(snapshot_id, "timeout", error="rebuild timed out")
    except Exception as exc:
        _append_log(snapshot_id, f"[{_now_iso()}] ERROR: {exc}")
        _update_status(snapshot_id, "failed", error=str(exc))


# In-memory fallback for jobs that could not be persisted (e.g. graph storage unavailable).
_failed_jobs: Dict[str, Dict[str, Any]] = {}
_rebuild_lock = threading.Lock()


def start_rebuild() -> str:
    """Create a new snapshot entry and kick off a background rebuild.

    Returns the snapshot/job id.
    """
    snapshot_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    if not _ensure_dirs():
        _failed_jobs[snapshot_id] = {
            "job_id": snapshot_id,
            "status": "failed",
            "error": "graph storage directory is not available",
            "log": ["ERROR: graph storage directory is not available"],
        }
        return snapshot_id

    snapshot_path = _snapshot_dir(snapshot_id)
    try:
        snapshot_path.mkdir(parents=True, exist_ok=True)
    except (OSError, PermissionError):
        _failed_jobs[snapshot_id] = {
            "job_id": snapshot_id,
            "status": "failed",
            "error": "cannot create snapshot directory",
            "log": ["ERROR: cannot create snapshot directory"],
        }
        return snapshot_id

    sha, msg = _git_info()
    meta = {
        "id": snapshot_id,
        "created_at": _now_iso(),
        "commit_sha": sha,
        "commit_message": msg,
        "is_current": False,
    }
    (snapshot_path / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _update_status(snapshot_id, "pending")

    if not _rebuild_lock.acquire(blocking=False):
        _update_status(snapshot_id, "failed", error="another rebuild is already running")
        _append_log(snapshot_id, "ERROR: another rebuild is already running")
        return snapshot_id

    def _run() -> None:
        try:
            _rebuild_worker(snapshot_id)
        finally:
            _rebuild_lock.release()

    threading.Thread(target=_run, daemon=True).start()
    return snapshot_id


def rebuild_status(snapshot_id: str) -> Optional[Dict[str, Any]]:
    if snapshot_id in _failed_jobs:
        return dict(_failed_jobs[snapshot_id])
    status_path = _snapshot_dir(snapshot_id) / "status.json"
    log_path = _snapshot_dir(snapshot_id) / "rebuild.log"
    try:
        if not status_path.exists():
            return None
    except (OSError, PermissionError):
        return None
    try:
        data = json.loads(status_path.read_text(encoding="utf-8"))
        data["job_id"] = snapshot_id
        log_lines: List[str] = []
        if log_path.exists():
            try:
                log_lines = log_path.read_text(encoding="utf-8").splitlines()
            except Exception:
                pass
        data["log"] = log_lines
        return data
    except Exception:
        return None


def _load_current_nodes() -> List[Dict[str, Any]]:
    """Load the RAW_NODES array from the current snapshot."""
    link = _current_symlink()
    if not link.is_symlink():
        return []
    snapshot_id = link.readlink().name
    nodes_path = _snapshot_dir(snapshot_id) / "nodes.json"
    if not nodes_path.exists():
        return []
    try:
        return json.loads(nodes_path.read_text(encoding="utf-8"))
    except Exception:
        return []


def _load_current_analysis() -> Dict[str, Any]:
    link = _current_symlink()
    if not link.is_symlink():
        return {}
    snapshot_id = link.readlink().name
    analysis_path = _snapshot_dir(snapshot_id) / ".graphify_analysis.json"
    if not analysis_path.exists():
        return {}
    try:
        return json.loads(analysis_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def compute_analytics() -> Optional[Dict[str, Any]]:
    """Compute analytics for the current snapshot."""
    meta = current_snapshot()
    if meta is None:
        return None

    nodes = _load_current_nodes()
    analysis = _load_current_analysis()
    raw_nodes = analysis.get("raw_nodes", 0)
    raw_edges = analysis.get("raw_edges", 0)
    communities = analysis.get("communities", {})

    total = len(nodes)
    if total == 0:
        return None

    layer_counts: Counter[str] = Counter()
    for n in nodes:
        layer_counts[n.get("layer", "unclassified")] += 1

    # Build layer distribution with labels/colors from node metadata.
    layer_distribution: List[Dict[str, Any]] = []
    seen_layers = set(layer_counts.keys())
    # Also include layers that may have zero nodes in aggregate but exist in config.
    for layer_id, count in layer_counts.most_common():
        # Find a representative node to grab label/color.
        rep = next((n for n in nodes if n.get("layer") == layer_id), None)
        layer_distribution.append(
            {
                "layer_id": layer_id,
                "label": rep.get("layer_label", layer_id.upper()) if rep else layer_id.upper(),
                "color": rep.get("layer_color", "#BAB0AC") if rep else "#BAB0AC",
                "node_count": count,
                "percent": round(100.0 * count / total, 2),
            }
        )

    unclassified = layer_counts.get("unclassified", 0)
    unclassified_percent = round(100.0 * unclassified / total, 2)

    # Top hubs by degree.
    sorted_by_degree = sorted(nodes, key=lambda n: n.get("degree", 0), reverse=True)[:10]
    top_hubs = [
        {
            "node_id": n["id"],
            "label": n.get("label") or n.get("community_name") or n["id"],
            "layer": n.get("layer", "unclassified"),
            "degree": n.get("degree", 0),
        }
        for n in sorted_by_degree
    ]

    # Largest communities by member_count.
    sorted_by_size = sorted(nodes, key=lambda n: n.get("member_count", 0), reverse=True)[:10]
    largest_communities = [
        {
            "community_id": n.get("community", n["id"]),
            "label": n.get("label") or n.get("community_name") or n["id"],
            "layer": n.get("layer", "unclassified"),
            "size": n.get("member_count", 0),
        }
        for n in sorted_by_size
    ]

    isolated_nodes = sum(1 for n in nodes if n.get("category") == "isolated")

    # Layer gaps: count edges between layer pairs.
    # We approximate cross-layer edges from community adjacency using node layer metadata.
    layer_pairs: Dict[Tuple[str, str], int] = {}
    # The meta-graph edges are not in nodes.json; derive from raw graph edges if available.
    raw_graph_path = _current_snapshot_dir() / "graph.json"
    if raw_graph_path.exists():
        try:
            raw_graph = json.loads(raw_graph_path.read_text(encoding="utf-8"))
            node_to_layer: Dict[str, str] = {}
            for n in nodes:
                # nodes.json id is the community id as string; raw graph has original node ids.
                # We cannot map directly. Instead, use the layer distribution already computed.
                pass
        except Exception:
            pass

    # Simpler gap detection: look at raw graph edges and map raw nodes to layers via source_file.
    config_path = Path(__file__).resolve().parent.parent / "tools" / "graphify-semantic-config.json"
    layer_gaps = _compute_layer_gaps(raw_graph_path, config_path)

    return {
        "snapshot_id": meta["id"],
        "commit_sha": meta.get("commit_sha", ""),
        "total_nodes": raw_nodes or total,
        "total_edges": raw_edges,
        "community_nodes": total,
        "cross_community_edges": len(analysis.get("cross_community_edges", [])),
        "isolated_nodes": isolated_nodes,
        "layer_distribution": layer_distribution,
        "unclassified_percent": unclassified_percent,
        "top_hubs": top_hubs,
        "largest_communities": largest_communities,
        "layer_gaps": layer_gaps,
    }


def _current_snapshot_dir() -> Optional[Path]:
    link = _current_symlink()
    if not link.is_symlink():
        return None
    return _snapshot_dir(link.readlink().name)


def _classify_node(node: Dict[str, Any], config: Dict[str, Any]) -> str:
    sf = node.get("source_file", "")
    label = node.get("label", "")
    scores: Counter[str] = Counter()
    for layer in config.get("layers", []):
        sid = layer["id"]
        for rule in layer.get("rules", []):
            weight = rule.get("weight", 1.0)
            if "path_prefix" in rule and sf.startswith(rule["path_prefix"]):
                scores[sid] += weight
            elif "path_glob" in rule:
                import fnmatch

                pattern = rule["path_glob"]
                if fnmatch.fnmatch(sf, pattern) or fnmatch.fnmatch(Path(sf).name, pattern):
                    scores[sid] += weight
            elif "label_regex" in rule and re.search(rule["label_regex"], label):
                scores[sid] += weight
    if not scores:
        return config.get("default_layer", "unclassified")
    return scores.most_common(1)[0][0]


def _compute_layer_gaps(raw_graph_path: Path, config_path: Path) -> List[Dict[str, Any]]:
    """Count real edges between raw nodes of different layers."""
    if not raw_graph_path.exists() or not config_path.exists():
        return []
    try:
        raw_graph = json.loads(raw_graph_path.read_text(encoding="utf-8"))
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except Exception:
        return []

    nodes_raw = raw_graph.get("nodes", [])
    edges_raw = raw_graph.get("links", raw_graph.get("edges", []))

    # Map node id -> layer.
    node_layer: Dict[str, str] = {}
    for n in nodes_raw:
        node_layer[str(n.get("id"))] = _classify_node(n, config)

    pair_counts: Counter[Tuple[str, str]] = Counter()
    for e in edges_raw:
        src = str(e.get("source", e.get("from", "")))
        tgt = str(e.get("target", e.get("to", "")))
        ly = node_layer.get(src, "unclassified")
        ry = node_layer.get(tgt, "unclassified")
        if ly == ry:
            continue
        key = (min(ly, ry), max(ly, ry))
        pair_counts[key] += 1

    layer_meta: Dict[str, Dict[str, Any]] = {}
    for layer in config.get("layers", []):
        layer_meta[layer["id"]] = layer

    gaps: List[Dict[str, Any]] = []
    # Ensure frontend<->backend and backend<->persistence are reported even if zero.
    required_pairs = [("frontend", "backend"), ("backend", "persistence")]
    for a, b in required_pairs:
        key = (min(a, b), max(a, b))
        count = pair_counts.get(key, 0)
        gaps.append(
            {
                "source_layer": a,
                "target_layer": b,
                "edge_count": count,
                "has_edges": count > 0,
                "note": "real edges exist" if count > 0 else "no real edges (semantic links may be reconstructed)",
            }
        )

    # Also report any other non-zero cross-layer pairs.
    for (a, b), count in pair_counts.most_common():
        if (a, b) in [(min(x, y), max(x, y)) for x, y in required_pairs]:
            continue
        if count == 0:
            continue
        gaps.append(
            {
                "source_layer": a,
                "target_layer": b,
                "edge_count": count,
                "has_edges": True,
                "note": "real edges exist",
            }
        )

    return gaps
