"""Регрессия инцидента canvas-telemetry-vitrina-empty (stage, 2026-09-23).

Симптом: лента canvas_event_raw жива, витрина canvas_event_read пуста, т.к.
`processmap.canvas_telemetry.aggregate_task` ни разу не запускался — на stage
отсутствовал celery beat: сервис не описан в stage-override compose и не входил
в UP_SERVICES/BUILD_SERVICES CI deploy-stage.yml (beat поднимался только вручную).

Эти тесты гарантируют, что расписание агрегатора существует и что stage-контур
CI включает celery-beat — иначе витрина снова умрёт молча.
"""

from pathlib import Path
import re

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


def _workflow_run_steps(workflow_name: str = "deploy-stage.yml") -> list:
    workflow = _load_yaml(REPO_ROOT / ".github" / "workflows" / workflow_name)
    steps = []
    for job in (workflow.get("jobs") or {}).values():
        for step in (job.get("steps") or []):
            # deploy-stage/deploy-prod исполняют скрипт на хосте через
            # appleboy/ssh-action (script внутри `with:`), локальные шаги —
            # через `run`.
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


# ── Регрессия на prod-контур (recon 2026-09-23, контур
# fix/prod-deploy-hygiene-rollback-audit): на prod beat отсутствовал, а
# gateway без reload-шага уязвим к stale-upstream (stage-инцидент 23.09). ──


def test_prod_compose_defines_celery_beat_on_worker_image():
    compose = _load_compose(REPO_ROOT / "docker-compose.prod.yml")
    beat = (compose.get("services") or {}).get("celery-beat")
    assert beat is not None, (
        "docker-compose.prod.yml не описывает celery-beat: на prod не будет "
        "планировщика, витрина canvas_event_read перестанет пополняться "
        "(prod-дефект 2, recon 2026-09-23)"
    )
    image = str(beat.get("image") or "")
    assert image == "app-celery-worker:latest", (
        f"ghcr-пакета celery-beat нет (проверено 2026-09-23) — beat обязан "
        f"бежать на образе celery-worker, получено: {image!r}"
    )
    env_file = beat.get("env_file")
    assert env_file and "/opt/processmap/env/prod.env" in str(env_file), (
        "celery-beat prod обязан читать /opt/processmap/env/prod.env "
        "(иначе расписание уедет на дефолты base-compose)"
    )


def test_deploy_prod_workflow_starts_and_freshness_checks_celery_beat():
    steps = _workflow_run_steps("deploy-prod.yml")
    assert steps, "deploy-prod.yml: не найдено ни одного run-шага"
    joined = "\n".join(steps)
    assert re.search(r"up -d --no-deps --force-recreate -V\s+.*celery-beat", joined, re.S), (
        "deploy-prod.yml не пересоздаёт celery-beat при деплое: планировщик "
        "останется старым/не поднимется"
    )
    assert "app-celery-beat-1" in joined, (
        "deploy-prod.yml не проверяет образ celery-beat (freshness-гейт)"
    )


def test_deploy_prod_workflow_reloads_gateway_and_checks_routing():
    steps = _workflow_run_steps("deploy-prod.yml")
    joined = "\n".join(steps)
    assert "docker kill -s HUP app-gateway-1" in joined, (
        "deploy-prod.yml не шлёт HUP gateway после up: recreate frontend без "
        "reload → stale upstream → 502 (stage-инцидент 23.09, #1030)"
    )
    assert "assets/index-" in joined, (
        "deploy-prod.yml не проверяет, что gateway реально отдаёт свежий "
        "frontend-бандл: stale-upstream ловит человек, а не гейт"
    )


def test_prod_scripts_avoid_docker_exec_in_deploy_path():
    # docker exec сломан на прод-хосте (libseccomp SetSSB, recon 2026-09-23) —
    # деплойный бэкап и preflight обязаны идти через sidecar docker run.
    # Оговорка: post-up `nginx -t` через exec оставлен намеренно — к этому
    # моменту gateway уже пересоздан в up-списке, а exec в свежих
    # контейнерах работает (проверено probe-контейнером). Поэтому no-exec
    # требуем только для части деплоя ДО compose up (бэкап).
    deploy = (REPO_ROOT / ".github" / "workflows" / "deploy-prod.yml").read_text(
        encoding="utf-8"
    )
    pre_up = deploy.split("up -d --no-deps --force-recreate", 1)[0]
    deploy_cmds = [
        line for line in pre_up.splitlines() if not line.lstrip().startswith("#")
    ]
    assert not any("docker exec" in line for line in deploy_cmds), (
        "deploy-prod.yml (до compose up) всё ещё использует docker exec — на "
        "прод-хосте он сломан (SetSSB), деплой упадёт на бэкапе"
    )
    preflight = (REPO_ROOT / "deploy" / "scripts" / "prod_preflight_gates.sh").read_text(
        encoding="utf-8"
    )
    preflight_cmds = [
        line for line in preflight.splitlines() if not line.lstrip().startswith("#")
    ]
    assert not any("docker exec" in line for line in preflight_cmds), (
        "prod_preflight_gates.sh всё ещё использует docker exec — гейты "
        "упадут до начала деплоя"
    )
    assert "docker run --rm" in preflight, "preflight alembic-гейт обязан идти через sidecar docker run"
