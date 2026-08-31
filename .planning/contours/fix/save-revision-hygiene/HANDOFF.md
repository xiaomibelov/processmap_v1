# FIX: save-revision-hygiene — HANDOFF

**Contour:** `fix/save-revision-hygiene`  
**Status:** `READY_FOR_REVIEW`  
**Branch:** `fix/save-revision-hygiene`  
**Base:** `origin/main @ 030f086a47e88cab14732246a58f771260844e74`  
**Worktree:** `/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-worktrees/fix-save-revision-hygiene`  
**Audit source:** `.planning/contours/audit/save-multi-revision-self-conflict/REPORT.md` + repro_06.har

---

## 1. Что сделано

### Backend
- No-op guard в `session_bpmn_save`: идентичный XML + meta не создаёт ревизию, возвращает текущий `dsv` с `changed_keys=[]`.
- Replay идентичного контента со stale base (`base <= current_dsv`) → текущий dsv, не 409.
- CAS-гард для расходящегося контента не ослаблен.
- `client_id` из заголовка `X-PM-Client-Id` сохраняется в `diagram_last_write_client_id` и возвращается в 409-detail как `server_last_write.client_id`.

### Frontend
- `client_id` генерируется на вкладку и шлётся заголовком на все пишущие запросы.
- Классификатор конфликта теперь различает `same_tab` / `same_user_other_tab` / `other_user`.
- `same_tab` получает честную модалку (не «другая вкладка») и авторазрешение через replay.
- Meta-gateway сравнивает с актуальным персистентным состоянием, а не шлёт PATCH всегда после PUT.

### Тесты (после rebase на origin/main 030f086a)
- Backend целевые suites (`test_save_revision_hygiene`, `test_save_data_guard`, `test_session_bpmn_upload`, `test_sessions_drift`, `test_session_bpmn_save_not_found`) — **34 passed, 0 failed**.
- Frontend целевые suites (conflict/CAS/saveUploadStatus/classifier) — **41 passed, 0 failed**.

### OpenAPI
- `scripts/update_openapi.sh` не дал diff — спека не затронута.

---

## 2. Git-proof

```text
branch: fix/save-revision-hygiene
HEAD:   c8337f18ded7833b28e4f117bd5317a38671e0e8
origin/main: 030f086a47e88cab14732246a58f771260844e74
merge-base:  030f086a47e88cab14732246a58f771260844e74
ahead-by: 2

commits:
  c8337f18 docs(planning): артефакты контура fix/save-revision-hygiene
  7366e783 fix(save): гигиена ревизий — no-op guard, без лишнего meta-PATCH, классификация same_tab

git diff --stat 030f086a..HEAD: 16 files changed, 695 insertions(+), 32 deletions(-)
```

Merge/push в main/deploy без явного approve не выполнялись.

---

## 3. Что НЕ доказано / риски

- Локальный docker compose end-to-end не прогонялся (хост без `node`/`npm`).
- Две реальные вкладки для `same_user_other_tab` — не проверены вручную.
- Потребители `dsv` (presence, badge версии, merge-панель) могут отреагировать на отсутствие инкремента при zero-delta save.
- `tools/pm-agent-mirror-report.sh` недоступен вне `/opt/processmap-test`; mirror в Obsidian — ручной / infra follow-up.

---

## 4. Следующие шаги

1. Создать PR (title/body на русском — см. задачу §6).
2. Review → approve → merge в `main`.
3. Stage verify по протоколу аудита §5.
4. Prod deploy — только по явному решению владельца.
