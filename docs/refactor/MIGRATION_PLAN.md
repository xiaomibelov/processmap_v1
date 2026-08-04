# MIGRATION_PLAN — декомпозиция backend/app/_legacy_main.py

Основание: `DECOMPOSITION_MAP.md` (origin/main, 10979 строк, 323 def, 122 маршрута, 18 теневых дублей).

## Принципы (негнущиеся)

1. **Lift-and-shift**: перенос кода без смены логики. Чистка — отдельными PR после.
2. **Фасад**: `_legacy_main.py` остаётся модулем-реэкспортом (`from app.xxx.yyy import *` / явные импорты)
   до финального PR. Причины:
   - ~30 тестовых файлов импортируют имена напрямую из `app._legacy_main`;
   - `legacy/routes_export.py` строит `LEGACY_ROUTE_EXPORT` на импорте модуля — serving-truth для
     `routers/reports.py` и `routers/system.py`;
   - `startup/app_factory` читает `AUTH_PUBLIC_PATHS`.
3. **1 домен = 1 PR**, атомарно, независимо откатываемо (git revert).
4. Регресс каждого PR: `pytest backend/tests -q` + обязательно `test_route_compatibility.py`
   (сторожит route surface) + smoke на stage перед merge.
5. Никаких новых зависимостей. Никакого «большого взрыва». Старый файл не удалять до финального PR.

## Порядок вынесения (по PR)

### PR-0. Дедупликация теневых дублей (подготовка, обязательна первой)
- Удалить 18 мёртвых **первых** дефиниций, оставить последние (активные):
  `get_session`, `list_sessions`, `touch/leave_session_presence_api`, `list_project_sessions`,
  `create_project_session`, `patch_node`, `add_node`, `delete_node`, `add_edge`, `delete_edge`,
  `_coerce_bool`, `_merge_hybrid_v2*` (4 шт), `_pick_current_org_invite`, `_with_invite_links`.
- Риск: **низкий** — первые копии недостижимы по `import`-семантике, но могут вызываться
  внутри файла между своей дефиницией и перетиранием (проверить call-sites по `legacy_rows.json`).
- Регресс: полный pytest + route_compatibility.

### PR-1. core-shared → `app/shared/` (P0-pure, 52 символа)
- Чистые утилиты без сайд-эффектов и без deps на файл: coercion, нормализаторы, RBAC-предикаты.
- Публичный интерфейс: все 52 имени (эксплицитный `__all__`).
- Риск: низкий. Rollback: revert.

### PR-2. auth → `app/auth.py` (15 defs)
- Слить с существующим `app/auth.py` и `routers/auth.py` — **проверить коллизии имён**.
- `AUTH_PUBLIC_PATHS` — оставить реэкспорт в фасаде (потребитель: `app_factory`).
- Риск: средний (аутентификация на каждом запросе). Регресс: auth-тесты + ручной smoke логина на stage.

### PR-3. orgs → `services/org_service.py` + `routers/org*.py` (28 defs)
- Инвайты (`_pick_current_org_invite`, `_with_invite_links` — после PR-0 единственные копии).
- Риск: средний (email-flow инвайтов). Регресс: `test_org_invites*`, `test_workspace_access_controls`.

### PR-4. projects → `services/project_service.py` + `routers/projects.py` (21 def)
- Риск: низко-средний. Регресс: `test_projects_api_workspace_id`, `test_sessions_drift`.

### PR-5. sessions-core → `services/session_service.py` (39 defs)
- CRUD сессий, presence. `routers/sessions.py` уже ходит через service — расширяем его.
- Риск: **высокий** (самая горячая поверхность). Регресс: sessions/drift/CAS/presence тесты + stage smoke.

### PR-6. sessions-graph → `services/session_service.py` (node/edge ops, 17 defs)
- После PR-0 дубли node/edge уже сняты.
- Регресс: `test_diagram_cas_guard`, `test_save_data_guard`, `test_dead_session`.

### PR-7. sessions-bpmn → `save_services/` + `app/normalizer.py`-соседний модуль (32 defs)
- XML merge, meta-нормализация, CAS. Тесно связан с sessions-graph — держать порядок PR-6 → PR-7.
- Регресс: `test_bpmn_meta`, `test_drawio_note_roundtrip`, `test_bpmn_save_rbac_scope`, clipboard-тесты.

### PR-8. sessions-notes-ai → `services/` (новый `notes_ai_service.py`) + `routers/notes.py` (38 defs)
- LLM-вопросы, интервью-анализ (`_merge_interview_with_server_fields` и др. — внешние потребители в тестах).
- Риск: средний (внешние LLM-вызовы — моки в тестах).

### PR-9. reports-analytics → новый пакет `app/reports/` (44 defs)
- **Глобальное состояние**: `_REPORT_LOCKS_GUARD`, `_REPORT_LOCKS_BY_SESSION`, `_REPORT_ACTIVE_GUARD`,
  `_report_session_lock` → `app/reports/locks.py` (store с accessor-функциями, интерфейс для читателей).
- Daemon-thread воркер (line 5416) переносится как есть, вместе с хендлером enqueue.
- `routers/reports.py` (build_router по `_is_report_path`) остаётся точкой монтирования —
  после переноса build_router переключается на новый пакет.
- Риск: средний (потоки + локи). Регресс: `test_path_report_*`, `test_interview_analysis_namespace_guard`.

### PR-10. overlay-drawio → `app/overlay_cache.py` / `app/legacy/` (14 defs)
- «wire overlay_cache stubs» (мутации модуля overlay_cache, `_wired_*`) переносится последним куском домена —
  это import-time сайд-эффект, порядок инициализации сохранить.
- Риск: средний (импорт-тайм инициализация).

### PR-11. system → `routers/system.py` (19 defs)
- build_router по `_is_system_path` уже существует — перенос хендлеров, переключение предиката.
- Риск: низкий. Регресс: health/meta smoke.

### PR-12. admin → `routers/admin.py` (15 defs)
- Регресс: `test_audit_retention_cleanup`, `test_admin_sessions_git_mirror_status`.

### PR-13. settings + export → соответствующие роутеры (5 defs, тривиально)
- Самый маленький PR, можно объединить с PR-12 при желании.

### PR-final. Фасад → `main.py` ≤ 200 строк
- Когда все домены вынесены: `_legacy_main.py` схлопывается в тонкий модуль
  (импорты, сборка `LEGACY_ROUTE_EXPORT` из новых доменов, реэкспорт для совместимости тестов),
  затем переименовывается/удаляется согласно критериям приёмки задачи.
- DCE (мёртвый код) — только здесь, когда весь контур зелёный.

## Разрыв циклических зависимостей

- Основной цикл: sessions-core ↔ reports (общие load/save хелперы) и sessions-bpmn ↔ notes-ai
  (интервью-анализ при save). Разрыв — **инверсией зависимостей**: домен-владелец хелпера
  экспортирует его; потребитель получает через импорт из `shared`/service-слоя, не наоборот.
- Event bus / DI-контейнер **не вводить** — прямых импортов через фасад достаточно;
  точечные колбэки только если PR-5/PR-9 покажут реальный цикл.

## Глобальное состояние (итог)

| состояние | куда | интерфейс |
|---|---|---|
| `_RATE_LIMIT_LOCK` | `app/shared/rate_limit.py` | accessor |
| `_REPORT_*` локи | `app/reports/locks.py` | accessor (store) |
| presence-регексы | sessions-core модуль | приватные |
| RBAC-константы ролей | `app/shared/` | readonly re-export в фасаде |
| `AUTH_PUBLIC_PATHS` | `app/auth.py` | re-export в фасаде (потребитель `app_factory`) |

## Риски и rollback

| риск | митигация |
|---|---|
| Слом route surface (reports/system через build_router) | `test_route_compatibility` в регрессе каждого PR |
| Патч не той копии дубля | PR-0 первым; grep-правило «одна дефиниция на имя» |
| Импорт-тайм сайд-эффекты (polling, wire stubs) | переносить вместе с доменом, порядок инициализации не менять |
| Тесты импортируют из `_legacy_main` | фасад-реэкспорт до финального PR |
| Прод-деплой | только после полного прогона на stage; каждый PR откатывается revert'ом |

## Критерии приёмки (сверка с задачей)

- [ ] `_legacy_main` → ≤ 200 строк в финальном PR
- [ ] 1 домен = 1 файл/пакет = 1 коммит/PR
- [ ] нет циклов между новыми модулями (madge/аналог для py — `pydeps` или ручная проверка импортов)
- [ ] все существующие тесты зелёные на каждом PR
- [ ] unit-тесты на публичные интерфейсы новых модулей
- [ ] `ARCHITECTURE.md` — в финальном PR (диаграмма модулей и контрактов)
