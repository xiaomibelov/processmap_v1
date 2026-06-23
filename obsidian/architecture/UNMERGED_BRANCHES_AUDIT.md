# UNMERGED BRANCHES AUDIT

**Target:** `new-origin/main` (`d4bdfd28`)  
**Mode:** read-only, no git mutations  
**Date:** 2026-06-23T21:10:43Z

| Ветка | Уник. коммитов | Отстает от main | Трогает код? | Конфликты | PR на GitHub | Артефакты | Рекомендация | Обоснование |
|-------|----------------|-----------------|--------------|-----------|--------------|-----------|--------------|-------------|
| `audit/overlay-performance-v1` | 0 | 886 | - | - | - | - | **ALREADY_IN_MAIN** | Все коммиты уже в main (squash/merge). Ветку можно удалить. |
| `docs/planning-contours-archive` | 1 | 13 | ❌ only docs/planning/obsidian | Нет | Нет | ❌ нет | **ARCHIVE** | Только артефакты/docs, не код. Можно оставить как архив. |
| `feature/overlay-pan-visibility-toggle` | 0 | 1 | - | - | - | - | **ALREADY_IN_MAIN** | Все коммиты уже в main (squash/merge). Ветку можно удалить. |
| `feature/user-access-redesign` | 0 | 18 | - | - | - | - | **ALREADY_IN_MAIN** | Все коммиты уже в main (squash/merge). Ветку можно удалить. |
| `feat/user-management-redesign` | 47 | 56 | ✅ 69 file(s) | Да (1	backend/app/routers/admin.py 2	backend/app/routers/admin.py 3	backend/app/routers/admin.py 1	backend/app/storage.py 2	backend/app/storage.py ) | Нет | ❌ нет | **REBASE** | Есть конфликты с main; требуется rebase + retest. |
| `fix/api-patch-version-handling` | 2 | 874 | ✅ 34 file(s) | Да (2	AGENTS.md 3	AGENTS.md 1	backend/app/_legacy_main.py 2	backend/app/_legacy_main.py 3	backend/app/_legacy_main.py ) | Нет | ❌ нет | **DISCARD** | Отстает от main на 874 коммитов, ветка сильно устарела. |
| `fix/bpmn-copy-paste-followups-v1` | 0 | 867 | - | - | - | - | **ALREADY_IN_MAIN** | Все коммиты уже в main (squash/merge). Ветку можно удалить. |
| `fix/explorer-open-pending-state-v1` | 0 | 875 | - | - | - | - | **ALREADY_IN_MAIN** | Все коммиты уже в main (squash/merge). Ветку можно удалить. |
| `fix/history-readpath-loading-separation-v1` | 0 | 863 | - | - | - | - | **ALREADY_IN_MAIN** | Все коммиты уже в main (squash/merge). Ветку можно удалить. |
| `fix/overlay-panel-model-gating-v1` | 0 | 881 | - | - | - | - | **ALREADY_IN_MAIN** | Все коммиты уже в main (squash/merge). Ветку можно удалить. |
| `fix/overlay-vm-invalidation-split-v1` | 0 | 883 | - | - | - | - | **ALREADY_IN_MAIN** | Все коммиты уже в main (squash/merge). Ветку можно удалить. |
| `fix/rbac-gaps` | 1 | 13 | ✅ 4 file(s) | Да (2	.planning/contours/fix/rbac-gaps/PLAN.md 3	.planning/contours/fix/rbac-gaps/PLAN.md 2	.planning/contours/fix/rbac-gaps/PR.md 3	.planning/contours/fix/rbac-gaps/PR.md ) | Нет | ✅ READY_FOR_EXECUTION | **REBASE** | Есть конфликты с main; требуется rebase + retest. |
| `fix/rbac-gaps-rebased` | 1 | 0 | ✅ 4 file(s) | Нет | Нет | ❌ нет | **MERGE** | Чистый rebase от main, smoke-test пройден, PR готов. |
| `fix/rbac-sessions-drift` | 1 | 13 | ✅ 4 file(s) | Нет | Нет | ❌ нет | **MERGE** | Маленький RBAC-фикс, 1 коммит, нет конфликтов. |
| `fix/version-reconciliation-policy-v1` | 0 | 873 | - | - | - | - | **ALREADY_IN_MAIN** | Все коммиты уже в main (squash/merge). Ветку можно удалить. |
| `fix/version-truth-alignment-v1` | 0 | 885 | - | - | - | - | **ALREADY_IN_MAIN** | Все коммиты уже в main (squash/merge). Ветку можно удалить. |
| `fix/workspace-middle-click-new-tab-v1` | 0 | 878 | - | - | - | - | **ALREADY_IN_MAIN** | Все коммиты уже в main (squash/merge). Ветку можно удалить. |

## Summary

- **ALREADY_IN_MAIN** — ветки с 0 уникальных коммитов; можно удалить.
- **DISCARD** — сильно устарели или суперседятся другими ветками.
- **ARCHIVE** — только доки/артефакты, не production code.
- **REBASE** — есть конфликты, но код актуален.
- **MERGE** — чистые ветки, готовы к влитию.
- **USER_APPROVE** — готовы, но требуют explicit approve.
- **INVESTIGATE** — нужен ручной review.
