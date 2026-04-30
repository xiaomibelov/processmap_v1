---
title: "14 Журнал runtime evidence"
type: project-atlas-update
contour: fix/session-patch-cas-self-conflict-queue-v1
date: 2026-05-01
status: source-tested
---

## 2026-05-01 - fix/session-patch-cas-self-conflict-queue-v1

| Поле | Значение |
| ---- | -------- |
| Source | `origin/main` at `a90b9b3fb75b78df430e0d7043be62b5e15190db` |
| Branch | `fix/session-patch-cas-self-conflict-queue-v1` |
| App version | `v1.0.97` |
| Scenario | same-client `PATCH /sessions` bpmn_meta vs delayed interview/hydration PATCH |
| Before | `PATCH bpmn_meta` 200 -> server `79`; delayed PATCH sent `client_base_version=78` -> `409` |
| After | queued PATCH B resolves base after PATCH A ack and sends `base=79`; real 409 still propagates |
| Verdict | `SOURCE_TESTED_STAGE_PROOF_PENDING` |

Tests:

| Command | Result |
| ------- | ------ |
| `git diff --check` | PASS |
| targeted `node --test ...` | PASS, 38/38 |
| `npm --prefix frontend run build` | PASS, Vite chunk-size warning only |
