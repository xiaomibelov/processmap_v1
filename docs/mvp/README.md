# MVP — финальный сквозной прогон S1–S10

- **Дата:** 2026-07-29 18:09–18:10 UTC
- **Ветка:** `feature/e1-e2-technologist-workflow`
- **Окружение:** демо backend :18011 + frontend :15177 (vite dev), dev-БД `processmap`, alembic head = 008
- **Скринкаст:** `mvp_run.webm` (5.1 МБ, вся сессия целиком, playwright на реальном DOM — ⚠️ согласовано как в E4)
- **Актор:** `mvp_technologist@local` (analyst, демо-персона; оставлен в dev-БД)
- **Сводка машинно:** `mvp_summary.json` — все 10 шагов OK, deviations: none

## Шаги и артефакты

| Шаг | Что | Артефакты |
| --- | --- | --- |
| S1 | Импорт AS IS ИТМО v0.2 (E3) → отчёт: 114 errors, 54 warnings, 30 nodes | `s01_import_as_is.png`, `s01_import_report.json` |
| S2 | AI-трансформация (E3.5, rules+offline-LLM fallback) → 23 решения приняты → в конструктор | `s02_transform_review.png`, `s02_decisions_accepted.png`, `s02_transform_result.json` (trace_map внутри) |
| S3 | Конструктор (E4): блок Check после transfer (связи `Activity_171znbt→Task_1→Event_1pqduoq`), обязательные params, сущности из словарей, target_ref у get_from_storage | `s03_check_block.png`, `s03_entities.png`, `s03_saved_template.json` |
| S4 | Recipe «Борщ» (borsch_mvp) 90 сек; 1000 сек → 422 «вне диапазона 10–600» | `s04_recipe_borsch_90.png`, `s04_validation_1000_rejected.png`, `s04_validation_422.json` |
| S5 | Проверка (E6): dry-run 0 errors; pre-check 3 кухни: 2 ok, 1 warning | `s05_dryrun_precheck.png`, `s05_dryrun.json`, `s05_precheck.json` |
| S6 | Публикация (E7): шаблон v0.1.0 + recipe v1.0.0; BPMN скачан и отрендерен в bpmn-js | `s06_publish_template.{png,json}`, `s06_publish_recipe.{png,json}`, `s06_soups_mvp_v1.0.0.bpmn`, `s06_bpmn_render.png` |
| S7 | Новая версия (E8-gap1): new-version → 90→100 → publish v1.0.1 — чистым API/UI, без служебных UPDATE | `s07_new_version.{png,json}`, `s07_edit_100.png`, `s07_publish_v101.{png,json}`, `s07_recipe_versions.json` |
| S8 | Аудит (E8): цепочка new_version → recipe.update → publish с поимённым diff, автором и датой | `s08_history_chain.png`, `s08_audit_chain.json` |
| S9 | Пилот (E9): кухня №1, критерии 20/0/2% → 14 заказов → rollout 409 («min_orders не выполнен: 14/20») → 20 → rollout на кухни №1–3 | `s09_pilot_14_of_20.png`, `s09_rollout_409.json`, `s09_pilot_20_of_20.png`, `s09_rollout_done.png`, `s09_rollout_ok.json` |
| S10 | Контроль: версии шаблона/recipe не изменились при раскатке; rollout в audit_log; pilot → active | `s10_versions_unchanged.json`, `s10_audit_rollout.txt`, `s10_final_active.png` |

## Критерии приёмки финала

1. **S1–S10 без ручных правок БД/XML** — да; скринкаст `mvp_run.webm` + пошаговые png/JSON выше. Единственная правка БД за весь прогон — нет (миграция 008 применена alembic'ом до старта сценария).
2. **На шаблоне «супы»:** ≥2 recipe (`borsch_mvp` + `borsch_postny_mvp`, оба published), ≥2 опубликованные версии recipe (v1.0.0, v1.0.1), 1 завершённый пилот с раскаткой на 3 кухни — да.
3. **«Кто и когда изменил heat_time_sec»** — экран рецепта → вкладка «История» (1 клик от формы рецепта): `heat_time_sec: 90 → 100 · mvp_technologist@local · 2026-07-29 18:10 · v1.0.1` (см. `s08_history_chain.png`, в скринкасте S8).
4. **Правила отчётности** — артефакты в репо (`docs/mvp/`), секретов нет, фейков нет (все операции через реальный API/UI), stage — только read-only smoke в составе регрессии.
5. **Переносы в v1** — таблица ниже.

## Баги, найденные прогоном и исправленные (отдельные коммиты)

| Баг | Коммит |
| --- | --- |
| E3.5→E4: handoff transform→constructor терял draft (`?from=transform` не обрабатывался) | `9b145520` |
| E9: rollout из UI падал 422 (double-encoded body в Pilots.jsx) | `d8ab422c` |
| Словарь recipe_params: у AI-шаблонов требуются dish_sku_id/qty — рецепт был непубликуем; миграция 008 | `d8ab422c` |
| E8-gap1: не было легального пути «новая версия рецепта» | `51337228` |

## Таблица переносов в v1

| Тема | Статус |
| --- | --- |
| Интеграция метрик с САУ РТК (автосбор) | **v1** — контракт зафиксирован в `docs/e9/metrics_contract.md`, в MVP ручной ввод по брифу |
| Live LLM E35-do1 | **блокируется ключом (PO)**; mock vs live идентичны (25/25, доказано 29.07) |
| Словарь capability кухонь (полное покрытие) | **v1** |
| 220 legacy-падений тестов (~35 файлов) | **отдельный тикет, вне MVP** |
| RecipeSelector/RecipeSidebar — деприкейт или переподключение к E5 API | **ожидает решения PO** |
| Каноническое место process_entities (v0.4) | **v0.4** |
| Smoke на stage после деплоя | **после деплоя** (read-only smoke уже в регрессии) |
| UX: notice после save/publish затирается refreshList (pre-existing, E5) | **backlog** |

## Верификация

- Backend (контурные файлы E1–E9 + gap1): **92 passed** (`test_recipe_new_version`, `test_audit_log_e8`, `test_sku_bindings`, `test_recipe_publish_e7`, `test_bpmn_roundtrip`, `test_template_publish`, `test_recipes`, `test_validation_service`, `test_bpmn_import`, `test_precheck`, `test_role_403`)
- Frontend vitest (technologist): **42 passed (7 файлов)**
- `vite build`: ✓ built in ~18s
- Регрессионный скрипт `scripts/regression_e1_e4.sh`: **готов к запуску владельцем** (по правилу из инцидента >10-мин прогоны не запускаются внутри трека; последний прогон 16 PASS/0 FAIL/1 WARN был на коммите E9, с тех пор добавлены только new-version + 2 фикса + миграция 008, покрытые наборами выше; alembic current==head=008).
