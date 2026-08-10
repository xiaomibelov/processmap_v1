"""CLI генератора: python scripts/llm_test_generator/generate.py [opts]

Примеры:
  # сухой прогон: какие цели возьмём и какой промпт уйдёт (без LLM)
  python scripts/llm_test_generator/generate.py --tag notes --limit 5 --dry-run

  # генерация батча (нужен DEEPSEEK_API_KEY или --api-key)
  python scripts/llm_test_generator/generate.py --tag notes --limit 5
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.llm_test_generator import context, llm, targets  # noqa: E402
from scripts.llm_test_generator.generator import run  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tag", required=True, help="тег OpenAPI для отбора целей (например, notes)")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--ops", default="", help="только эти operation_id (через запятую, подстроки) — повтор отдельных целей")
    parser.add_argument("--coverage", type=Path, default=None, help="путь к api-coverage-results.json")
    parser.add_argument("--model", default="", help="модель (default: deepseek-chat; env LLM_TEST_GENERATOR_MODEL)")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--base-url", default="")
    parser.add_argument("--max-iter", type=int, default=3)
    parser.add_argument("--dry-run", action="store_true", help="только цели + промпт первой цели, без LLM")
    args = parser.parse_args()

    coverage = targets.load_coverage(args.coverage)
    selected = targets.select_targets(coverage, tag=args.tag, limit=args.limit, include_covered=bool(args.ops))
    if args.ops:
        needles = [s.strip() for s in args.ops.split(",") if s.strip()]
        selected = [t for t in (coverage.get("operations") or []) if any(n in (t.get("operation_id") or "") for n in needles)]
        for t in selected:
            documented = {str(s) for s in t.get("documented_statuses") or []}
            seen = {str(s) for s in t.get("seen_statuses") or []}
            t["missing_statuses"] = sorted(documented - seen)
            t["priority"] = 0
    print(f"Целей выбрано: {len(selected)} (tag={args.tag}, limit={args.limit})")
    for t in selected:
        print(f"  [prio {t['priority']}] {t['method']} {t['path']} — {t['status']}, "
              f"missing: {','.join(t['missing_statuses']) or '—'} (op: {t.get('operation_id')})")
    if not selected:
        print("Нет целей по заданным критериям.", file=sys.stderr)
        return 1

    if args.dry_run:
        from scripts.llm_test_generator.generator import build_prompt

        messages = build_prompt(selected[0])
        print("\n--- Промпт первой цели (user, первые 3500 символов) ---")
        print(messages[1]["content"][:3500])
        return 0

    cfg = llm.LLMConfig(api_key=args.api_key, base_url=args.base_url, model=args.model)
    if not cfg.available():
        print("LLM недоступен: задайте DEEPSEEK_API_KEY или --api-key/--base-url.", file=sys.stderr)
        return 2
    print(f"LLM: model={cfg.model}, base_url={cfg.base_url}")

    report = run(selected, cfg, max_iter=args.max_iter, tag=args.tag)
    print(json.dumps({k: v for k, v in report.items() if k != "results"}, ensure_ascii=False, indent=2))
    print(f"Детали: build/llm-test-generator/last_run.json; непрошедшие: build/llm-test-generator/needs_human.md")
    return 0 if report["passed"] == report["targets"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
