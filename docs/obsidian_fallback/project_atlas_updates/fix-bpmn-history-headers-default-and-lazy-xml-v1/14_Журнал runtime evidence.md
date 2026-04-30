---
title: "14 Журнал runtime evidence"
type: project-atlas-update
contour: fix/bpmn-history-headers-default-and-lazy-xml-v1
date: 2026-05-01
status: source-tested
---

## 2026-05-01 - fix/bpmn-history-headers-default-and-lazy-xml-v1

| Поле | Значение |
| ---- | -------- |
| source | `origin/main` at `a34533f7eee7f89382940006ad4fa0515639c41d` |
| branch | `fix/bpmn-history-headers-default-and-lazy-xml-v1` |
| app version | `v1.0.96` |
| audit contour | `audit/project-performance-decomposition-and-slowdown-map-v1` |
| audit commit | `448a5a3e0b8cbae713eb3aa0eef0e1c4c6edd8a0` |
| scenario | initial load, open history modal, preview selected version |
| verdict | `SOURCE_TESTED_STAGE_PENDING` |

> [!summary] Before
> Audit showed 3 x `GET /api/sessions/1a5bd431d8/bpmn/versions?limit=50` on initial session load, each `1084-1469ms`, about `36,684 bytes`.

> [!success] After source proof
> Initial head/read-model path uses `limit=1`; history list fetch is effect-driven when the modal opens; XML detail uses single-version endpoint.

After expected endpoint sequence:

| Scenario | Expected calls |
| -------- | -------------- |
| Initial load | `GET /bpmn/versions?limit=1` for head/badge, not triple `limit=50` |
| Open history | one `GET /bpmn/versions?limit=50` headers-only |
| Preview | one `GET /bpmn/versions/{version_id}` |
| Restore | `POST /bpmn/restore/{version_id}` with CAS base |

Tests:

| Command | Result |
| ------- | ------ |
| `git diff --check` | PASS |
| `node --test ...bpmn-history... api.bpmn... remote-save... cas... revision...` | PASS, 42/42 |
| `npm --prefix frontend run build` | PASS, Vite chunk-size warning only |

Runtime proof:

> [!warning] STAGE_PROOF_PENDING
> Deploy запрещён контуром; runtime network proof на stage не снимался.
