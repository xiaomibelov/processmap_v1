#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.auth import find_user_by_email  # noqa: E402
from app.storage import (  # noqa: E402
    create_org_record,
    create_workspace_folder,
    create_workspace_record,
    list_org_records,
    list_org_workspaces,
    list_workspace_folder_children,
)


DEFAULT_ACTOR_EMAIL = "d.belov@automacon.ru"
DEFAULT_ORG_NAME = "Роботизация производств"
DEFAULT_WORKSPACE_NAME = "DK"

MENU_TREE: Sequence[Tuple[str, Sequence[str]]] = (
    ("1. Супы ДК", (
        "Лагман с говядиной, 320 г",
        "Суп Куриный, 320 г",
        "Борщ с мраморной говядиной",
        "Уха \"Норвежская\"",
        "Крем-суп тыквенный с сухариками",
        "Суп щавелевый с курицей и сметаной",
        "Суп куриный с фрикадельками",
        "Суп гуляш с говядиной",
        "Суп Гороховый с копченостями, 260 г",
        "Суп Гороховый с копченостями, 320 г",
        "Кукурузный крем-суп с беконом",
        "Суп уха \"по-царски\" с филе форели радужной и киноа",
    )),
    ("2. Салаты ДК", (
        "Салат Греческий с томатами",
        "Салат Цезарь с куриной грудкой гриль",
        "Салат \"Окинавский\"",
        "Салат куриный Барбекю",
        "Салат \"Огородник\"",
        "Салат \"по - Сицилийски\" с белоногими креветками",
        "Салат \"Нигора\" с куриным филе и моцареллой",
    )),
    ("3. Пасты Воки ДК", (
        "Вок с курицей",
        "Спагетти \"Карбонара\"",
        "Паста \"Болоньезе\", 290 г",
        "Лазанья Болоньезе",
        "Паста фетучини с курицей су-вид в сливочном соусе с вялеными томатами",
        "Паста с шампиньонами и сливочным соусом из белых грибов",
        "Паста в сливочно-горчичном соусе с томлёной су-вид говядиной",
        "Паста альфреде с копчёной форелью",
    )),
    ("4. Омлеты и завтраки с яйцом ДК", (
        "Шакшука \"Классическая\"",
        "Яичница глазунья с пикантной сосиской и томатами",
        "Деревенский завтрак",
        "Английский завтрак",
        "Овощная яичница с черри, сладким перцем и луком",
        "Оладьи из цукини с творожным сыром, авокадо и ломтиками форели",
        "Драник с лососем (форелью радужной) и яйцом",
        "Омлет с ветчиной, сыром, томатами черри и зеленью",
        "Омлет с брокколи, соусом песто и запеченной фетой",
        "Омлет \"Атлет\"",
    )),
    ("5. Сэндвичи и тосты ДК", (
        "Картофельная вафля с беконом и яйцом",
        "Круассан зерновой с форелью радужной (ломтики) и сливочным сыром",
        "Круассан зерновой с ветчиной куриной и сыром",
        "Сэндвич Крок Мадам",
        "Картофельная вафля с лососем (форелью радужной) и яйцом",
        "Клаб-сэндвич",
        "Круассан с печеной грушей и сыром с плесенью",
    )),
    ("6. Вторые блюда птица ДК", (
        "Гречка с паровыми куриными шариками в грибном соусе",
        "Куриная грудка с гречкой и томатным соусом",
        "Курица в сливочном соусе с рисом",
        "Плов с курицей и барбарисом",
        "Куриный шницель с картофельным пюре, 345г",
        "Куриный шницель запеченный под сыром с картофелем-мини",
        "Котлета куриная \"Солнышко\" с картофельным пюре, 250 г",
        "Котлеты куриные (2 шт) с картофельным пюре",
        "Мясо по-французски (курица) с картофельным пюре",
        "Кусочки пряной тыквы с куриной грудкой су-вид",
        "Рис азиатский с уткой, овощами и ананасом",
        "Котлеты куриные (2 шт) с картофельным пюре ДК",
        "Пюре из цветной капусты с куриной грудкой су-вид",
        "Куриный шницель с картофельным пюре, 345 г ДК",
    )),
    ("7. Вареники Пельмени ДК", (
        "Пельмени с говядиной и свининой, 275 г",
        "Равиоли с мясом камчатского краба, северными креветками и томатами в сливочном соусе песто",
        "Пельмени с курицей и укропом",
        "Вареники с творогом, 265 г",
        "Равиоли с сыром пармезан и шпинатом, 290 г",
    )),
    ("8. Веган ДК", (
        "Вареники постные с картофелем, грибами и кунжутным соусом",
        "Блинчики постные с картофелем и грибами",
        "Гречка отварная с овощами, 150 г",
        "Борщ постный",
        "Лаваш в белом с растительной котлетой",
        "Лаваш в красном с растительной котлетой",
        "Большая порция постных блинчиков с картофелем и грибами, 380 г",
        "Гречка с растительной котлетой и томатным соусом",
        "Растительные фрикадельки с рисом и томатным соусом",
        "Растительные фрикадельки в томатно-шпинатном соусе с брокколи",
        "Макароны постные по-флотски",
        "Вок с растительными фрикадельками",
        "Греча с кусочками пряной тыквы",
        "Рис с кусочками пряной тыквы",
        "Немясной люля-кебаб с рисом и томатным соусом",
        "Немясной люля-кебаб с гречкой и томатным соусом",
    )),
    ("9. Вторые блюда мясо ДК", (
        "Колбаска \"Баварская\" (1 шт.) на шпажке с картофельным пюре, 335 г",
        "Бифштекс говяжий с яйцом и картофельным пюре, 380 г",
        "Говядина в сливочном соусе с гречкой",
        "Баварская колбаска с запеченными картофельными дольками",
        "Рис с ежиками \"по-домашнему\" в томатно-сливочном соусе",
        "Щечки томленые с варениками с картофелем и грибами и луком фри",
        "Большая порция ежиков \"по-домашнему\" в томатно - сливочном соусе (4 шт)",
        "Мясо по-французски (свинина) с рисом",
        "Гречка с ежиками \"по-домашнему\" в томатно-сливочном соусе",
        "Щечки томленые с картофельным пюре, 330 г.",
        "Щечки томленые с гречкой",
    )),
    ("10. Сырники творожные ДК", (
        "Мини-сырники со сметаной и малиновым вареньем",
        "Большая порция сырников творожных со сметаной и малиновым вареньем",
        "Сырники с малиной и сметаной (3 шт)",
        "Сырники творожные со сметаной (3 шт)",
        "Сырники 3 шт со свежими ягодами и брусничной сгущенкой",
        "Сырники \"Нежные\" с брусничной сгущенкой",
        "Большая порция сырников с малиной",
    )),
    ("11. Блины сытные ДК", (
        "Блинчики с ветчиной и сыром",
        "Блинчики с курицей и сметаной",
        "Блинчики с печенью и яйцом",
    )),
    ("12. Каши и гранолы ДК", (
        "Каша пшенная с тыквой и яблоком",
        "Парфе-гранола с голубикой, клубникой и йогуртом",
        "Каша овсяная со свежей голубикой и карамелизированными бананами",
        "Каша мультизлаковая с печёной грушей и грецким орехом",
        "Гранола ягодная с брусничной сгущёнкой",
        "Каша мультизлаковая со свежей клубникой и малиновым вареньем",
        "Каша мультизлаковая на молоке",
        "Гранола с печёной грушей и вишнёвым вареньем",
    )),
    ("13. Гарниры ДК", (
        "Боул с гречкой, яйцом и соусом песто",
        "Картофельное пюре, 190 г",
        "Картофельные дольки с медово-горчичным соусом",
        "Картофель жаренный с грибами, зеленью и сметаной",
        "Оладьи из цукини со сметаной",
        "Боул с рисом, скрембл, куриной грудкой и овощами",
        "Стейк из тыквы с тимьяном, чесноком и розмарином",
        "Пюре из цветной капусты, 210 г",
    )),
    ("14. Бургеры ДК", (
        "Бургер с говядиной Барбекю",
        "Бургер \"Горячий чиз\"",
        "Бургер \"Богатырь\"",
        "Бургер \"Корейский Барбекю\"",
        "Мама бургер с голубым сыром и вишневым вареньем",
        "Хипстер-Хамбургер",
        "Бургер \"Не просто цезарь\"",
        "Бургер \"Шокирующая Азия\"",
    )),
    ("15. Блины сладкие ДК", (
        "Блинчики с вареной сгущенкой",
        "Блинчики с творогом",
        "Блинчики с начинкой клубника-малина (2 шт)",
        "Блины со сгущёнкой и арахисом (3 шт)",
    )),
    ("16. Вторые блюда рыба ДК", (
        "Филе минтая под сыром с картофельным пюре, 315 г",
        "Котлета рыбная \"английская\" из минтая и филе пикши с картофельным пюре, 275 г",
        "Котлета рыбная \"английская\" из минтая и филе пикши с отварным рисом",
        "Рис с горбушей в сливочном соусе карри",
        "Филе минтая под сыром с рисом",
        "Стейк из атлантического лосося (семги)",
        "Картофельное пюре со сливочным соусом карри и горбушей",
        "Пюре из цветной капусты с котлетой рыбной \"английской\" из минтая и филе пикши",
        "Стейк из атлантического лосося (семги) с рисом",
        "Филе-кусочки трески атлантической в кляре с картофельным пюре и чесночным соусом",
        "Филе минтая под сыром с картофельным пюре, ДК",
        "Котлета рыбная \"английская\" из минтая и филе пикши с картофельным пюре ДК",
        "Стейк из атлантического лосося (семги) с картофельным пюре",
        "Филе-кусочки трески атлантической в кляре с пюре из цветной капусты",
    )),
    ("17. Хот-доги ДК", (
        "Хот-Дог Классический",
        "Сырный Хот-Дог Барбекю",
        "Хот-Дог Суздальский",
    )),
    ("18. Семейный формат ДК", (
        "Большая порция блинчиков с курицей и сметаной",
        "Большая порция плова с курицей и барбарисом",
        "Большая порция куриных шариков с пряным соусом \"Цезарь\"",
        "Большой сытный завтрак, 491 г",
        "Большая порция салата Греческого",
        "Большая порция пельмени с говядиной и свининой",
        "Большая порция салата \"Цезарь\" с курицей",
        "Большая порция блинчики с вареной сгущенкой",
        "Семейная порция ежиков \"по-домашнему\" в томатно - сливочном соусе (8 шт)",
        "Большая порция блинчиков с начинкой клубника-малина (4 шт)",
        "Большая порция сырников нежных с брусничной сгущенкой",
        "Большая порция картофеля-мини с розмарином",
        "Большая порция блинов со сгущёнкой и арахисом (5 шт)",
    )),
)


def _to_text(value: Any) -> str:
    return str(value or "").strip()


def _norm_name(value: Any) -> str:
    return " ".join(_to_text(value).split()).casefold()


def _find_actor_user_id(email: str) -> str:
    user = find_user_by_email(email)
    user_id = _to_text((user or {}).get("id"))
    if user_id:
        return user_id
    raise ValueError(f"actor user not found by email: {email}")


def _find_org_by_name(name: str) -> Optional[Dict[str, Any]]:
    target = _norm_name(name)
    for row in list_org_records():
        if _norm_name(row.get("name")) == target:
            return dict(row)
    return None


def _find_workspace_by_name(org_id: str, name: str) -> Optional[Dict[str, Any]]:
    target = _norm_name(name)
    for row in list_org_workspaces(org_id):
        if _norm_name(row.get("name")) == target:
            return dict(row)
    return None


def _find_child_folder_by_name(org_id: str, workspace_id: str, parent_id: str, name: str) -> Optional[Dict[str, Any]]:
    children = list_workspace_folder_children(org_id, workspace_id, parent_id)
    target = _norm_name(name)
    for row in children.get("folders", []):
        if _norm_name(row.get("name")) == target:
            return dict(row)
    return None


def _ensure_org(org_name: str, actor_user_id: str, *, verbose: bool = True) -> Tuple[Dict[str, Any], bool]:
    existing = _find_org_by_name(org_name)
    if existing:
        if verbose:
            print(f"[exists] org: {existing['name']} ({existing['id']})")
        return existing, False
    created = create_org_record(org_name, created_by=actor_user_id)
    if verbose:
        print(f"[create] org: {created['name']} ({created['id']})")
    return created, True


def _ensure_workspace(org_id: str, workspace_name: str, actor_user_id: str, *, verbose: bool = True) -> Tuple[Dict[str, Any], bool]:
    existing = _find_workspace_by_name(org_id, workspace_name)
    if existing:
        if verbose:
            print(f"[exists] workspace: {existing['name']} ({existing['id']})")
        return existing, False
    created = create_workspace_record(org_id, workspace_name, created_by=actor_user_id)
    if verbose:
        print(f"[create] workspace: {created['name']} ({created['id']})")
    return created, True


def _ensure_folder(
    org_id: str,
    workspace_id: str,
    parent_id: str,
    name: str,
    actor_user_id: str,
    *,
    sort_order: int = 0,
    verbose: bool = True,
) -> Tuple[Dict[str, Any], bool]:
    existing = _find_child_folder_by_name(org_id, workspace_id, parent_id, name)
    if existing:
        if verbose:
            print(f"[exists] folder: {existing['name']} ({existing['id']}) parent={parent_id or 'root'}")
        return existing, False
    created = create_workspace_folder(
        org_id,
        workspace_id,
        name,
        parent_id=parent_id,
        user_id=actor_user_id,
        sort_order=sort_order,
    )
    if verbose:
        print(f"[create] folder: {created['name']} ({created['id']}) parent={parent_id or 'root'}")
    return created, True


def seed_structure(
    *,
    actor_email: str,
    org_name: str,
    workspace_name: str,
    verbose: bool = True,
) -> Dict[str, Any]:
    actor_user_id = _find_actor_user_id(actor_email)
    org_row, org_created = _ensure_org(org_name, actor_user_id, verbose=verbose)
    org_id = _to_text(org_row.get("id"))
    workspace_row, workspace_created = _ensure_workspace(org_id, workspace_name, actor_user_id, verbose=verbose)
    workspace_id = _to_text(workspace_row.get("id"))

    top_created = 0
    leaf_created = 0
    top_existing = 0
    leaf_existing = 0

    for top_index, (category_name, item_names) in enumerate(MENU_TREE, start=1):
        category_row, category_was_created = _ensure_folder(
            org_id,
            workspace_id,
            "",
            category_name,
            actor_user_id,
            sort_order=top_index,
            verbose=verbose,
        )
        if category_was_created:
            top_created += 1
        else:
            top_existing += 1
        category_id = _to_text(category_row.get("id"))

        for item_index, item_name in enumerate(item_names, start=1):
            _, item_was_created = _ensure_folder(
                org_id,
                workspace_id,
                category_id,
                item_name,
                actor_user_id,
                sort_order=item_index,
                verbose=verbose,
            )
            if item_was_created:
                leaf_created += 1
            else:
                leaf_existing += 1

    return {
        "ok": True,
        "actor_email": actor_email,
        "actor_user_id": actor_user_id,
        "org_id": org_id,
        "org_name": org_name,
        "org_created": org_created,
        "workspace_id": workspace_id,
        "workspace_name": workspace_name,
        "workspace_created": workspace_created,
        "top_level_total": len(MENU_TREE),
        "top_level_created": top_created,
        "top_level_existing": top_existing,
        "leaf_total": sum(len(items) for _, items in MENU_TREE),
        "leaf_created": leaf_created,
        "leaf_existing": leaf_existing,
    }


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Seed DK menu folder structure into org/workspace explorer.",
    )
    parser.add_argument("--actor-email", default=DEFAULT_ACTOR_EMAIL, help=f"existing user email used as creator (default: {DEFAULT_ACTOR_EMAIL})")
    parser.add_argument("--org-name", default=DEFAULT_ORG_NAME, help=f'organization name (default: "{DEFAULT_ORG_NAME}")')
    parser.add_argument("--workspace-name", default=DEFAULT_WORKSPACE_NAME, help=f'workspace name (default: "{DEFAULT_WORKSPACE_NAME}")')
    parser.add_argument("--quiet", action="store_true", help="suppress per-node logs and print summary only")
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    try:
        result = seed_structure(
            actor_email=_to_text(args.actor_email).lower(),
            org_name=_to_text(args.org_name),
            workspace_name=_to_text(args.workspace_name),
            verbose=not bool(args.quiet),
        )
    except Exception as exc:
        print(f"seed_failed: {exc}", file=sys.stderr)
        return 1

    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
