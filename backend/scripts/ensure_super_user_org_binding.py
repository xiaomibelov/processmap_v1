#!/usr/bin/env python3
from __future__ import annotations

import argparse
import getpass
import sys
from pathlib import Path
from typing import Any, Dict, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.auth import AuthError, create_user, find_user_by_email, update_user  # noqa: E402
from app.storage import create_org_record, list_org_records, upsert_org_membership  # noqa: E402


DEFAULT_EMAIL = "d.belov@automacon.ru"
DEFAULT_ORG_NAME = "Роботизация производств"
DEFAULT_ROLE = "org_admin"


def _to_text(value: Any) -> str:
    return str(value or "").strip()


def _find_org_by_name(name: str) -> Optional[Dict[str, Any]]:
    target = _to_text(name).casefold()
    if not target:
        return None
    for row in list_org_records():
        if _to_text(row.get("name")).casefold() == target:
            return dict(row)
    return None


def _ensure_org(name: str, created_by: str) -> Dict[str, Any]:
    existing = _find_org_by_name(name)
    if existing:
        return existing
    return create_org_record(name, created_by=created_by)


def _ensure_user(email: str, password: str) -> Dict[str, Any]:
    existing = find_user_by_email(email)
    if existing:
        return update_user(
            _to_text(existing.get("id")),
            password=password,
            is_admin=True,
            is_active=True,
        )
    return create_user(email, password, is_admin=True, is_active=True)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Ensure a platform admin user exists and is bound to an organization.",
    )
    parser.add_argument("--email", default=DEFAULT_EMAIL, help=f"user email (default: {DEFAULT_EMAIL})")
    parser.add_argument("--org-name", default=DEFAULT_ORG_NAME, help=f'organization name (default: "{DEFAULT_ORG_NAME}")')
    parser.add_argument(
        "--role",
        default=DEFAULT_ROLE,
        choices=["org_owner", "org_admin", "editor", "org_viewer"],
        help=f"organization membership role (default: {DEFAULT_ROLE})",
    )
    parser.add_argument("--password", default="", help="password to set; if omitted, script prompts securely")
    parser.add_argument(
        "--print-only",
        action="store_true",
        help="print planned identifiers without writing changes",
    )
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    email = _to_text(args.email).lower()
    org_name = _to_text(args.org_name)
    role = _to_text(args.role).lower() or DEFAULT_ROLE
    password = str(args.password or "")

    if not email:
        parser.error("--email is required")
    if not org_name:
        parser.error("--org-name is required")
    if not password:
        password = getpass.getpass("Password for super user: ").strip()
    if not password:
        parser.error("password is required")

    existing_user = find_user_by_email(email)
    existing_org = _find_org_by_name(org_name)

    if args.print_only:
        print(
            {
                "email": email,
                "user_exists": bool(existing_user),
                "user_id": _to_text((existing_user or {}).get("id")),
                "org_name": org_name,
                "org_exists": bool(existing_org),
                "org_id": _to_text((existing_org or {}).get("id")),
                "membership_role": role,
            }
        )
        return 0

    try:
        user = _ensure_user(email, password)
    except AuthError as exc:
        print(f"auth_error: {exc}", file=sys.stderr)
        return 1

    user_id = _to_text(user.get("id"))
    if not user_id:
        print("user_id_missing_after_upsert", file=sys.stderr)
        return 1

    try:
        org = _ensure_org(org_name, user_id)
        org_id = _to_text(org.get("id"))
        membership = upsert_org_membership(org_id, user_id, role)
    except Exception as exc:
        print(f"storage_error: {exc}", file=sys.stderr)
        return 1

    print(
        {
            "ok": True,
            "email": email,
            "user_id": user_id,
            "is_admin": True,
            "org_id": org_id,
            "org_name": org_name,
            "membership_role": _to_text(membership.get("role")),
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
