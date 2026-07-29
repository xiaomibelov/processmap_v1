"""Seed transformation_rule table from the YAML rule library (E35.1).

Usage:
    DATABASE_URL=postgresql://fpc:fpc@localhost:5432/processmap \
        .venv/bin/python backend/scripts/seed_transformation_rules.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.app.transformation.rules_loader import load_rules, seed_rules_to_db


def main() -> int:
    rules = load_rules()
    count = seed_rules_to_db(rules)
    print(f"seeded {count} transformation rules")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
