"""UX1/U2.4 — seed пользователя technologist-demo (идемпотентно).

Создаёт пользователя technologist-demo@local с ролью technologist
(воркфлоу AS IS → пилот БЕЗ admin-функций). Пароль — из env
TECH_DEMO_PASSWORD, default «technologist-demo» (демо-креды stage,
в духе admin@local/admin из regression — не секрет продакшена).

Повторный прогон: не дублирует; гарантирует role='technologist'
(пароль существующего пользователя НЕ трогает).

Запуск: DATABASE_URL=... .venv/bin/python backend/seed_technologist_user.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import psycopg

from backend.app.auth import create_user, find_user_by_email, hash_password

EMAIL = "technologist-demo@local"
ROLE = "technologist"


def main() -> None:
    url = os.environ.get("DATABASE_URL")
    password = os.environ.get("TECH_DEMO_PASSWORD", "technologist-demo")
    existing = find_user_by_email(EMAIL)
    if existing:
        with psycopg.connect(url) as con:
            con.execute("UPDATE users SET role = %s WHERE email = %s", (ROLE, EMAIL))
            # WS3: членство в org_default (editor) — доступ к сессиям /app
            con.execute(
                "INSERT INTO org_memberships (org_id, user_id, role, created_at) "
                "SELECT 'org_default', %s, 'editor', 0 "
                "WHERE NOT EXISTS (SELECT 1 FROM org_memberships WHERE org_id='org_default' AND user_id=%s)",
                (existing["id"], existing["id"]),
            )
            con.commit()
        print(f"technologist-demo: уже существует (id={existing['id']}), role={ROLE} + org_default editor подтверждены")
        return
    user = create_user(EMAIL, password, is_admin=False, is_active=True)
    with psycopg.connect(url) as con:
        con.execute("UPDATE users SET role = %s WHERE id = %s", (ROLE, user["id"]))
        con.execute(
            "INSERT INTO org_memberships (org_id, user_id, role, created_at) "
            "SELECT 'org_default', %s, 'editor', 0 "
            "WHERE NOT EXISTS (SELECT 1 FROM org_memberships WHERE org_id='org_default' AND user_id=%s)",
            (user["id"], user["id"]),
        )
        con.commit()
    print(f"technologist-demo: создан id={user['id']} email={EMAIL} role={ROLE} + org_default editor")


if __name__ == "__main__":
    main()
