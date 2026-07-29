# L10N — русификация интерфейса технолога

- **Дата:** 2026-07-29
- **Ветка:** `feature/e1-e2-technologist-workflow`
- **Механизм (L2):** словари `frontend/src/features/technologist/i18n/{ru,en}.js` + `t()/tf()` из `i18n/index.js`; язык по умолчанию — ru; смена языка — `setLocale()`/смена файла словаря, без правки компонентов.
- **Глоссарий:** `glossary.md` · **Карта строк:** `strings_map.md`

## Скрины экранов (критерий 1)

| Экран | Файл |
| --- | --- |
| Каталог операций (name_ru + код + категории RU) | `screen_catalog.png` |
| Карточка операции («Что проверяется внутри блока») | `screen_catalog_details.png` |
| Конструктор (опубликованный шаблон, палитра RU) | `screen_constructor_published.png` |
| Проверка схемы + проверка по кухням | `screen_check_panel.png` |
| Рецепт: ошибка 1000 сек (RU 422) | `screen_recipe_error_1000.png` |
| Рецепт: вкладка «История» (даты ru-RU) | `screen_recipe_history.png` |
| Пилоты | `screen_pilots.png` |
| Пилот: rollout заблокирован («min_orders не выполнен: 14/20») | `screen_rollout_blocked.png` |
| Аудит действий (фильтры RU) | `screen_audit.png` |
| Импорт BPMN (несоответствия, код мелким) | `screen_import.png` |
| AI-трансформация | `screen_transform.png` |

## Сверка терминов с глоссарием (критерий 6, 20 терминов)

| # | Термин (глоссарий) | Где проверено | Статус |
| --- | --- | --- | --- |
| 1 | Шаблон процесса | screen_recipe_error_1000 («Шаблон процесса»), audit filters | ✅ |
| 2 | Рецепт | screen_recipe_history («Рецепты», «Рецепт (Опубликован)») | ✅ |
| 3 | Каталог операций | screen_catalog | ✅ |
| 4 | Сущности процесса | конструктор, вкладка «Сущности» | ✅ |
| 5 | Развилка | палитра конструктора («Развилка «исключающая»») | ✅ |
| 6 | Черновик | screen_recipe_error_1000 (бейджи), versions panel | ✅ |
| 7 | Опубликован | screen_recipe_history, screen_constructor_published | ✅ |
| 8 | Пилот | screen_rollout_blocked (бейдж «Пилот») | ✅ |
| 9 | Раскатка | screen_rollout_blocked («Раскатать») | ✅ |
| 10 | Снят с эксплуатации | status.retired (versions panel, pilots) | ✅ |
| 11 | Проверка схемы | screen_check_panel | ✅ |
| 12 | Проверка по кухням | screen_check_panel | ✅ |
| 13 | Результаты блока | форма блока («Результаты блока (outputs.*)») | ✅ |
| 14 | История | screen_recipe_history (вкладка) | ✅ |
| 15 | Что проверяется внутри блока | screen_catalog_details | ✅ |
| 16 | Diff версий | screen_recipe_history | ✅ |
| 17 | Журнал изменений / Журнал аудита | screen_recipe_history, screen_audit («Аудит действий») | ✅ |
| 18 | SKU-привязка | screen_rollout_blocked («Пилоты SKU-привязок») | ✅ |
| 19 | Кухня | screen_check_panel, screen_rollout_blocked | ✅ |
| 20 | Отчёт о несоответствиях | screen_import («Несоответствия») | ✅ |

## Верификация

- vitest (technologist): **45 passed (8 файлов)**, включая `i18n/i18n.test.mjs` — тест механизма (критерий 5: `setLocale("en")` → компонент рендерится на английском без правок компонентов).
- `vite build`: ✓ built in ~18s.
- Backend (затронутые L4): `test_recipes`, `test_sku_bindings`, `test_recipe_new_version`, `test_audit_log_e8`, `test_recipe_publish_e7`, `test_template_publish`, `test_role_403` — **34 passed**.
- Миграция 009 (`name_ru`) применена; сид `seed_operations.py` идемпотентен (2 прогона OK).
- Обновлённые ожидания тестов (осознанные изменения строк фичи): формат даты ru-RU, «Снят с эксплуатации», «Рецепт (Черновик)».
- Регрессия `scripts/regression_e1_e4.sh` — **к запуску владельцем** (не запускается внутри трека).

## Отклонения ⚠️

- ⚠️ «Инструкция для технолога ProcessMap.md» владельцем не передана — терминология сверена с глоссарием из брифа L3; при получении файла — сверка по ней (словарь меняется одним файлом).
- ⚠️ Плейсхолдеры нативного `<input type="date">` (`mm/dd/yyyy`) рендерятся браузером по локали браузера, не словарём; у русскоязычного пользователя будет `дд.мм.гггг`. Кастомный датапикер — за скоупом.
- ⚠️ Категории сущностей в черновых сущностях импорта (zones/equipment/containers) оставлены как технические коды v0.3.
- ⚠️ JSON-схемы в карточке операции (parameter_schema, resource_requirements) — технический просмотр, не локализуются.
- Удалён мёртвый код: стабы `features/technologist/{recipe,validation,publish,pilot}` (EN-плейсхолдеры, нигде не смонтированы).
