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
            con.commit()
        print(f"technologist-demo: уже существует (id={existing['id']}), role={ROLE} подтверждена")
        return
    user = create_user(EMAIL, password, is_admin=False, is_active=True)
    with psycopg.connect(url) as con:
        con.execute("UPDATE users SET role = %s WHERE id = %s", (ROLE, user["id"]))
        con.commit()
    print(f"technologist-demo: создан id={user['id']} email={EMAIL} role={ROLE}")


if __name__ == "__main__":
    main()
