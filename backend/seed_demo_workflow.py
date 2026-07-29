"""UX1/U2.2 — seed демо-данных воркфлоу (идемпотентно).

Шаблон «Супы РТК (демо UX1)» из приёмочного BPMN v0.3 + published-версия v1.0.0
+ 2 published recipe (Борщ 90 сек, Том ям 120 сек) — чтобы формы рецептов,
версии, история и пилоты были не пустыми при первом входе технолога.

Идемпотентность: по имени шаблона и sku_id рецептов; повторный прогон ничего
не дублирует и не падает. Audit-события пишутся только при создании.

Запуск: DATABASE_URL=... FPC_DB_BACKEND=postgres .venv/bin/python backend/seed_demo_workflow.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app.audit.writer import write_event
from backend.app.auth import find_user_by_email
from backend.app.process_template.bpmn_export import generate_bpmn
from backend.app.process_template.bpmn_import import parse_bpmn
from backend.app.process_template.repository import ProcessTemplateRepository
from backend.app.process_template.version_repository import ProcessTemplateVersionRepository
from backend.app.recipe.repository import RecipeRepository, RecipeVersionRepository

FIXTURE = os.path.join(os.path.dirname(__file__), "tests", "fixtures", "tobe_razogrev_supa_rtk_v03.bpmn")
TEMPLATE_NAME = "Супы РТК (демо UX1)"
TEMPLATE_VERSION = "1.0.0"
ORG_ID = "org_default"

RECIPES = [
    {
        "sku_id": "borsch",
        "title": "Борщ",
        "parameters_json": {
            "heat_time_sec": 90,
            "heating_power": "medium",
            "target_temp_c": 75,
            "dish_sku_id": "soup_tomato",
            "qty": 20,
        },
    },
    {
        "sku_id": "tom_yam",
        "title": "Том ям",
        "parameters_json": {
            "heat_time_sec": 120,
            "heating_power": "medium",
            "target_temp_c": 85,
            "dish_sku_id": "soup_chicken",
            "qty": 20,
        },
    },
]


def _actor() -> tuple[str, str]:
    user = find_user_by_email("technologist-demo@local")
    if user:
        return str(user["id"]), "technologist-demo@local"
    return "", "seed-demo"


def main() -> None:
    actor_id, actor_label = _actor()
    templates = ProcessTemplateRepository()
    versions = ProcessTemplateVersionRepository()
    recipes = RecipeRepository()
    recipe_versions = RecipeVersionRepository()

    xml_text = open(FIXTURE, encoding="utf-8").read()
    parsed = parse_bpmn(xml_text)

    # --- шаблон + published-версия ------------------------------------------
    existing = templates.list()
    template = next((t for t in existing if t.get("name") == TEMPLATE_NAME), None)
    if not template:
        template = templates.create(
            {
                "name": TEMPLATE_NAME,
                "version": TEMPLATE_VERSION,
                "status": "published",
                "ui_model": parsed.ui_model,
                "created_by": actor_label,
            }
        )
        version_row = versions.create(
            {
                "template_id": template["id"],
                "version": TEMPLATE_VERSION,
                "status": "published",
                "ui_model": parsed.ui_model,
                "bpmn_xml": generate_bpmn(parsed.ui_model),
                "precheck_report": {"summary": {"seed": "demo UX1"}},
                "dry_run_report": {"summary": {"errors": 0, "warnings": 0}},
                "created_by": actor_label,
            }
        )
        write_event(
            actor_user_id=actor_id,
            action="publish",
            entity_type="process_template",
            entity_id=str(template["id"]),
            meta_json={"version": TEMPLATE_VERSION, "diff_summary": "seed demo UX1"},
            org_id=ORG_ID,
        )
        print(f"template: создан «{TEMPLATE_NAME}» id={template['id']} + v{TEMPLATE_VERSION} ({version_row['id']})")
    else:
        print(f"template: «{TEMPLATE_NAME}» уже есть id={template['id']} — пропуск")

    # --- рецепты -------------------------------------------------------------
    existing_recipes = recipes.list(1000, 0)
    for spec in RECIPES:
        recipe = next((r for r in existing_recipes if r.get("sku_id") == spec["sku_id"]), None)
        if recipe:
            print(f"recipe: {spec['sku_id']} уже есть id={recipe['id']} — пропуск")
            continue
        recipe = recipes.create(
            {
                "sku_id": spec["sku_id"],
                "template_id": str(template["id"]),
                "template_version": TEMPLATE_VERSION,
                "parameters_json": spec["parameters_json"],
                "status": "published",
                "created_by": actor_label,
            }
        )
        recipe_versions.create(
            {
                "recipe_id": recipe["id"],
                "version": "1.0.0",
                "status": "published",
                "parameters_json": spec["parameters_json"],
                "template_id": str(template["id"]),
                "template_version": TEMPLATE_VERSION,
                "created_by": actor_label,
            }
        )
        write_event(
            actor_user_id=actor_id,
            action="publish",
            entity_type="recipe",
            entity_id=str(recipe["id"]),
            meta_json={
                "version": "1.0.0",
                "diff_summary": f"sku={spec['sku_id']} ({spec['title']}) seed demo UX1",
                "diff_lines": [f"{k}: — → {v}" for k, v in spec["parameters_json"].items()],
            },
            org_id=ORG_ID,
        )
        print(f"recipe: {spec['title']} ({spec['sku_id']}) создан id={recipe['id']} + v1.0.0")


if __name__ == "__main__":
    main()
