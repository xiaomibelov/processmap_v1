"""Регрессия инцидента canvas-telemetry-vitrina-empty (stage, 2026-09-23).

Симптом: лента canvas_event_raw жива, витрина canvas_event_read пуста, т.к.
`processmap.canvas_telemetry.aggregate_task` ни разу не запускался — на stage
отсутствовал celery beat: сервис не описан в stage-override compose и не входил
в UP_SERVICES/BUILD_SERVICES CI deploy-stage.yml (beat поднимался только вручную).

Эти тесты гарантируют, что расписание агрегатора существует и что stage-контур
CI включает celery-beat — иначе витрина снова умрёт молча.
"""

from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_yaml(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


class _ComposeLoader(yaml.SafeLoader):
    """SafeLoader, игнорирующий compose-специфичные теги (!override и т.п.)."""


def _compose_unknown(loader, suffix, node):
    if isinstance(node, yaml.MappingNode):
        return loader.construct_mapping(node, deep=True)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node, deep=True)
    return loader.construct_scalar(node)


_ComposeLoader.add_multi_constructor("", _compose_unknown)


def _load_compose(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.load(fh, Loader=_ComposeLoader) or {}


def test_beat_schedule_includes_canvas_telemetry_aggregate():
    from app.celery_app import app

    schedule = app.conf.beat_schedule or {}
    entry = schedule.get("canvas-telemetry-aggregate")
    assert entry is not None, "beat_schedule потерял canvas-telemetry-aggregate"
    assert entry.get("task") == "processmap.canvas_telemetry.aggregate_task"
    assert entry.get("schedule") is not None


def test_beat_schedule_includes_canvas_telemetry_cleanup():
    from app.celery_app import app

    schedule = app.conf.beat_schedule or {}
    entry = schedule.get("canvas-telemetry-cleanup")
    assert entry is not None, "beat_schedule потерял canvas-telemetry-cleanup"
    assert entry.get("task") == "processmap.canvas_telemetry.cleanup_task"


def test_stage_compose_defines_celery_beat():
    compose = _load_compose(REPO_ROOT / "docker-compose.stage.yml")
    services = (compose.get("services") or {})
    beat = services.get("celery-beat")
    assert beat is not None, (
        "docker-compose.stage.yml не описывает celery-beat: на stage не будет "
        "планировщика, витрина canvas_event_read перестанет пополняться"
    )
    image = str(beat.get("image") or "")
    assert image.startswith("processmap_stage-celery-beat:"), (
        f"celery-beat на stage должен использовать версионируемый image "
        f"processmap_stage-celery-beat:<tag>, получено: {image!r}"
    )


def _workflow_run_steps() -> list:
    workflow = _load_yaml(REPO_ROOT / ".github" / "workflows" / "deploy-stage.yml")
    steps = []
    for job in (workflow.get("jobs") or {}).values():
        for step in (job.get("steps") or []):
            # deploy-stage исполняет скрипт на хосте через appleboy/ssh-action
            # (script внутри `with:`), локальные шаги — через `run`.
            body = step.get("run") or step.get("script")
            if not body:
                with_block = step.get("with") or {}
                body = with_block.get("script") or with_block.get("run")
            if body:
                steps.append(str(body))
    return steps


def test_deploy_stage_workflow_builds_and_starts_celery_beat():
    steps = _workflow_run_steps()
    assert steps, "deploy-stage.yml: не найдено ни одного run-шага"
    joined = "\n".join(steps)
    assert "celery-beat" in joined, (
        "deploy-stage.yml не управляет сервисом celery-beat: beat не поднимается "
        "при деплое stage, freshness-гейт его не проверяет"
    )
