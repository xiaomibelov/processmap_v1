# DECOMPOSITION_MAP — backend/app/_legacy_main.py

Источник истины: `origin/main` @ 5d3f37f7 (после merge PR #645), файл **11142 строк**.
Численная карта символов (раздел 5) снята AST-анализом снапшота @ a5bc1c3d+ (10979 строк;
скрипты и дампы: `ast_probe.py`, `ast_domains.py`, `legacy_map.json`, `legacy_rows.json`) —
структура доменов не изменилась, построчные диапазоны могли сместиться.

## 0. Serving-truth (критично для всех этапов)

- Реальное приложение собирается в `backend/app/startup/app_factory.py::create_app()`.
- Собственный `app = FastAPI()` внутри `_legacy_main.py` (line ~226) **в проде не монтируется** —
  это артефакт для тестов/совместимости.
- Обслуживание маршрутов идёт через `routers/ROUTERS` (include_router):
  - `routers/sessions.py` — 47 явных эндпоинтов → `services/session_service.py` → функции `_legacy_main`;
  - `routers/reports.py` (`_is_report_path`) и `routers/system.py` (`_is_system_path`) — единственные,
    кто использует `routers/_shared.py::build_router(predicate)` поверх `LEGACY_ROUTE_EXPORT`
    (собирается на импорте в конце `_legacy_main.py`, `_build_legacy_route_export`, ~line 10425);
  - дедупликация в `build_router`: первая регистрация (method, canonical_path) побеждает.
- Route surface сторожит тест `backend/tests/test_route_compatibility.py` — он обязателен
  в регрессе каждого PR вынесения.

## 1. Сводные метрики

| метрика | значение |
|---|---|
| строк | 10979 |
| функций (def) | 323 (305 уникальных имён) |
| классов | 0 |
| маршрутов (декораторов) | 122 |
| импортов | 68 |
| модульных присваиваний (глобалы) | 30 |
| имён, определённых дважды (теневые дубли) | 18 |

## 2. Домены

| домен | defs | строк | характер |
|---|---|---|---|
| sessions-bpmn | 32 | 1664 | ядро диаграмм: XML, merge, meta, CAS |
| sessions-notes-ai | 38 | 1449 | заметки, LLM-вопросы, интервью-анализ |
| sessions-core | 39 | 1358 | CRUD сессий, presence, состояние |
| reports-analytics | 44 | 1293 | path-reports, версии, метрики, воркеры |
| system | 19 | 613 | health, meta, misc |
| orgs | 28 | 602 | организации, инвайты, membership |
| core-shared | 36 | 591 | чистые утилиты, coercion, RBAC-предикаты |
| overlay-drawio | 14 | 537 | drawio overlay, нормализация меты |
| sessions-graph | 17 | 521 | node/edge операции |
| projects | 21 | 484 | CRUD проектов |
| auth | 15 | 316 | аутентификация, auth_me |
| admin | 15 | 271 | админ-эндпоинты, audit |
| settings | 3 | 6 | тривиальные |
| export | 2 | 4 | тривиальные |

Приоритеты вынесения: **P0-pure — 52** (нет сайд-эффектов, нет зависимостей от файла),
**P1-helper — 167**, **P2-handler — 104** (роут-хендлеры / мутаторы состояния).

## 3. Глобальное состояние и побочные эффекты

### Сайд-эффекты на импорте модуля

1. `start_polling(overlay_cache.r)` — запуск фонового опроса метрик (поток).
2. `app = FastAPI()` + регистрация 122 маршрутов (не обслуживается в проде).
3. `LEGACY_ROUTE_EXPORT` — сборка route-экспорта для `build_router` (конец файла).
4. «wire overlay_cache stubs» — мутации модуля `overlay_cache`, функции `_wired_*`.

### Глобалы (mutable)

| символ | тип | назначение |
|---|---|---|
| `_RATE_LIMIT_LOCK` | `threading.RLock` | rate-limit (line 264) |
| `_REPORT_LOCKS_GUARD` | `threading.RLock` | guard для локов отчётов (line 428) |
| `_REPORT_LOCKS_BY_SESSION` | `Dict[str, RLock]` | пер-сессионные локи отчётов (line 429) |
| `_REPORT_ACTIVE_GUARD` | `threading.RLock` | активные генерации отчётов (line 431) |
| `_SESSION_PRESENCE_*` | regex-компиляции | presence-API |
| `_ORG_*_ROLES`, `_WORKSPACE_*_ROLES` | frozenset-константы | RBAC-матрицы |
| `AUTH_PUBLIC_PATHS` | set | используется `app_factory` (внешний потребитель!) |

### Потоки/таймеры

- `threading.Thread(daemon=True, name=f"path-report-{report_id}")` — line 5416,
  per-request воркер генерации path-report (`_run_path_report_generation_with_capture`).
  Не import-time, но сайд-эффект хендлеров reports-analytics.
- `start_polling(...)` — import-time поток метрик (см. выше).

### Неявные связи

- **18 теневых дублей**: при `import` имени активна **последняя** дефиниция, первая — мёртвая.
  Патчить первую копию = тихий no-op (уже ловили в dead-session ветке).
- Замыкания/shared state: локи отчётов шарятся между хендлерами reports через модульные глобалы.
- Внешние потребители импортируют имена напрямую из `app._legacy_main` — **~30 тестовых файлов**
  и модули приложения: `clipboard/{api,materializer,service}`, `legacy/routes_export`,
  `routers/{admin,auto_pass,deployment_notices,project_analytics,session_events,templates}`,
  `services/{session_service,org_service,project_service}`, `save_services/status_service`,
  `startup/app_factory`, `ai/module_catalog`, `backend/scripts/sanitize_drawio_persisted_state.py`.
  ⇒ Стратегия: `_legacy_main` остаётся **фасадом-реэкспортом** до финального PR, иначе ломается
  весь тестовый контур и route export.

## 4. Теневые дубли (first = DEAD, last = ACTIVE)

18 имён имеют две модульные дефиниции. Хвостовой блок (~line 10425+) промаркирован
`# DEPRECATED: moved to routers/sessions.py + session_service.py`, но по `import`-семантике
активны именно **последние** копии — первые недостижимы ни через `import`, ни по HTTP
(legacy-роуты этих путей не попадают под предикаты reports/system в `build_router`).
Проверено на @ 5d3f37f7: модульных алиасов нет, внутренние call-sites резолвятся в last-копии.

| имя | тела копий | что умирает с first-копией |
|---|---|---|
| get_session, list_sessions, touch/leave_session_presence_api, list_project_sessions, _merge_hybrid_layer, _merge_hybrid_v2, _merge_drawio, _merge_and_normalize_bpmn_meta | идентичны | ничего |
| patch_node, add_node, delete_node, add_edge, delete_edge | различаются | старое `return {"error": "not found"}`; last = `raise_session_not_found` (фикс PR #645) |
| create_project_session | различаются | inline `_require_org_active_for_writes` (проверка живёт в `session_service.py:940`); last без неё |
| _coerce_bool | различаются | старая str→bool семантика; last — текущая runtime-семантика |
| _pick_current_org_invite, _with_invite_links | различаются | старые сигнатуры (token/used_at); last — status/invite_key (текущие) |

Курьёз: last-копия `patch_node` декорирована `@app.get('/api/sessions/{session_id}/tldr')` —
мертвый артефакт DEPRECATED-блока, путь не обслуживается (не reports/system).
`list_project_sessions`: декоратор только у first-копии — после дедупа путь исчезает
из `LEGACY_ROUTE_EXPORT`, но он и так не матчится предикатами.

Дедупликация — **PR-0** Этапа 3: удалить 18 first-копий (ветка `refactor/legacy-main-dedupe-pr0`,
11142 → 10530 строк, −612), регресс: полный pytest + `test_route_compatibility`.

## 5. Таблица символов

Колонки: символ | строки | deps(file) = зависимости внутри файла | внешние | сайд-эффекты | дубль | приоритет.

### core-shared (36 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `_safe_model_dump` | 5824-5831 (8) | 0:  | Any, Dict | — |  | P0-pure |
| `_canon_path` | 3439-3443 (5) | 0:  | Path | — |  | P0-pure |
| `_primitive_path_value` | 2072-2084 (13) | 0:  | Any, Tuple | — |  | P0-pure |
| `_env_bool` | 392-396 (5) | 0:  | os | — |  | P0-pure |
| `_ln_tag` | 1917-1920 (4) | 0:  | — | — |  | P0-pure |
| `_robot_meta_as_non_negative_int` | 2215-2220 (6) | 0:  | Any | — |  | P0-pure |
| `_robot_meta_as_text` | 2206-2207 (2) | 0:  | Any | — |  | P0-pure |
| `_safe_unlink` | 3487-3494 (8) | 0:  | Path | — |  | P0-pure |
| `_ws_path` | 3435-3437 (3) | 0:  | Path | — |  | P0-pure |
| `_as_dict_obj` | 8694-8695 (2) | 0:  | Any, Dict | — |  | P0-pure |
| `_as_list_obj` | 8698-8699 (2) | 0:  | Any, List | — |  | P0-pure |
| `_looks_like_technical_actor_id` | 295-303 (9) | 0:  | re, Any | — |  | P0-pure |
| `_robot_meta_as_nullable_non_negative_int` | 2223-2232 (10) | 0:  | Any, Optional | — |  | P0-pure |
| `_stable_robot_meta_value` | 2235-2243 (9) | 0:  | Any, Dict | — |  | P0-pure |
| `_to_non_negative_int` | 909-916 (8) | 0:  | Any, Optional | — |  | P0-pure |
| `_practical_role_for_org` | 342-350 (9) | 2: _WORKSPACE_ADMIN_ROLES, _WORKSPACE_EDITOR_ROLES | Any | — |  | P1-helper |
| `_safe_model_dump_list` | 5834-5840 (7) | 1: _safe_model_dump | Any, Dict, List | — |  | P1-helper |
| `_build_server_last_write_payload` | 960-973 (14) | 0:  | Session, Any, Dict | — |  | P1-helper |
| `_ensure_dict_at_path` | 6464-6472 (9) | 0:  | Any, Dict, List | — |  | P1-helper |
| `_ensure_loss_dict` | 6405-6411 (7) | 0:  | Node, Any, Dict | — |  | P1-helper |
| `_entity_key` | 5843-5849 (7) | 1: _safe_model_dump | Any | — |  | P1-helper |
| `_entry_to_flow_tier` | 3119-3136 (18) | 1: _normalize_flow_tier | Any, Optional | — |  | P1-helper |
| `_extract_publish_git_mirror` | 1074-1100 (27) | 1: _PUBLISH_GIT_MIRROR_STATES | Any, Dict | — |  | P1-helper |
| `_list_diff_by_id` | 5869-5895 (27) | 2: _entity_key, _stable_entity_signature | Any, Dict, List | — |  | P1-helper |
| `_normalize_auto_pass_v1` | 2859-3116 (258) | 1: _robot_meta_as_non_negative_int | Any, Dict, List | — |  | P1-helper |
| `_normalize_choice` | 6453-6461 (9) | 1: answer | List | — |  | P1-helper |
| `_normalize_robot_meta_map` | 2292-2309 (18) | 1: _normalize_robot_meta_v1 | Any, Dict, Optional, Set | — |  | P1-helper |
| `_normalize_sequence_key` | 2166-2176 (11) | 1: _primitive_path_value | re, Any | — |  | P1-helper |
| `_parse_equipment_list` | 6414-6423 (10) | 1: answer | re, List | — |  | P1-helper |
| `_parse_minutes` | 6426-6450 (25) | 1: answer | math, re, Optional | — |  | P1-helper |
| `_robot_meta_as_nullable_text` | 2210-2212 (3) | 1: _robot_meta_as_text | Any, Optional | — |  | P1-helper |
| `_role_diff` | 5913-5923 (11) | 0:  | norm_roles, Any, Dict | — |  | P1-helper |
| `_safe_json_dict` | 8702-8709 (8) | 0:  | json, Any, Dict | — |  | P1-helper |
| `_stable_entity_signature` | 5852-5859 (8) | 1: _safe_model_dump | json, Any | — |  | P1-helper |
| `_wired_fetch_annotations` | 10443-10446 (4) | 1: _legacy_load_session_scoped | _collect_interview_comments | — |  | P1-helper |
| `list_orgs_endpoint` | 9249-9255 (7) | 0:  | request_auth_user, get_default_org_id, list_user_org_memberships, resolve_active_org_id… | — |  | P1-helper |

### sessions-core (39 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `_user_is_member_of_org` | 892-902 (11) | 0:  | list_user_org_memberships | — |  | P0-pure |
| `_invalidate_session_open_cache_for_session` | 8837-8841 (5) | 0:  | invalidate_session_open, Any | — |  | P0-pure |
| `_normalize_session_status` | 379-380 (2) | 0:  | normalize_session_status, Any | — |  | P0-pure |
| `_legacy_load_session_scoped` | 8524-8550 (27) | 2: _request_org_candidates, _scope_allowed_project_ids | request_active_org_id, Session, project_scope_for_request, get_default_org_id… | — |  | P1-helper |
| `_invalidate_session_caches` | 8874-8899 (26) | 7: _invalidate_explorer_children_for_project, _invalidate_session_open_cache_for_session, _invalidate_tldr_cache_for_session, _invalidate_workspace_cache_for_org… | session_cache, explorer_invalidate_sessions, Any | — |  | P1-helper |
| `_session_api_dump` | 859-865 (7) | 2: _extract_publish_git_mirror, _normalize_bpmn_meta | Session, notes_decode, Any, Dict | — |  | P1-helper |
| `_collect_sequence_flow_meta` | 1923-2016 (94) | 1: _ln_tag | Any, Dict, List, Set… | — |  | P1-helper |
| `_enforce_gateway_tier_constraints` | 3368-3383 (16) | 1: _normalize_flow_meta_entry | Any, Dict, List, Optional | — |  | P1-helper |
| `_capture_persisted_auto_pass_failed_state` | 3219-3253 (35) | 1: _normalize_bpmn_meta | capture_auto_pass_failed_state, get_or_create_backend_request_id, request_auth_user, Session… | — |  | P1-helper |
| `_report_session_lock` | 435-442 (8) | 1: _REPORT_LOCKS_GUARD | threading | — |  | P1-helper |
| `_require_org_active_for_writes` | 363-371 (9) | 0:  | request_auth_user, is_org_active, HTTPException, Request… | — |  | P1-helper |
| `_iter_session_files` | 3496-3508 (13) | 2: _canon_path, _session_storage_dirs | Path | — |  | P1-helper |
| `_merge_and_normalize_bpmn_meta` | 2775-2856 (82) | 5: _enforce_gateway_tier_constraints, _merge_drawio, _merge_hybrid_layer, _merge_hybrid_v2… | extract_camunda_extensions_from_bpmn_xml, Any, Dict, Tuple | — | DEAD(first) | P1-helper |
| `_merge_and_normalize_bpmn_meta` | 3284-3365 (82) | 5: _enforce_gateway_tier_constraints, _merge_drawio, _merge_hybrid_layer, _merge_hybrid_v2… | extract_camunda_extensions_from_bpmn_xml, Any, Dict, Tuple | — | active(last) | P1-helper |
| `_merge_interview_with_server_fields` | 1149-1174 (26) | 1: _merge_interview_analysis_namespace | norm_interview, Any, Dict | — |  | P1-helper |
| `_normalize_session_presence_client_id` | 882-884 (3) | 1: _SESSION_PRESENCE_CLIENT_ID_RE | Any | — |  | P1-helper |
| `_session_storage_dirs` | 3445-3464 (20) | 2: _canon_path, _ws_path | get_storage, Path | — |  | P1-helper |
| `_broadcast_session_deleted` | 4525-4535 (11) | 1: logger | — | — |  | P1-helper |
| `_delete_session_files` | 3510-3541 (32) | 3: _iter_session_files, _safe_unlink, _session_storage_dirs | get_storage, json | — |  | P1-helper |
| `_disposition_report` | 3657-3678 (22) | 0:  | Session, Any, Dict | — |  | P1-helper |
| `_normalize_session_presence_surface` | 887-889 (3) | 1: _SESSION_PRESENCE_SURFACE_RE | Any | — |  | P1-helper |
| `_validate_session_status_transition` | 383-389 (7) | 2: _can_edit_workspace, _can_manage_workspace | validate_session_status_transition, Any | — |  | P1-helper |
| `export` | 8134-8178 (45) | 3: _disposition_report, _normalize_bpmn_meta, app | dump_yaml, session_to_process_dict, load_seed_glossary, GLOSSARY_SEED… | — |  | P2-handler |
| `create_session` | 3996-4035 (40) | 4: _invalidate_session_caches, _recompute_session, _session_api_dump, app | Session, CreateSessionIn, get_default_org_id, get_storage… | — |  | P2-handler |
| `delete_session_api` | 4539-4566 (28) | 6: _audit_log_safe, _broadcast_session_deleted, _can_delete_workspace_content, _invalidate_session_caches… | request_auth_user, org_role_for_request, get_default_org_id, get_storage… | — |  | P2-handler |
| `export_zip` | 8183-8211 (29) | 2: app, export | get_storage, Response, io, Path… | — |  | P2-handler |
| `get_session` | 4162-4189 (28) | 4: _legacy_load_session_scoped, _session_api_dump, app, logger | cache_get_json, cache_set_json, session_open_cache_key, session_open_cache_ttl_sec… | — | DEAD(first) | P2-handler |
| `get_session` | 10591-10618 (28) | 4: _legacy_load_session_scoped, _session_api_dump, app, logger | cache_get_json, cache_set_json, session_open_cache_key, session_open_cache_ttl_sec… | — | active(last) | P2-handler |
| `leave_session_presence_api` | 4247-4281 (35) | 5: _SESSION_PRESENCE_TTL_SECONDS, _legacy_load_session_scoped, _normalize_session_presence_client_id, _user_is_member_of_org… | request_active_org_id, request_user_meta, SessionPresenceTouchIn, get_default_org_id… | — | DEAD(first) | P2-handler |
| `leave_session_presence_api` | 10676-10710 (35) | 5: _SESSION_PRESENCE_TTL_SECONDS, _legacy_load_session_scoped, _normalize_session_presence_client_id, _user_is_member_of_org… | request_active_org_id, request_user_meta, SessionPresenceTouchIn, get_default_org_id… | — | active(last) | P2-handler |
| `list_sessions` | 4146-4157 (12) | 2: _scope_allowed_project_ids, app | request_active_org_id, project_scope_for_request, get_default_org_id, get_storage… | — | DEAD(first) | P2-handler |
| `list_sessions` | 10575-10586 (12) | 2: _scope_allowed_project_ids, app | request_active_org_id, project_scope_for_request, get_default_org_id, get_storage… | — | active(last) | P2-handler |
| `patch_session` | 4316-4479 (164) | 18: _DIAGRAM_TRUTH_PATCH_KEYS, _audit_log_safe, _can_edit_workspace, _capture_persisted_auto_pass_failed_state… | request_auth_user, UpdateSessionIn, org_role_for_request, get_default_org_id… | — |  | P2-handler |
| `put_session` | 4571-4667 (97) | 17: _DIAGRAM_TRUTH_PUT_CHANGED_KEYS, _audit_log_safe, _capture_persisted_auto_pass_failed_state, _collect_sequence_flow_meta… | request_auth_user, UpdateSessionIn, get_default_org_id, get_storage… | — |  | P2-handler |
| `recompute` | 4671-4682 (12) | 2: _recompute_session, app | refresh_analytics_for_session, get_default_org_id, get_storage, Any… | — |  | P2-handler |
| `session_bpmn_restore` | 7932-8079 (148) | 17: _audit_log_safe, _build_bpmn_version_author, _can_edit_workspace, _collect_sequence_flow_meta… | extract_camunda_extensions_from_bpmn_xml, request_auth_user, acquire_session_lock, BpmnRestoreIn… | — |  | P2-handler |
| `session_overlays` | 7514-7519 (6) | 2: _legacy_load_session_scoped, app | HTTPException, Request, JSONResponse | — |  | P2-handler |
| `touch_session_presence_api` | 4194-4242 (49) | 6: _SESSION_PRESENCE_TTL_SECONDS, _legacy_load_session_scoped, _normalize_session_presence_client_id, _normalize_session_presence_surface… | request_active_org_id, request_user_meta, SessionPresenceTouchIn, get_default_org_id… | — | DEAD(first) | P2-handler |
| `touch_session_presence_api` | 10623-10671 (49) | 6: _SESSION_PRESENCE_TTL_SECONDS, _legacy_load_session_scoped, _normalize_session_presence_client_id, _normalize_session_presence_surface… | request_active_org_id, request_user_meta, SessionPresenceTouchIn, get_default_org_id… | — | active(last) | P2-handler |

### sessions-bpmn (32 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `_resolve_actor_label_from_user` | 951-957 (7) | 0:  | Any | — |  | P0-pure |
| `_to_epoch_ms` | 272-282 (11) | 0:  | Any | — |  | P0-pure |
| `_normalize_flow_meta_r_source` | 2103-2107 (5) | 0:  | Any | — |  | P0-pure |
| `_normalize_r_flow_tier` | 2096-2100 (5) | 0:  | Any, Optional | — |  | P0-pure |
| `_coerce_bool` | 6876-6886 (11) | 0:  | Any | — | DEAD(first) | P0-pure |
| `_coerce_bool` | 10933-10940 (8) | 0:  | Any | — | active(last) | P0-pure |
| `_is_legacy_seed_bpmn` | 522-554 (33) | 0:  | Dict, ElementTree | — |  | P0-pure |
| `_mark_diagram_truth_write` | 1033-1053 (21) | 0:  | Session, time, List | — |  | P1-helper |
| `_normalize_bpmn_meta` | 3139-3216 (78) | 7: _normalize_auto_pass_v1, _normalize_drawio_meta, _normalize_flow_meta_entry, _normalize_hybrid_layer_map… | json, Any, Dict, Optional… | — |  | P1-helper |
| `_normalize_flow_meta_entry` | 2110-2139 (30) | 3: _entry_to_flow_tier, _normalize_flow_meta_r_source, _normalize_r_flow_tier | Any, Dict, Optional | — |  | P1-helper |
| `_build_bpmn_version_author` | 306-338 (33) | 2: _clean_name, _looks_like_technical_actor_id | find_user_by_id, Any, Dict | — |  | P1-helper |
| `_create_bpmn_revision_snapshot_if_needed` | 7553-7600 (48) | 1: _latest_user_facing_bpmn_version | Session, Storage, session_version_payload_hash, Any… | — |  | P1-helper |
| `_overlay_interview_annotations_on_bpmn_xml` | 557-799 (243) | 1: index | _collect_interview_comments, Session, re, Any… | — |  | P1-helper |
| `_session_graph_fingerprint` | 3386-3432 (47) | 0:  | Session, hashlib, json | — |  | P1-helper |
| `_to_epoch_iso` | 285-292 (8) | 1: _to_epoch_ms | datetime, timezone, Any | — |  | P1-helper |
| `_diagram_state_conflict_payload` | 976-990 (15) | 1: _build_server_last_write_payload | Session, Any, Dict, Optional | — |  | P1-helper |
| `_latest_user_facing_bpmn_version` | 7540-7550 (11) | 1: _bpmn_version_row_is_user_facing | Storage, Any, Dict, Optional | — |  | P1-helper |
| `_normalize_flow_tier` | 2087-2093 (7) | 1: _primitive_path_value | Any, Optional | — |  | P1-helper |
| `_normalize_node_path_entry` | 2186-2203 (18) | 4: _normalize_node_path_code, _normalize_node_path_source, _normalize_node_paths, _normalize_sequence_key | Any, Dict, Optional | — |  | P1-helper |
| `_normalize_robot_meta_v1` | 2246-2289 (44) | 5: _robot_meta_as_non_negative_int, _robot_meta_as_nullable_non_negative_int, _robot_meta_as_nullable_text, _robot_meta_as_text… | Any, Dict, Optional | — |  | P1-helper |
| `_bpmn_version_row_is_user_facing` | 7534-7537 (4) | 1: _USER_FACING_BPMN_VERSION_ACTIONS | Any, Dict | — |  | P1-helper |
| `_count_bpmn_activities` | 2033-2046 (14) | 1: _ln_tag | ElementTree | — |  | P1-helper |
| `_infer_and_merge_rtiers` | 6892-7038 (147) | 7: _R_TIER_ALGO_VERSION, _collect_sequence_flow_meta, _enforce_gateway_tier_constraints, _normalize_bpmn_meta… | Session, infer_rtiers, parse_bpmn_sequence_graph, resolve_inference_inputs… | — |  | P1-helper |
| `_wired_fetch_session_bpmn` | 10439-10441 (3) | 1: _legacy_load_session_scoped | — | — |  | P1-helper |
| `session_bpmn_clear` | 8084-8130 (47) | 7: _invalidate_session_caches, _mark_diagram_truth_write, _normalize_bpmn_meta, _require_diagram_cas_or_409… | request_auth_user, get_default_org_id, get_storage, Request… | — |  | P2-handler |
| `session_bpmn_export` | 7395-7509 (115) | 8: _create_bpmn_revision_snapshot_if_needed, _is_legacy_seed_bpmn, _legacy_load_session_scoped, _mark_diagram_truth_write… | request_auth_user, get_overlay, get_storage, Query… | — |  | P2-handler |
| `session_bpmn_meta_get` | 7043-7066 (24) | 4: _collect_sequence_flow_meta, _enforce_gateway_tier_constraints, _normalize_bpmn_meta, app | get_storage, Any, Dict | — |  | P2-handler |
| `session_bpmn_meta_infer_rtiers` | 7352-7386 (35) | 7: _infer_and_merge_rtiers, _mark_diagram_truth_write, _normalize_bpmn_meta, _require_diagram_cas_or_409… | request_auth_user, InferRtiersIn, get_storage, Request… | — |  | P2-handler |
| `session_bpmn_meta_patch` | 7071-7347 (277) | 15: _coerce_bool, _collect_sequence_flow_meta, _enforce_gateway_tier_constraints, _mark_diagram_truth_write… | request_auth_user, BpmnMetaPatchIn, get_storage, Request… | — |  | P2-handler |
| `session_bpmn_save` | 7605-7759 (155) | 15: _can_edit_workspace, _capture_persisted_auto_pass_failed_state, _collect_sequence_flow_meta, _count_bpmn_activities… | request_auth_user, invalidate_overlay, acquire_session_lock, BpmnXmlIn… | — |  | P2-handler |
| `session_bpmn_version_detail` | 7888-7927 (40) | 5: _build_bpmn_version_author, _legacy_load_session_scoped, _to_epoch_iso, _to_epoch_ms… | get_storage, Request, Any, Dict | — |  | P2-handler |
| `session_bpmn_versions_list` | 7764-7883 (120) | 8: _USER_FACING_BPMN_VERSION_ACTIONS, _build_bpmn_version_author, _latest_user_facing_bpmn_version, _legacy_load_session_scoped… | get_storage, session_version_payload_hash, Query, Request… | — |  | P2-handler |

### sessions-graph (17 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `_edge_identity` | 6061-6062 (2) | 0:  | Edge | — |  | P0-pure |
| `_normalize_node_path_source` | 2179-2183 (5) | 0:  | Any | — |  | P0-pure |
| `_resolve_base_diagram_state_version` | 919-948 (30) | 1: _to_non_negative_int | Request, Any, Dict, Optional | — |  | P1-helper |
| `_require_diagram_cas_or_409` | 993-1030 (38) | 1: _diagram_state_conflict_payload | Session, HTTPException, Request, os… | — |  | P1-helper |
| `_normalize_node_path_code` | 2142-2148 (7) | 1: _primitive_path_value | Any, Optional | — |  | P1-helper |
| `_apply_target_to_node` | 6475-6594 (120) | 7: _ensure_dict_at_path, _ensure_loss_dict, _map_disposition_answer, _normalize_choice… | Node, Session | — |  | P1-helper |
| `_edge_diff` | 5898-5910 (13) | 1: _edge_key | Any, Dict | — |  | P1-helper |
| `_edge_key` | 5862-5866 (5) | 1: _safe_model_dump | Any | — |  | P1-helper |
| `_normalize_node_paths` | 2151-2163 (13) | 1: _normalize_node_path_code | Any, List, Set | — |  | P1-helper |
| `add_edge` | 6801-6836 (36) | 6: _mark_diagram_truth_write, _recompute_session, _require_diagram_cas_or_409, _resolve_actor_context… | Edge, CreateEdgeIn, get_storage, Request… | — | DEAD(first) | P2-handler |
| `add_edge` | 10858-10893 (36) | 6: _mark_diagram_truth_write, _recompute_session, _require_diagram_cas_or_409, _resolve_actor_context… | Edge, CreateEdgeIn, get_storage, Request… | — | active(last) | P2-handler |
| `add_node` | 6718-6763 (46) | 6: _mark_diagram_truth_write, _recompute_session, _require_diagram_cas_or_409, _resolve_actor_context… | Node, CreateNodeIn, get_storage, Request… | — | DEAD(first) | P2-handler |
| `add_node` | 10775-10820 (46) | 6: _mark_diagram_truth_write, _recompute_session, _require_diagram_cas_or_409, _resolve_actor_context… | Node, CreateNodeIn, get_storage, Request… | — | active(last) | P2-handler |
| `delete_edge` | 6841-6873 (33) | 6: _mark_diagram_truth_write, _recompute_session, _require_diagram_cas_or_409, _resolve_actor_context… | CreateEdgeIn, get_storage, Request, Any… | — | DEAD(first) | P2-handler |
| `delete_edge` | 10898-10930 (33) | 6: _mark_diagram_truth_write, _recompute_session, _require_diagram_cas_or_409, _resolve_actor_context… | CreateEdgeIn, get_storage, Request, Any… | — | active(last) | P2-handler |
| `delete_node` | 6768-6796 (29) | 6: _mark_diagram_truth_write, _recompute_session, _require_diagram_cas_or_409, _resolve_actor_context… | get_storage, Request, Any, Dict | — | DEAD(first) | P2-handler |
| `delete_node` | 10825-10853 (29) | 6: _mark_diagram_truth_write, _recompute_session, _require_diagram_cas_or_409, _resolve_actor_context… | get_storage, Request, Any, Dict | — | active(last) | P2-handler |

### sessions-notes-ai (38 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `_merge_nodes` | 3584-3626 (43) | 0:  | Node, List | — |  | P0-pure |
| `_redact_notes_preview_message` | 5926-5934 (9) | 0:  | Any | — |  | P0-pure |
| `_llm_question_status_to_interview` | 4717-4723 (7) | 0:  | Any | — |  | P0-pure |
| `_notes_apply_flag` | 6015-6022 (8) | 0:  | NotesExtractionApplyIn | — |  | P0-pure |
| `_recompute_session` | 3681-3717 (37) | 1: _merge_question_states | compute_analytics, render_mermaid, Session, load_seed_glossary… | — |  | P1-helper |
| `_resolve_actor_context` | 1056-1061 (6) | 1: _resolve_actor_label_from_user | request_auth_user, Request, Any, Dict… | — |  | P1-helper |
| `_preserve_current_interview_analysis_before_save` | 1177-1199 (23) | 1: _merge_interview_analysis_namespace | Session, Storage, Optional | — |  | P1-helper |
| `_ai_questions_active_prompt` | 4862-4879 (18) | 0:  | get_active_prompt, Any, Dict | — |  | P1-helper |
| `_collect_node_llm_questions` | 4686-4695 (10) | 0:  | Question, Session, List | — |  | P1-helper |
| `_merge_interview_analysis_namespace` | 1133-1146 (14) | 0:  | copy, Any, Dict, Optional | — |  | P1-helper |
| `_ai_questions_actor_user_id` | 4849-4859 (11) | 1: _resolve_actor_context | Session, Request | — |  | P1-helper |
| `_ai_questions_module_id` | 4833-4837 (5) | 1: _AI_QUESTIONS_ELEMENT_MODES | AiQuestionsIn | — |  | P1-helper |
| `_ai_questions_scope` | 4840-4846 (7) | 0:  | Session, get_default_org_id, Dict | — |  | P1-helper |
| `_apply_answer` | 6597-6613 (17) | 2: _apply_target_to_node, answer | Session, AnswerIn | — |  | P1-helper |
| `_build_session_tldr_payload` | 8923-8980 (58) | 2: _extract_report_summary_text, _get_report_versions_by_path | Any, Dict, List, Tuple | — |  | P1-helper |
| `_entity_list_signature` | 6110-6115 (6) | 1: _safe_model_dump_list | json, Any | — |  | P1-helper |
| `_map_disposition_answer` | 6386-6402 (17) | 1: answer | Optional | — |  | P1-helper |
| `_merge_question_states` | 3629-3654 (26) | 1: answer | — | — |  | P1-helper |
| `_merge_selected_edges` | 6065-6077 (13) | 1: _edge_identity | Edge, Any, Dict, List | — |  | P1-helper |
| `_merge_selected_nodes` | 6080-6107 (28) | 1: _merge_nodes | Node, Any, List, Set | — |  | P1-helper |
| `_notes_apply_require_cas` | 6025-6058 (34) | 2: _diagram_state_conflict_payload, _resolve_base_diagram_state_version | Session, NotesExtractionApplyIn, HTTPException, Request | — |  | P1-helper |
| `_notes_preview_response_from_extraction` | 5947-6012 (66) | 7: _NOTES_EXTRACTION_MODULE_ID, _edge_diff, _list_diff_by_id, _merge_nodes… | Edge, Node, Session, norm_roles… | — |  | P1-helper |
| `_notes_preview_scope` | 5808-5814 (7) | 0:  | Session, get_default_org_id, Dict, Optional | — |  | P1-helper |
| `_prune_node_llm_questions` | 4698-4714 (17) | 0:  | Question, Session, List | — |  | P1-helper |
| `_record_ai_questions_execution_safe` | 4882-4886 (5) | 0:  | record_ai_execution, logging, Any | — |  | P1-helper |
| `_record_notes_preview_execution_safe` | 5817-5821 (5) | 0:  | record_ai_execution, logging, Any | — |  | P1-helper |
| `_record_path_report_ai_execution_safe` | 1607-1611 (5) | 0:  | record_ai_execution, logging, Any | — |  | P1-helper |
| `_sanitize_notes_preview_warnings` | 5937-5944 (8) | 1: _redact_notes_preview_message | Any, Dict, List | — |  | P1-helper |
| `_sync_interview_ai_questions_for_node` | 4726-4827 (102) | 2: _collect_node_llm_questions, _llm_question_status_to_interview | Session, Any, Dict, List… | — |  | P1-helper |
| `answer` | 6618-6647 (30) | 7: _apply_answer, _mark_diagram_truth_write, _recompute_session, _require_diagram_cas_or_409… | AnswerIn, get_storage, Request, Any… | — |  | P2-handler |
| `ai_questions` | 4891-5250 (360) | 12: _ai_questions_active_prompt, _ai_questions_actor_user_id, _ai_questions_module_id, _ai_questions_scope… | check_ai_rate_limit, AiQuestionsIn, load_llm_settings, get_storage… | — |  | P2-handler |
| `answer_v2` | 6652-6653 (2) | 2: answer, app | AnswerIn, Request, Any, Dict | — |  | P2-handler |
| `get_session_tldr` | 4286-4296 (11) | 3: _build_session_tldr_payload, _legacy_load_session_scoped, app | cache_get_json, cache_set_json, tldr_cache_key, Request… | — |  | P2-handler |
| `patch_node` | 6658-6713 (56) | 6: _mark_diagram_truth_write, _recompute_session, _require_diagram_cas_or_409, _resolve_actor_context… | NodePatchIn, get_storage, Request, Any… | — | DEAD(first) | P2-handler |
| `patch_node` | 10715-10770 (56) | 6: _mark_diagram_truth_write, _recompute_session, _require_diagram_cas_or_409, _resolve_actor_context… | NodePatchIn, get_storage, Request, Any… | — | active(last) | P2-handler |
| `post_notes` | 5741-5802 (62) | 7: _mark_diagram_truth_write, _merge_nodes, _recompute_session, _require_diagram_cas_or_409… | Edge, Node, NotesIn, load_llm_settings… | — |  | P2-handler |
| `post_notes_extraction_apply` | 6120-6229 (110) | 11: _NOTES_EXTRACTION_MODULE_ID, _entity_list_signature, _legacy_load_session_scoped, _mark_diagram_truth_write… | Edge, Node, Question, NotesExtractionApplyIn… | — |  | P2-handler |
| `post_notes_extraction_preview` | 6234-6383 (150) | 10: _NOTES_EXTRACTION_MODULE_ID, _legacy_load_session_scoped, _notes_preview_response_from_extraction, _notes_preview_scope… | check_ai_rate_limit, hash_ai_input, NotesExtractionPreviewIn, load_llm_settings… | — |  | P2-handler |

### reports-analytics (44 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `_is_role_allowed` | 8300-8302 (3) | 0:  | Any, Set | — |  | P0-pure |
| `_set_latest_path_report_pointer` | 1213-1242 (30) | 0:  | Session, Any | — |  | P0-pure |
| `_report_version_detail_payload` | 5269-5294 (26) | 0:  | Any, Dict | — |  | P0-pure |
| `_report_version_summary` | 5253-5266 (14) | 0:  | Any, Dict | — |  | P0-pure |
| `_clear_latest_path_report_pointer` | 1245-1255 (11) | 0:  | Session | — |  | P0-pure |
| `_is_retryable_report_generation_error` | 1270-1285 (16) | 0:  | — | — |  | P0-pure |
| `_get_report_versions_by_path` | 1103-1124 (22) | 0:  | ReportVersion, Any, Dict, List | — |  | P1-helper |
| `_resolve_report_scope` | 5297-5307 (11) | 0:  | request_active_org_id, Request, Optional, Tuple | — |  | P1-helper |
| `_session_access_from_request` | 8264-8284 (21) | 0:  | enterprise_error, request_active_org_id, Session, project_scope_for_request… | — |  | P1-helper |
| `_set_report_versions_by_path` | 1127-1130 (4) | 0:  | Session, Any, Dict, List | — |  | P1-helper |
| `_mark_stale_running_reports` | 1334-1376 (43) | 5: _PATH_REPORT_STALE_RUNNING_SEC, _get_report_versions_by_path, _is_report_active, _set_latest_path_report_pointer… | Session, time, Optional | — |  | P1-helper |
| `_accessible_session_ids_for_request` | 8568-8589 (22) | 1: _scope_allowed_project_ids | request_active_org_id, project_scope_for_request, get_default_org_id, get_storage… | — |  | P1-helper |
| `_create_path_report_version_core` | 5310-5429 (120) | 11: _audit_log_safe, _get_report_versions_by_path, _invalidate_session_caches, _next_report_version… | get_or_create_backend_request_id, request_user_meta, ReportVersion, CreatePathReportVersionIn… | — |  | P1-helper |
| `_delete_path_report_version_core` | 5492-5524 (33) | 4: _audit_log_safe, _delete_report_version_row, _invalidate_session_caches, _resolve_report_scope | get_default_org_id, get_storage, HTTPException, Request… | — |  | P1-helper |
| `_delete_report_version_row` | 1425-1469 (45) | 5: _get_report_versions_by_path, _preserve_current_interview_analysis_before_save, _recompute_latest_path_report_pointer, _report_session_lock… | get_storage, Any, Dict, Optional | — |  | P1-helper |
| `_find_report_version_global` | 1884-1914 (31) | 3: _find_report_version, _mark_stale_running_reports, _preserve_current_interview_analysis_before_save | get_storage, Any, Dict, Optional… | — |  | P1-helper |
| `_get_path_report_version_detail_core` | 5462-5489 (28) | 5: _get_report_versions_by_path, _mark_stale_running_reports, _preserve_current_interview_analysis_before_save, _report_version_detail_payload… | get_storage, Request, Any, Dict… | — |  | P1-helper |
| `_list_path_report_versions_core` | 5432-5459 (28) | 5: _get_report_versions_by_path, _mark_stale_running_reports, _preserve_current_interview_analysis_before_save, _report_version_summary… | get_storage, Request, Any, Dict… | — |  | P1-helper |
| `_compact_path_report_payload` | 1288-1331 (44) | 0:  | Any, Dict, List, Tuple | — |  | P1-helper |
| `_delete_report_version_global` | 1472-1504 (33) | 2: _delete_report_version_row, _get_report_versions_by_path | get_storage, Any, Dict, Optional… | — |  | P1-helper |
| `_emit_path_report_domain_anomaly` | 1524-1570 (47) | 1: _path_report_warning_codes | capture_backend_domain_invariant_violation, Any, Dict, Optional | — |  | P1-helper |
| `_extract_report_summary_text` | 8902-8920 (19) | 0:  | Any, Dict, List | — |  | P1-helper |
| `_find_report_version` | 1872-1881 (10) | 1: _get_report_versions_by_path | Session, Any, Dict, Optional | — |  | P1-helper |
| `_is_report_active` | 456-461 (6) | 1: _REPORT_ACTIVE_GUARD | — | — |  | P1-helper |
| `_next_report_version` | 1202-1210 (9) | 0:  | Any, Dict, List | — |  | P1-helper |
| `_patch_report_version_row` | 1379-1422 (44) | 5: _get_report_versions_by_path, _preserve_current_interview_analysis_before_save, _report_session_lock, _set_latest_path_report_pointer… | get_storage, Any, Callable, Dict… | — |  | P1-helper |
| `_path_report_active_prompt` | 1587-1604 (18) | 0:  | get_active_prompt, Any, Dict | — |  | P1-helper |
| `_path_report_scope` | 1573-1584 (12) | 0:  | get_default_org_id, Dict, Optional | — |  | P1-helper |
| `_path_report_warning_codes` | 1507-1521 (15) | 0:  | Any, List, Set | — |  | P1-helper |
| `_recompute_latest_path_report_pointer` | 1258-1267 (10) | 2: _clear_latest_path_report_pointer, _set_latest_path_report_pointer | Session, Any | — |  | P1-helper |
| `_run_path_report_generation_async` | 1614-1821 (208) | 8: _compact_path_report_payload, _emit_path_report_domain_anomaly, _is_retryable_report_generation_error, _patch_report_version_row… | check_ai_rate_limit, load_llm_settings, time, Any… | — |  | P1-helper |
| `_run_path_report_generation_with_capture` | 1824-1869 (46) | 1: _run_path_report_generation_async | capture_backend_async_exception, Any, Dict, Optional | — |  | P1-helper |
| `_set_report_active` | 445-453 (9) | 1: _REPORT_ACTIVE_GUARD | — | — |  | P1-helper |
| `build_org_session_report` | 10141-10176 (36) | 5: _ORG_EDITOR_ROLES, _create_path_report_version_core, _is_role_allowed, _session_access_from_request… | enterprise_error, request_user_meta, CreatePathReportVersionIn, OrgReportBuildIn… | — |  | P2-handler |
| `create_path_report_version` | 5531-5549 (19) | 3: _create_path_report_version_core, _legacy_load_session_scoped, app | CreatePathReportVersionIn, Request, Any, Dict | — |  | P2-handler |
| `delete_org_session_report_version` | 10224-10265 (42) | 6: _ORG_REPORT_DELETE_ROLES, _delete_path_report_version_core, _get_report_versions_by_path, _is_role_allowed… | enterprise_error, request_user_meta, HTTPException, Request | — |  | P2-handler |
| `delete_path_report_version` | 5641-5654 (14) | 3: _delete_path_report_version_core, _legacy_load_session_scoped, app | HTTPException, Request, Response | — |  | P2-handler |
| `delete_report_version` | 5609-5634 (26) | 6: _accessible_session_ids_for_request, _audit_log_safe, _delete_report_version_global, _find_report_version_global… | request_active_org_id, get_default_org_id, HTTPException, Request… | — |  | P2-handler |
| `get_org_session_report_version` | 10181-10219 (39) | 6: _ORG_READ_ROLES, _get_path_report_version_detail_core, _get_report_versions_by_path, _is_role_allowed… | enterprise_error, request_user_meta, Request | — |  | P2-handler |
| `get_path_report_version_detail` | 5591-5604 (14) | 3: _get_path_report_version_detail_core, _legacy_load_session_scoped, app | Request, Any, Dict | — |  | P2-handler |
| `get_report_version` | 5578-5584 (7) | 4: _accessible_session_ids_for_request, _find_report_version_global, _report_version_detail_payload, app | request_active_org_id, Request, Any, Dict | — |  | P2-handler |
| `get_session_analytics` | 4301-4311 (11) | 3: _legacy_load_session_scoped, _recompute_session, app | request_auth_user, get_storage, Request | — |  | P2-handler |
| `list_org_session_report_versions` | 10109-10136 (28) | 5: _ORG_READ_ROLES, _is_role_allowed, _list_path_report_versions_core, _session_access_from_request… | enterprise_error, request_user_meta, project_scope_for_request, Request | — |  | P2-handler |
| `list_path_report_versions` | 5556-5574 (19) | 3: _legacy_load_session_scoped, _list_path_report_versions_core, app | Request, Any, Dict, List | — |  | P2-handler |

### orgs (28 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `_norm_project_sessions_view` | 868-874 (7) | 0:  | Any | — |  | P0-pure |
| `_audit_log_safe` | 8427-8455 (29) | 0:  | request_active_org_id, request_user_meta, append_audit_log, Request… | — |  | P1-helper |
| `_can_manage_workspace` | 354-355 (2) | 1: _practical_role_for_org | Any | — |  | P1-helper |
| `_enterprise_manage_project_members_guard` | 8554-8564 (11) | 3: _ORG_PROJECT_MEMBER_MANAGE_ROLES, _enterprise_require_project_access, _is_role_allowed | enterprise_error, Request, JSONResponse, Any… | — |  | P1-helper |
| `_enterprise_require_project_access` | 8243-8260 (18) | 0:  | enterprise_error, enterprise_require_org_member, project_scope_for_request, Request… | — |  | P1-helper |
| `_request_org_candidates` | 8473-8493 (21) | 0:  | request_user_meta, get_default_org_id, list_user_org_memberships, Request… | — |  | P1-helper |
| `_audit_retention_days` | 8313-8314 (2) | 1: _env_int | — | — |  | P1-helper |
| `_invite_cleanup_keep_days` | 8317-8318 (2) | 1: _env_int | — | — |  | P1-helper |
| `list_org_members_endpoint` | 9436-9446 (11) | 2: _enrich_members_with_email, _is_role_allowed | enterprise_error, request_user_meta, enterprise_require_org_member, list_org_memberships… | — |  | P1-helper |
| `accept_org_invite_endpoint` | 9972-9975 (4) | 2: _accept_org_invite_response, app | OrgInviteAcceptIn, Request | — |  | P2-handler |
| `cleanup_org_audit_endpoint` | 10086-10104 (19) | 4: _ORG_INVITE_MANAGE_ROLES, _audit_log_safe, _audit_retention_days, app | enterprise_require_org_role, cleanup_audit_log, Request | — |  | P2-handler |
| `cleanup_org_invites_endpoint` | 10011-10029 (19) | 4: _ORG_INVITE_MANAGE_ROLES, _audit_log_safe, _invite_cleanup_keep_days, app | enterprise_require_org_role, cleanup_org_invites, Request | — |  | P2-handler |
| `create_org_endpoint` | 9259-9271 (13) | 2: _ORG_WRITE_ROLES, app | request_auth_user, OrgCreateIn, org_role_for_request, create_org_record… | — |  | P2-handler |
| `create_org_project` | 9495-9521 (27) | 4: _ORG_WRITE_ROLES, _audit_log_safe, _invalidate_workspace_cache_for_org, app | enterprise_error, request_auth_user, CreateProjectIn, enterprise_require_org_role… | — |  | P2-handler |
| `create_org_project_member` | 9652-9678 (27) | 3: _audit_log_safe, _enterprise_manage_project_members_guard, app | enterprise_error, ProjectMemberUpsertIn, get_project_storage, upsert_project_membership… | — |  | P2-handler |
| `create_org_project_session` | 9568-9632 (65) | 6: _ORG_EDITOR_ROLES, _audit_log_safe, _enterprise_require_project_access, _invalidate_session_caches… | enterprise_error, request_auth_user, CreateSessionIn, norm_project_session_mode… | — |  | P2-handler |
| `delete_org_project_member` | 9714-9736 (23) | 3: _audit_log_safe, _enterprise_manage_project_members_guard, app | enterprise_error, delete_project_membership, get_project_storage, Request… | — |  | P2-handler |
| `get_org_git_mirror_endpoint` | 9310-9323 (14) | 3: _ORG_READ_ROLES, _is_role_allowed, app | enterprise_error, request_user_meta, enterprise_require_org_member, get_org_git_mirror_config… | — |  | P2-handler |
| `get_org_project` | 9526-9535 (10) | 2: _enterprise_require_project_access, app | enterprise_error, get_project_storage, Request, Any… | — |  | P2-handler |
| `list_org_audit_endpoint` | 10034-10081 (48) | 4: _ORG_AUDIT_READ_ROLES, _is_role_allowed, _scope_allowed_project_ids, app | find_user_by_id, enterprise_error, request_user_meta, enterprise_require_org_member… | — |  | P2-handler |
| `list_org_project_members` | 9637-9647 (11) | 2: _enterprise_manage_project_members_guard, app | enterprise_error, get_project_storage, list_project_memberships, build_items_count_payload… | — |  | P2-handler |
| `list_org_project_sessions` | 9540-9563 (24) | 4: _enterprise_require_project_access, _norm_project_sessions_view, _session_api_dump, app | enterprise_error, Session, norm_project_session_mode, get_project_storage… | — |  | P2-handler |
| `list_org_projects` | 9479-9490 (12) | 1: app | enterprise_require_org_member, project_scope_for_request, get_project_storage, Request… | — |  | P2-handler |
| `patch_org_endpoint` | 9276-9305 (30) | 6: _ORG_MEMBER_MANAGE_ROLES, _audit_log_safe, _can_manage_workspace, _clean_name… | enterprise_error, request_user_meta, OrgPatchIn, enterprise_require_org_role… | — |  | P2-handler |
| `patch_org_git_mirror_endpoint` | 9328-9394 (67) | 5: _ORG_MEMBER_MANAGE_ROLES, _audit_log_safe, _can_manage_workspace, _invalidate_workspace_cache_for_org… | enterprise_error, request_user_meta, OrgGitMirrorPatchIn, enterprise_require_org_role… | — |  | P2-handler |
| `patch_org_member_endpoint` | 9451-9474 (24) | 3: _ORG_MEMBER_MANAGE_ROLES, _audit_log_safe, app | enterprise_error, OrgMemberPatchIn, enterprise_require_org_role, upsert_org_membership… | — |  | P2-handler |
| `patch_org_project_member` | 9683-9709 (27) | 3: _audit_log_safe, _enterprise_manage_project_members_guard, app | enterprise_error, ProjectMemberPatchIn, get_project_storage, upsert_project_membership… | — |  | P2-handler |
| `validate_org_git_mirror_endpoint` | 9399-9433 (35) | 3: _ORG_MEMBER_MANAGE_ROLES, _can_manage_workspace, app | enterprise_error, request_user_meta, OrgGitMirrorPatchIn, enterprise_require_org_role… | — |  | P2-handler |

### projects (21 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `_clean_name` | 268-269 (2) | 0:  | Any | — |  | P0-pure |
| `_invalidate_tldr_cache_for_session` | 8830-8834 (5) | 0:  | invalidate_tldr_session, Any | — |  | P0-pure |
| `_can_edit_workspace` | 359-360 (2) | 1: _practical_role_for_org | Any | — |  | P1-helper |
| `_invalidate_workspace_cache_for_org` | 8826-8827 (2) | 1: _resolved_org_for_cache | invalidate_workspace_org, Any | — |  | P1-helper |
| `_legacy_load_project_scoped` | 8496-8521 (26) | 2: _request_org_candidates, _scope_allowed_project_ids | request_active_org_id, Project, project_scope_for_request, get_default_org_id… | — |  | P1-helper |
| `_invalidate_explorer_children_for_project` | 8844-8857 (14) | 1: _resolved_org_for_cache | explorer_invalidate_children, get_project_explorer_invalidation_targets, Any | — |  | P1-helper |
| `_can_delete_workspace_content` | 375-376 (2) | 1: _practical_role_for_org | Any | — |  | P1-helper |
| `_project_storage_dirs` | 3466-3485 (20) | 2: _canon_path, _ws_path | get_project_storage, Path | — |  | P1-helper |
| `_workspace_id_for_project` | 8860-8871 (12) | 1: logger | get_project_storage | — |  | P1-helper |
| `_delete_project_files` | 3543-3550 (8) | 2: _project_storage_dirs, _safe_unlink | — | — |  | P1-helper |
| `_delete_sessions_by_project` | 3552-3582 (31) | 2: _delete_session_files, _iter_session_files | get_storage, json | — |  | P1-helper |
| `list_project_sessions` | 10472-10491 (20) | 4: _legacy_load_project_scoped, _norm_project_sessions_view, _session_api_dump, app | Session, norm_project_session_mode, get_storage, HTTPException… | — | active(last) | P1-helper |
| `create_project` | 10287-10327 (41) | 6: _audit_log_safe, _can_edit_workspace, _clean_name, _invalidate_explorer_children_for_project… | request_active_org_id, request_auth_user, CreateProjectIn, org_role_for_request… | — |  | P2-handler |
| `create_project_session` | 4067-4141 (75) | 8: _audit_log_safe, _can_edit_workspace, _clean_name, _invalidate_session_caches… | request_auth_user, CreateSessionIn, org_role_for_request, get_default_org_id… | — | DEAD(first) | P2-handler |
| `create_project_session` | 10497-10570 (74) | 8: _audit_log_safe, _can_edit_workspace, _clean_name, _invalidate_session_caches… | request_auth_user, CreateSessionIn, org_role_for_request, get_default_org_id… | — | active(last) | P2-handler |
| `delete_project_api` | 4484-4521 (38) | 7: _audit_log_safe, _can_delete_workspace_content, _invalidate_explorer_children_for_project, _invalidate_tldr_cache_for_session… | request_auth_user, org_role_for_request, get_default_org_id, get_project_storage… | — |  | P2-handler |
| `get_project` | 10332-10336 (5) | 2: _legacy_load_project_scoped, app | HTTPException, Request | — |  | P2-handler |
| `list_project_sessions` | 4042-4061 (20) | 4: _legacy_load_project_scoped, _norm_project_sessions_view, _session_api_dump, app | Session, norm_project_session_mode, get_storage, HTTPException… | — | DEAD(first) | P2-handler |
| `list_projects` | 10274-10282 (9) | 2: _scope_allowed_project_ids, app | request_active_org_id, project_scope_for_request, get_default_org_id, get_project_storage… | — |  | P2-handler |
| `patch_project` | 10341-10389 (49) | 7: _audit_log_safe, _can_edit_workspace, _clean_name, _invalidate_explorer_children_for_project… | request_auth_user, UpdateProjectIn, org_role_for_request, validate_org_user_assignable… | — |  | P2-handler |
| `put_project` | 10394-10422 (29) | 5: _audit_log_safe, _invalidate_explorer_children_for_project, _invalidate_workspace_cache_for_org, _legacy_load_project_scoped… | request_auth_user, CreateProjectIn, get_default_org_id, get_project_storage… | — |  | P2-handler |

### auth (15 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `_env_int` | 399-405 (7) | 0:  | os | — |  | P0-pure |
| `_request_client_ip` | 506-515 (10) | 0:  | Request | — |  | P0-pure |
| `_auth_error_response` | 518-519 (2) | 0:  | JSONResponse | — |  | P0-pure |
| `_rate_limit_check` | 408-425 (18) | 1: _RATE_LIMIT_LOCK | deque, time | — |  | P1-helper |
| `_set_refresh_cookie` | 465-484 (20) | 0:  | refresh_cookie_samesite, refresh_cookie_secure, Response | — |  | P1-helper |
| `_accept_org_invite_response` | 9919-9967 (49) | 4: _audit_log_safe, _env_int, _rate_limit_check, _request_client_ip | enterprise_error, request_active_org_id, request_client_ip, request_user_email… | — |  | P1-helper |
| `_clear_refresh_cookie` | 488-503 (16) | 0:  | refresh_cookie_samesite, refresh_cookie_secure, Response | — |  | P1-helper |
| `_validate_invite_email_config_on_boot` | 8345-8350 (6) | 2: _invite_email_config_ready, _invite_email_enabled | — | — |  | P1-helper |
| `accept_invite_endpoint` | 9980-9982 (3) | 2: _accept_org_invite_response, app | OrgInviteAcceptIn, Request | — |  | P2-handler |
| `auth_invite_activate` | 3923-3991 (69) | 6: _audit_log_safe, _env_int, _rate_limit_check, _request_client_ip… | AuthError, ensure_invited_identity, find_user_by_email, issue_login_tokens… | — |  | P2-handler |
| `auth_invite_preview` | 3903-3917 (15) | 1: app | find_user_by_email, enterprise_error, InvitePreviewIn, extract_invite_token… | — |  | P2-handler |
| `auth_login` | 3785-3828 (44) | 5: _env_int, _rate_limit_check, _request_client_ip, _set_refresh_cookie… | AuthError, authenticate_user, issue_login_tokens, extract_org_from_headers… | — |  | P2-handler |
| `auth_logout` | 3865-3871 (7) | 2: _clear_refresh_cookie, app | revoke_refresh_from_token, Request, JSONResponse | — |  | P2-handler |
| `auth_me` | 3876-3897 (22) | 1: app | AuthError, user_from_bearer_header, extract_org_from_headers, AuthMeOut… | — |  | P2-handler |
| `auth_refresh` | 3833-3860 (28) | 5: _auth_logger, _clear_refresh_cookie, _request_client_ip, _set_refresh_cookie… | AuthError, rotate_refresh_token, request_client_ip, AuthTokenOut… | — |  | P2-handler |

### overlay-drawio (14 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `_merge_hybrid_layer` | 2747-2752 (6) | 0:  | Any | — | DEAD(first) | P0-pure |
| `_merge_hybrid_layer` | 3256-3261 (6) | 0:  | Any | — | active(last) | P0-pure |
| `_normalize_drawio_meta` | 2549-2734 (186) | 0:  | math, Any, Dict, List… | — |  | P1-helper |
| `_normalize_hybrid_v2` | 2346-2538 (193) | 0:  | math, Any, Dict, List… | — |  | P1-helper |
| `_compute_overlays_json` | 802-856 (55) | 2: _overlay_interview_annotations_on_bpmn_xml, index | Session, Any, ElementTree | — |  | P1-helper |
| `_drawio_payload_size` | 2737-2744 (8) | 1: _normalize_drawio_meta | Any | — |  | P1-helper |
| `_hybrid_v2_payload_size` | 2541-2546 (6) | 1: _normalize_hybrid_v2 | Any | — |  | P1-helper |
| `_merge_drawio` | 2765-2772 (8) | 1: _drawio_payload_size | Any | — | DEAD(first) | P1-helper |
| `_merge_drawio` | 3274-3281 (8) | 1: _drawio_payload_size | Any | — | active(last) | P1-helper |
| `_merge_hybrid_v2` | 2755-2762 (8) | 1: _hybrid_v2_payload_size | Any | — | DEAD(first) | P1-helper |
| `_merge_hybrid_v2` | 3264-3271 (8) | 1: _hybrid_v2_payload_size | Any | — | active(last) | P1-helper |
| `_normalize_hybrid_layer_map` | 2312-2343 (32) | 0:  | math, Any, Dict, Optional… | — |  | P1-helper |
| `_wired_compute_overlays_json` | 10448-10455 (8) | 2: _compute_overlays_json, _legacy_load_session_scoped | Any | — |  | P1-helper |
| `_wired_render_overlay_xml` | 10457-10461 (5) | 2: _legacy_load_session_scoped, _overlay_interview_annotations_on_bpmn_xml | — | — |  | P1-helper |

### admin (15 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `_build_invite_link` | 8360-8365 (6) | 0:  | — | — |  | P0-pure |
| `_pick_current_org_invite` | 9751-9759 (9) | 0:  | Any, Dict | — | active(last) | P0-pure |
| `_invite_email_config` | 8321-8330 (10) | 2: _env_bool, _env_int | os, Any, Dict | — |  | P1-helper |
| `_invite_email_config_ready` | 8333-8342 (10) | 1: _invite_email_config | Any, Dict, List, Tuple | — |  | P1-helper |
| `_invite_email_enabled` | 8305-8306 (2) | 1: _env_bool | — | — |  | P1-helper |
| `_resolve_invite_base_url` | 8353-8357 (5) | 0:  | Request, os, Optional | — |  | P1-helper |
| `_invite_ttl_hours_default` | 8309-8310 (2) | 1: _env_int | — | — |  | P1-helper |
| `_pick_current_org_invite` | 8375-8379 (5) | 0:  | Any, Dict, List, Optional | — | DEAD(first) | P1-helper |
| `_send_org_invite_email` | 8382-8416 (35) | 1: _invite_email_config | datetime, timezone, EmailMessage, smtplib | — |  | P1-helper |
| `_should_reveal_invite_token` | 8419-8424 (6) | 0:  | request_auth_user, Request, os, Optional | — |  | P1-helper |
| `_with_invite_links` | 8368-8372 (5) | 1: _build_invite_link | Any, Dict, List | — | DEAD(first) | P1-helper |
| `_with_invite_links` | 9739-9748 (10) | 1: _build_invite_link | Any, Dict, List | — | active(last) | P1-helper |
| `create_org_invite_endpoint` | 9782-9916 (135) | 14: _ORG_INVITE_MANAGE_ROLES, _audit_log_safe, _build_invite_link, _env_int… | AuthError, ensure_invited_identity, enterprise_error, request_client_ip… | — |  | P2-handler |
| `list_org_invites_endpoint` | 9765-9776 (12) | 6: _ORG_INVITE_MANAGE_ROLES, _invite_email_config, _pick_current_org_invite, _resolve_invite_base_url… | enterprise_require_org_role, list_org_invites, build_items_count_payload, Request | — |  | P2-handler |
| `revoke_org_invite_endpoint` | 9988-10006 (19) | 3: _ORG_INVITE_MANAGE_ROLES, _audit_log_safe, app | enterprise_error, request_user_meta, enterprise_require_org_role, revoke_org_invite… | — |  | P2-handler |

### settings (3 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `get_llm_settings` | 5725-5726 (2) | 1: app | llm_status, Any, Dict | — |  | P2-handler |
| `post_llm_settings` | 5730-5731 (2) | 1: app | LlmSettingsIn, save_llm_settings, Any, Dict | — |  | P2-handler |
| `post_llm_verify` | 5735-5736 (2) | 1: app | LlmVerifyIn, verify_llm_settings, Any, Dict | — |  | P2-handler |

### export (2 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `export_legacy_routes` | 10432-10433 (2) | 0:  | APIRoute, Tuple | — |  | P0-pure |
| `_build_legacy_route_export` | 10425-10426 (2) | 1: app | APIRoute, Tuple | — |  | P1-helper |

### system (19 defs)

| символ | строки | deps(file) | внешние | сайд-эффекты | дубль | приоритет |
|---|---|---|---|---|---|---|
| `_scope_allowed_project_ids` | 8288-8296 (9) | 0:  | Any, Set | — |  | P0-pure |
| `_resolved_org_for_cache` | 8822-8823 (2) | 0:  | get_default_org_id, Any | — |  | P0-pure |
| `_workspace_needs_attention_count` | 8611-8630 (20) | 0:  | Any | — |  | P0-pure |
| `_workspace_parse_owner_ids` | 8592-8598 (7) | 0:  | List | — |  | P0-pure |
| `_enrich_members_with_email` | 8458-8470 (13) | 0:  | find_user_by_id, Any, Dict, List | — |  | P1-helper |
| `_workspace_attention_markers_info` | 8633-8668 (36) | 0:  | json, Any, Dict | — |  | P1-helper |
| `_workspace_collect_dod_artifacts` | 8712-8819 (108) | 3: _as_dict_obj, _as_list_obj, _safe_json_dict | Any, Dict | — |  | P1-helper |
| `_workspace_reports_count` | 8601-8608 (8) | 1: _get_report_versions_by_path | Any | — |  | P1-helper |
| `_workspace_session_status` | 8671-8691 (21) | 1: _normalize_session_status | Any | — |  | P1-helper |
| `index` | 3721-3725 (5) | 1: app | STATIC_DIR, FileResponse | — |  | P2-handler |
| `health` | 3737-3745 (9) | 1: app | runtime_status | — |  | P2-handler |
| `api_health` | 3749-3752 (4) | 2: app, health | — | — |  | P2-handler |
| `api_meta` | 8214-8234 (21) | 1: app | runtime_status, get_runtime_build_meta, Response | — |  | P2-handler |
| `enterprise_workspace` | 8984-9246 (263) | 12: _can_edit_workspace, _can_manage_workspace, _enrich_members_with_email, _resolved_org_for_cache… | find_user_by_id, enterprise_error, request_active_org_id, request_user_meta… | — |  | P2-handler |
| `favicon` | 3729-3733 (5) | 1: app | STATIC_DIR, Response, FileResponse | — |  | P2-handler |
| `glossary_add` | 5714-5720 (7) | 1: app | normalize_kind, slugify_canon, upsert_term, GlossaryAddIn… | — |  | P2-handler |
| `health_overlay_cache` | 3756-3774 (19) | 1: app | JSONResponse | — |  | P2-handler |
| `llm_session_title_questions` | 5658-5710 (53) | 2: _ai_questions_active_prompt, app | seed_existing_ai_prompts, SessionTitleQuestionsIn, load_llm_settings, get_default_org_id… | — |  | P2-handler |
| `metrics_endpoint` | 3778-3780 (3) | 1: app | Response | — |  | P2-handler |