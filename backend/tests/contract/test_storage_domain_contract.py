"""Contract tests for the storage domain split.

These tests verify that the public surface of app.storage and the new
app.domains.storage.* packages remains stable after the refactor.
No database is required.
"""

import ast
import hashlib
import importlib
import inspect
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


DOMAINS = [
    "compat",
    "platform",
    "dictionaries",
    "utils",
    "org_auth",
    "project",
    "explorer",
    "templates_legacy",
    "audit_telemetry",
    "ai",
    "canvas_session",
    "notes",
]


def test_storage_facade_exports_public_names_from_all_domains():
    from app import storage

    for domain in DOMAINS:
        repository = __import__(
            f"app.domains.storage.{domain}.repository", fromlist=["repository"]
        )
        public_names = [name for name in dir(repository) if not name.startswith("_")]
        assert public_names, f"domain {domain} has no public API"
        # At least one public name from each domain must be reachable via app.storage.
        assert any(
            hasattr(storage, name) for name in public_names
        ), f"app.storage does not re-export any public name from {domain}"


def test_storage_facade_preserves_storage_and_projectstorage_classes():
    from app.storage import Storage, ProjectStorage, get_storage, get_project_storage

    assert inspect.isclass(Storage)
    assert inspect.isclass(ProjectStorage)
    assert callable(get_storage)
    assert callable(get_project_storage)


def test_storage_facade_preserves_public_functions():
    from app import storage

    public_names = [
        "get_default_org_id",
        "create_org_record",
        "list_org_records",
        "resolve_active_org_id",
        "create_workspace_folder",
        "create_workspace_record",
        "create_project_in_folder",
        "list_project_sessions_for_explorer",
        "list_session_children",
        "list_session_presence",
        "touch_session_presence",
        "leave_session_presence",
        "append_error_event",
        "list_error_events",
        "get_error_event",
        "startup_db_check",
    ]
    for name in public_names:
        assert hasattr(storage, name), f"missing public name {name} on app.storage"
        obj = getattr(storage, name)
        assert callable(obj) or inspect.isclass(obj), f"{name} is not callable"


def test_storage_facade_preserves_private_helpers_used_by_consumers():
    from app import storage

    private_helpers = [
        "_connect",
        "_ensure_schema",
        "_now_ts",
        "_json_loads",
        "_json_dumps",
        "_count_bpmn_activities",
    ]
    for name in private_helpers:
        assert hasattr(storage, name), f"missing helper {name} on app.storage"


@pytest.mark.parametrize("domain", DOMAINS)
def test_domain_module_imports(domain):
    module = __import__(f"app.domains.storage.{domain}", fromlist=["repository"])
    assert module is not None
    assert hasattr(module, "repository")


@pytest.mark.parametrize("domain", DOMAINS)
def test_domain_repository_has_public_api(domain):
    repository = __import__(
        f"app.domains.storage.{domain}.repository", fromlist=["repository"]
    )
    public_names = [name for name in dir(repository) if not name.startswith("_")]
    assert public_names, f"domain {domain} has no public API"


def test_project_storage_methods_delegate():
    from app.storage import ProjectStorage

    methods = {"create", "list", "load", "save", "delete"}
    assert methods.issubset(set(dir(ProjectStorage)))


def test_storage_methods_delegate():
    from app.storage import Storage

    expected = {
        "create",
        "load",
        "save",
        "delete",
        "list",
        "rename",
        "patch_session_meta",
        "patch_session_interview",
        "create_bpmn_version_snapshot",
        "list_bpmn_versions",
        "get_bpmn_version",
        "soft_delete_children_by_parent",
    }
    assert expected.issubset(set(dir(Storage)))


def test_domain_packages_do_not_import_storage_facade():
    """Domain repositories must not import app.storage to avoid cycles."""
    import app.domains.storage

    for domain in DOMAINS:
        repository = __import__(
            f"app.domains.storage.{domain}.repository", fromlist=["repository"]
        )
        source = Path(repository.__file__).read_text()
        assert "from app.storage" not in source, f"{domain} imports app.storage"
        assert "import app.storage" not in source, f"{domain} imports app.storage"


def test_storage_py_compiles():
    import app.storage

    assert Path(app.storage.__file__).suffix == ".py"


def test_generator_determinism(tmp_path):
    """The split generator must produce byte-identical output for different PYTHONHASHSEED values."""
    # The test may be run from backend/ or from the repo root; make sure the
    # repo-local tools/ directory is on sys.path before importing the generator.
    repo_root = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(repo_root))
    import tools.split_storage_domains as split_mod

    sys.path.pop(0)
    out_a = tmp_path / "a"
    out_b = tmp_path / "b"

    def snapshot(target: Path) -> dict:
        hashes = {}
        for path in sorted(target.rglob("*")):
            if path.is_file():
                rel = str(path.relative_to(target))
                hashes[rel] = hashlib.md5(path.read_bytes()).hexdigest()
        return hashes

    def run(seed: str, target: Path) -> None:
        target.mkdir(parents=True, exist_ok=True)
        # Use a fresh module import per seed to avoid cached state.
        env = {**os.environ, "PYTHONHASHSEED": seed}
        subprocess.run(
            [sys.executable, "-c", "import tools.split_storage_domains; tools.split_storage_domains.generate()"],
            cwd=repo_root,
            env=env,
            check=True,
        )

    # Seed 0
    run("0", out_a)
    shutil.copytree(repo_root / "backend" / "app" / "domains" / "storage", out_a / "domains")
    shutil.copy2(repo_root / "backend" / "app" / "storage.py", out_a / "storage.py")

    # Seed 42
    run("42", out_b)
    shutil.copytree(repo_root / "backend" / "app" / "domains" / "storage", out_b / "domains")
    shutil.copy2(repo_root / "backend" / "app" / "storage.py", out_b / "storage.py")

    hashes_a = snapshot(out_a)
    hashes_b = snapshot(out_b)

    assert hashes_a == hashes_b, "Generator output differs across PYTHONHASHSEED values"


def test_container_context_import_smoke():
    """Reproduce uvicorn loading backend.app.main:app from /app in Docker.

    This context does NOT have backend/ on sys.path, so absolute imports such as
    ``from app.db import ...`` fail with ModuleNotFoundError. Relative imports
    inside the app package must be used instead.
    """
    repo_root = Path(__file__).resolve().parents[3]
    env = {**os.environ, "PYTHONPATH": ""}
    result = subprocess.run(
        [sys.executable, "-c", "import backend.app.main"],
        cwd=repo_root,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"Container-context import failed:\nstdout={result.stdout}\nstderr={result.stderr}"
    )


def test_backward_compat_all_top_level_names():
    """Every top-level name defined in the original storage.py must remain importable from app.storage."""
    repo_root = Path(__file__).resolve().parents[3]
    original_source = subprocess.check_output(
        ["git", "show", "origin/main:backend/app/storage.py"],
        cwd=repo_root,
        text=True,
    )
    tree = ast.parse(original_source)

    names = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.append(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    names.append(target.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.append(node.target.id)

    import app.storage

    missing = [name for name in names if not hasattr(app.storage, name)]
    assert len(names) == 365, f"expected 365 top-level names, found {len(names)}"
    assert not missing, f"app.storage is missing {len(missing)} names: {missing[:20]}"

