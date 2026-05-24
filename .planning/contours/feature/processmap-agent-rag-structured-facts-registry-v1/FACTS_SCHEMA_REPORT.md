# FACTS_SCHEMA_REPORT

**Contour:** `feature/processmap-agent-rag-structured-facts-registry-v1`
**Date:** 2026-05-16

---

## Schema File

`tools/rag/facts/processmap-facts.schema.json`

## Standard

JSON Schema Draft 7 (`http://json-schema.org/draft-07/schema#`)

## Fact Types

| Type | Description | Type-Specific Required Fields |
|------|-------------|------------------------------|
| `runtime_fact` | Server, URL, path, branch facts | `project`, `key`, `value`, `environment`, `confidence` |
| `agent_rule` | Mandatory or forbidden actions per agent role | `role`, `rule`, `severity`, + `required_action` or `forbidden_action` |
| `contour_fact` | Contour status, verdicts, metrics | `contour_id`, `area`, `formal_verdict`, `user_visible_verdict`, `main_findings` |
| `user_rejection_fact` | User rejections of formal passes | `contour_id`, `rejected_verdict`, `reason`, `user_observation`, `required_next_action`, `severity` |
| `decision_fact` | Project decisions and rationale | `decision`, `rationale`, `applies_to` |
| `validation_fact` | Validation query results | `query`, `expected_terms`, `expected_sources`, `current_result`, `pass_fail`, `last_run` |
| `bottleneck_fact` | Current bottlenecks and next contours | `area`, `problem`, `current_hypothesis`, `evidence`, `next_contour` |

## Common Required Fields

All fact types require:
- `id` — string, pattern `^[a-z0-9_-]+$`
- `type` — enum of 7 fact types
- `status` — `active | superseded | rejected | draft | deprecated`
- `source_refs` — array of strings, minItems 1
- `updated_at` — ISO 8601 date-time

## Allowed Enums

| Field | Allowed Values |
|-------|----------------|
| `status` | `active`, `superseded`, `rejected`, `draft`, `deprecated` |
| `confidence` | `high`, `medium`, `low` |
| `severity` | `critical`, `high`, `medium`, `low` |
| `pass_fail` | `PASS`, `FAIL`, `PARTIAL` |
| `formal_verdict` | `REVIEW_PASS`, `CHANGES_REQUESTED`, `REVIEW_BLOCKED`, `IN_PROGRESS` |
| `user_visible_verdict` | `solved`, `not_solved`, `unknown`, `not_tested` |
| `role` | `agent1`, `agent2`, `agent3`, `all` |

## Schema Architecture

- Uses `definitions` block for reusable types (`uuid`, `isoTimestamp`, `statusEnum`, etc.)
- Uses `allOf` with two branches:
  1. Common properties (id, type, status, source_refs, updated_at)
  2. `oneOf` with type-specific schemas per fact type
- Type-specific schemas use `const` on `type` to match the correct branch
- `agent_rule` uses `anyOf` for required_action / forbidden_action alternation
