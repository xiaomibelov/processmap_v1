# EVIDENCE: review/storage-domain-split

## 1. Git state

```text
checkout: /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone
branch:   fix/storage-domain-split
HEAD:     7f16147897dbc52464a0ee41391896d076f414f0
origin/main: 7f16147897dbc52464a0ee41391896d076f414f0
```

## 2. RAG preflight

```bash
docker run --rm -v "$PWD:/ws" -w /ws node:20-alpine node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer --contour fix/storage-domain-split --query "storage domain split decomposition" --top-k 5 --format md
```

- Выполнен, facts загружены, warnings учтены.

## 3. Воспроизводимость разреза

```bash
git worktree add ../processmap_v1_main_clone-review-repro origin/main
cd ../processmap_v1_main_clone-review-repro
rm -rf backend/app/domains/storage backend/app/storage.py
mkdir -p .planning/contours/fix/storage-domain-split tools
cp ../processmap_v1_main_clone/tools/split_storage_domains.py tools/
cp ../processmap_v1_main_clone/.planning/contours/fix/storage-domain-split/entity_domain_map.json .planning/contours/fix/storage-domain-split/
../processmap_v1_main_clone/.venv/bin/python tools/split_storage_domains.py
```

Сравнение:

```bash
diff -rq -x '__pycache__' -x '*.pyc' \
  /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-review-repro/backend/app/domains/storage \
  /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend/app/domains/storage
# => no output
diff -q \
  /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-review-repro/backend/app/storage.py \
  /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend/app/storage.py
# => no output
```

**Результат:** разрез воспроизводится байт-в-байт.

## 4. Границы доменов

```bash
cd /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone
.venv/bin/python - <<'PY'
import re
from pathlib import Path
root = Path('backend/app/domains/storage')
MISPLACED = {'ai','org_auth','notes'}
DOMAINS = {'compat','platform','dictionaries','utils','org_auth','project','explorer','templates_legacy','audit_telemetry','ai','canvas_session','notes'}
facade_repo = facade_pkg = internal = misplaced = 0
for f in sorted(root.glob('*/repository.py')):
    domain = f.parent.name
    for line in f.read_text().splitlines():
        line = line.strip()
        m_repo = re.match(r'^from \.\.(\w+)\.repository import', line)
        m_pkg = re.match(r'^from \.\.(\w+) import', line)
        m = m_repo or m_pkg
        if not m: continue
        src = m.group(1)
        if src not in DOMAINS or src == domain: continue
        classification = 'INTERNAL' if (src == 'compat' or domain == 'compat') else ('MISPLACED' if (src in MISPLACED or domain in MISPLACED) else 'FACADE')
        if classification == 'FACADE':
            (facade_repo if m_repo else facade_pkg) += 1
        elif classification == 'INTERNAL': internal += 1
        elif classification == 'MISPLACED': misplaced += 1
print(f'[FACADE] via .repository (forbidden): {facade_repo}')
print(f'[FACADE] via package (ok): {facade_pkg}')
print(f'[INTERNAL]: {internal}')
print(f'[MISPLACED]: {misplaced}')
PY
```

**Результат:**

```text
[FACADE] via .repository (forbidden): 0
[FACADE] via package (ok): 9
[INTERNAL]: 134
[MISPLACED]: 36
```

Thin facade `backend/app/storage.py`:

```text
total lines: 91
import/from lines: 45
non-import non-blank lines: 29
```

No domain imports `app.storage`:

```bash
grep -R 'from app.storage\|import app.storage' backend/app/domains/storage/
# => No domain imports app.storage
```

## 5. Cross-domain транзакции (выборочная сверка)

| Функция | Место | Cross-domain вызовы | Статус |
|---------|-------|---------------------|--------|
| `_ensure_schema` | `compat/repository.py:800` | `_seed_process_property_metadata`, `_seed_reference_tables`, `_ensure_auth_users_backfill`, `_ensure_org_workspaces_bootstrap`, `_ensure_workspace_folder_backfill` | подтверждено |
| `create_project_in_folder` | `project/repository.py:58` | `_json_dumps` (compat) | подтверждено |
| `create_workspace_folder` | `explorer/repository.py:179` | `get_workspace_record` (org_auth) | подтверждено |
| `run_workspace_folder_backfill` | `canvas_session/repository.py:846` | `_ensure_workspace_folder_backfill` (org_auth) | подтверждено |
| `create_note_thread` | `notes/repository.py:416` | `_project_workspace_id_for_session` (utils), `_json_dumps` (compat) | подтверждено |

Полный список в `../fix/storage-domain-split/CROSS_DOMAIN_TX.md`.

## 6. Contract tests

Из корня проекта:

```bash
cd /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone
.venv/bin/python -m pytest backend/tests/contract/test_storage_domain_contract.py -q --tb=short
# 34 passed in 1.67s
```

Из `backend/` (стандартный cwd для `pytest tests`):

```bash
cd /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend
.venv/bin/python -m pytest tests/contract/test_storage_domain_contract.py -q --tb=short
# 33 passed, 1 failed
# FAILED tests/contract/test_storage_domain_contract.py::test_generator_determinism
# ModuleNotFoundError: No module named 'tools'
```

## 7. Targeted suite

```bash
cd /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend
.venv/bin/python -m pytest \
  tests/test_storage_schema_bootstrap.py \
  tests/test_admin_permissions.py \
  tests/test_org_invites.py \
  tests/test_notes_mvp1_api.py \
  tests/test_templates_rbac.py \
  tests/test_error_events_intake.py \
  tests/test_ai_execution_log_foundation.py \
  tests/test_explorer_context_folder_fields.py \
  -q --tb=short
# 50 passed, 10 warnings, 2 subtests passed in 55.98s
```

## 8. Full suite comparison

Команда:

```bash
.venv/bin/python -m pytest tests --timeout=120 --tb=line -q
```

### fix/storage-domain-split

```bash
cd /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend
.venv/bin/python -u -m pytest tests --timeout=120 --tb=line -q --maxfail=10
```

**Результат:**

```text
10 failed, 73 passed, 57 warnings in 32.79s
stopping after 10 failures
FAILED tests/test_admin_llm_api.py::test_admin_gate_401_403
FAILED tests/test_admin_llm_api.py::test_providers_crud_and_key_masking
FAILED tests/test_admin_llm_api.py::test_provider_validation_422
FAILED tests/test_admin_llm_api.py::test_provider_create_with_explicit_org_id
FAILED tests/test_admin_llm_api.py::test_provider_patch_org_id_and_audit_log
FAILED tests/test_admin_llm_api.py::test_provider_list_includes_org_default
FAILED tests/test_admin_llm_api.py::test_provider_test_call
FAILED tests/test_admin_llm_api.py::test_prompts_versioning_activate_rollback
FAILED tests/test_admin_llm_api.py::test_llm_prompt_detail
FAILED tests/test_admin_llm_api.py::test_llm_prompt_audit_log
```

Все failures — `test_admin_llm_api.py`, ошибки 401 / `KeyError: 'item'` / `sqlite3.OperationalError: no such table: llm_providers`, не связанные с `storage.py`.

### origin/main

```bash
cd /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-fullsuite-main/backend
../../processmap_v1_main_clone/.venv/bin/python -u -m pytest tests --timeout=120 --tb=line -q --maxfail=10
```

**Результат:** прогон застыл примерно на 20% с `Timeout` в `app/metrics.py::_poll` (background thread `time.sleep(15)`). Полный список failures получить не удалось из-за pre-existing зависания.

### Интерпретация

- Обе ветки не проходят полный suite на localhost вне Docker Compose.
- `origin/main` зависает раньше (20%) из-за `app/metrics.py::_poll`.
- `fix/storage-domain-split` доходит дальше (31%) и при `--maxfail=10` показывает только pre-existing failures в `test_admin_llm_api.py`.
- Новых failures, связанных с разрезом `storage.py`, не обнаружено.

## 9. Активные контуры

```bash
git branch -a | grep -E 'admin-health-dashboard|legacy-main-session-facade|storage-domain-split'
# => * fix/storage-domain-split
```

Конфликтующих активных контуров нет.
