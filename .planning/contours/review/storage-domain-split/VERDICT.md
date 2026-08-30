# VERDICT: review/storage-domain-split

**Вердикт:** CHANGES_REQUESTED

**Дата:** 2026-08-30

**Reviewer:** Agent 3 (processmap-agent)

---

## Чек-лист review

| Пункт | Статус | Примечание |
|-------|--------|------------|
| 1. Воспроизводимость разреза | ✅ PASS | Генератор из `origin/main` + `entity_domain_map.json` даёт байт-идентичный `backend/app/domains/storage/` и `backend/app/storage.py` (diff пустой). |
| 2. Полный тестовый suite с timeout 120с | ⚠️ PARTIAL | Полный suite не доходит до конца ни на `fix/storage-domain-split`, ни на `origin/main` на localhost (pre-existing hang в `app/metrics.py::_poll`). При `--maxfail=10` на fix-ветке видны только pre-existing failures в `test_admin_llm_api.py` (401 / `KeyError: 'item'` / отсутствие таблицы `llm_providers`). Новых storage-related failures не обнаружено. |
| 3. Cross-domain транзакции | ✅ PASS | `CROSS_DOMAIN_TX.md` содержит полный список функций с `with _connect()` и cross-domain вызовами; 5 транзакций выборочно сверены с кодом. |
| 4. Границы доменов | ✅ PASS | `[FACADE]` cross-domain импортов через `.repository` = 0; 9 корректных фасадных импортов через package; `storage.py` = 29 строк не-re-export кода; доменные модули не импортируют `app.storage`. |
| 5. Конфликт с активными контурами | ✅ PASS | В checkout только `fix/storage-domain-split`; `fix/legacy-main-session-facade` и `feature/admin-health-dashboard` отсутствуют. |
| 6. Contract tests | ❌ FAIL | `test_generator_determinism` падает при запуске из `backend/` (`ModuleNotFoundError: No module named 'tools'`), хотя проходит из корня проекта. |

---

## Замечания

### CR1. Robustness contract-теста `test_generator_determinism`

Тест импортирует `tools.split_storage_domains` напрямую:

```python
import tools.split_storage_domains as split_mod
```

При стандартном запуске `pytest tests/...` из `backend/` директория `tools/` не находится в `sys.path`, и тест падает с `ModuleNotFoundError`.

**Как исправить:**

- Вариант A: добавить в тест:
  ```python
  import sys
  from pathlib import Path
  sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
  import tools.split_storage_domains as split_mod
  ```
- Вариант B: создать `tools/__init__.py` и импортировать как `from tools.split_storage_domains import generate`.

Без исправления contract suite не может считаться зелёной при запуске из `backend/`.

### OBS1. Pre-existing full-suite hang

Полный `pytest tests --timeout=120` невозможно довести до конца на localhost ни на `origin/main`, ни на `fix/storage-domain-split` из-за фонового polling thread `app/metrics.py::_poll` (`time.sleep(15)`), который конфликтует с `pytest-timeout`. Это env-ограничение, не связанное с рефакторингом.

---

## Рекомендация

Закрыть **CR1**, перезапустить contract suite из `backend/` и targeted suite. После этого контур можно переводить в `READY_FOR_REVIEW` повторно.

Merge/deploy только после явного approve пользователя.
