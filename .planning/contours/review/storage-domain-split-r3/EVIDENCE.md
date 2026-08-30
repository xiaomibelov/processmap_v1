# EVIDENCE: review/storage-domain-split-r3

## 1. Git state

```text
checkout: /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone
branch:   fix/storage-domain-split
HEAD:     7f16147897dbc52464a0ee41391896d076f414f0
origin/main: 7f16147897dbc52464a0ee41391896d076f414f0
```

```bash
git status -sb
# ## fix/storage-domain-split...origin/main
#  M backend/app/storage.py
#  M backend/pytest.ini
#  M backend/tests/conftest.py
#  M backend/tests/test_auto_create_subprocess_sessions.py
#  M backend/tests/test_bpmn_meta.py
# ?? backend/app/domains/
# ?? backend/tests/contract/test_storage_domain_contract.py
# ?? tools/split_storage_domains.py
# ?? tools/report_storage_cross_domain.py
# ... (other contour artifacts)
```

## 2. RAG preflight

```bash
docker run --rm -v "$PWD:/ws" -w /ws node:20-alpine node tools/rag/pm-rag-agent-preflight.mjs \
  --role reviewer --contour fix/storage-domain-split \
  --query "storage domain split iteration 3 review test_generator_determinism" --top-k 5 --format md
```

- Выполнен, facts загружены, warnings учтены.

## 3. Проверка дельты итерации 3

### 3.1. Contract suite из `backend/`

```bash
cd /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend
.venv/bin/python -m pytest tests/contract/test_storage_domain_contract.py -q --tb=short
```

**Результат:**

```text
34 passed in 1.62s
```

### 3.2. Contract suite из корня проекта

```bash
cd /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone
.venv/bin/python -m pytest backend/tests/contract/test_storage_domain_contract.py -q --tb=short
```

**Результат:**

```text
34 passed in 1.66s
```

### 3.3. Targeted suite

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
```

**Результат:**

```text
50 passed, 10 warnings, 2 subtests passed in 53.88s
```

### 3.4. Diff итерации 3

Целевой файл: `backend/tests/contract/test_storage_domain_contract.py`.

Ключевое изменение в `test_generator_determinism`:

```python
repo_root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(repo_root))
import tools.split_storage_domains as split_mod
sys.path.pop(0)
```

- `backend/pytest.ini` не изменялся в итерации 3 (его единственное отличие от `origin/main` — маркер `skip_if_hanging`, добавленный в итерации 2).
- Ни `backend/app/storage.py`, ни `backend/app/domains/storage/`, ни `tools/split_storage_domains.py` в дельте итерации 3 не затронуты.

### 3.5. Результаты R1–R5 итерации 2

Diff итерации 3 не затрагивает файлы, относящиеся к R1–R5 (генератор, доменные модули, фасад `storage.py`, cross-domain отчёты). Предыдущие результаты остаются в силе:

- **R1** — генератор детерминирован (PYTHONHASHSEED 0 vs 42).
- **R2** — cross-domain транзакции задокументированы в `CROSS_DOMAIN_TX.md`.
- **R3** — `[FACADE]` cross-domain импорты через `.repository` = 0.
- **R4** — `storage.py` = 29 строк не-re-export кода.
- **R5 (конфликт контуров)** — в checkout только `fix/storage-domain-split`.

## 4. Итог

- Блокер CR1 из `review/storage-domain-split/VERDICT.md` устранён.
- Contract suite проходит из обеих рабочих директорий.
- Targeted suite зелёная.
- Diff итерации 3 минимален и содержит только заявленную правку.
