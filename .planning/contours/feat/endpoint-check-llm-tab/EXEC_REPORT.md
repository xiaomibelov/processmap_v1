# EXEC_REPORT: Перенос «Проверки эндпоинтов» в /admin/llm + OpenAPI-регламент

## Цель
- Перенести UI регрессионного сканера эндпоинтов из раздела Quality дашборда в новую вкладку «Проверка эндпоинтов» на странице **Админ / LLM** (`/admin/llm`), рядом с «Генерация тестов».
- Сохранить полный паритет функционала, починить пустой блок результатов при фильтре «Новые» и 0 новых ошибок.
- Внедрить правило «спека обновляется всегда»: `scripts/dump_openapi.py` → `docs/openapi.yaml`, CI `spec-drift` — blocking, `Makefile`/`scripts/update_openapi.sh`, чекбокс в PR-шаблоне.
- Backend API сканера и вкладка «Генерация тестов» не затронуты.

## Git-proof

```text
branch:       feat/endpoint-check-llm-tab
HEAD:         b58dc6c2be73cef5f74ed15ab014da6dc40c1735
origin/main:  307effbb8736e354a50a337be445dd3ee2d6b288
worktree:     /Users/mac/agents_place/kimi_PM/p0-work-worktrees/feat-endpoint-check-llm-tab
```

### Статус рабочей копии

```text
 M .github/workflows/backend-contract.yml
 M AGENTS.md
 M README.md
 M docs/openapi.yaml
 M frontend/src/features/admin/AdminApp.jsx
D  frontend/src/features/admin/components/dashboard/EndpointCheckWidget.jsx
D  frontend/src/features/admin/components/dashboard/EndpointCheckWidget.source.test.mjs
RM frontend/src/features/admin/components/dashboard/endpointCheckModel.js -> frontend/src/features/admin/llm/endpointCheckModel.js
RM frontend/src/features/admin/components/dashboard/endpointCheckModel.test.mjs -> frontend/src/features/admin/llm/endpointCheckModel.test.mjs
 M frontend/src/features/admin/llm/i18n/en.js
 M frontend/src/features/admin/llm/i18n/ru.js
 M frontend/src/features/admin/pages/AdminDashboardPage.endpointCheck.test.mjs
 M frontend/src/features/admin/pages/AdminDashboardPage.jsx
 M frontend/src/features/admin/pages/AdminLlmPage.jsx
 M frontend/src/features/admin/pages/AdminLlmPage.testgen.test.mjs
 M scripts/dump_openapi.py
?? .github/pull_request_template.md
?? Makefile
?? frontend/src/features/admin/components/dashboard/EndpointCheckMovedCard.jsx
?? frontend/src/features/admin/llm/EndpointCheckPanel.jsx
?? frontend/src/features/admin/pages/AdminLlmPage.endpointCheck.test.mjs
?? scripts/update_openapi.sh
```

### Diffstat

```text
 14 files changed, 16282 insertions(+), 14009 deletions(-)
```

(прирост строк в основном за счёт перегенерированного `docs/openapi.yaml`, теперь на русском и OpenAPI 3.0.3)

## Что изменено

### Frontend

| Файл | Что сделано |
|------|-------------|
| `frontend/src/features/admin/llm/EndpointCheckPanel.jsx` | Новая панель вкладки: запуск, поллинг статуса, сводка, таблица с фильтрами, drill-down, история прогонов, empty-state. |
| `frontend/src/features/admin/llm/endpointCheckModel.js` | Перенесена модель из дашборда + дополнены фильтры/сводка/empty-state. |
| `frontend/src/features/admin/llm/endpointCheckModel.test.mjs` | 18 unit-тестов модели. |
| `frontend/src/features/admin/llm/i18n/ru.js`, `en.js` | Локали новой вкладки. |
| `frontend/src/features/admin/pages/AdminLlmPage.jsx` | Добавлена вкладка `endpoint-check` в конец таб-бара; условие `showEndpointCheck`. |
| `frontend/src/features/admin/pages/AdminLlmPage.endpointCheck.test.mjs` | 6 интеграционных тестов вкладки (права, URL, фильтры, запуск, 409, drill-down). |
| `frontend/src/features/admin/pages/AdminLlmPage.testgen.test.mjs` | Рефакторинг существующего теста под общий паттерн табов без изменения логики. |
| `frontend/src/features/admin/AdminApp.jsx` | Право `showEndpointCheck` проброшено в `AdminLlmPage`. |
| `frontend/src/features/admin/components/dashboard/EndpointCheckMovedCard.jsx` | Карточка-заглушка «переехало в Админ / LLM → Проверка эндпоинтов». |
| `frontend/src/features/admin/pages/AdminDashboardPage.jsx` | Убран старый виджет, добавлена `EndpointCheckMovedCard`. |
| `frontend/src/features/admin/pages/AdminDashboardPage.endpointCheck.test.mjs` | Адаптирован под новое поведение. |
| `frontend/src/features/admin/components/dashboard/EndpointCheckWidget.jsx` | **Удалён** — мёртвой копии не осталось. |

### OpenAPI / инфраструктура спеки

| Файл | Что сделано |
|------|-------------|
| `scripts/dump_openapi.py` | Теперь строит спеку через `app.services.api_docs_ru.build_ru_openapi` (русские теги/описания, 3.0.3). |
| `scripts/update_openapi.sh` | `./scripts/update_openapi.sh` — дамп + линт + git diff-stat + summary. |
| `Makefile` | Цель `make openapi`, алиас на `scripts/update_openapi.sh`. |
| `docs/openapi.yaml` | Перегенерирован: 288 paths / 364 operations, включая admin endpoint-check, testgen и прочие изменения из `main`. |
| `.github/workflows/backend-contract.yml` | Джоба `spec-drift` теперь **blocking**; сообщение об ошибке содержит `make openapi` / `./scripts/update_openapi.sh`; breaking-изменения требуют `BREAKING-API-OK`. |
| `AGENTS.md` | Правило: PR с изменением HTTP-эндпоинтов обязан содержать перегенерированный `docs/openapi.yaml`. |
| `README.md` | Раздел «Обновление OpenAPI» с командой `make openapi`. |
| `.github/pull_request_template.md` | Чекбокс «эндпоинты не менялись / спека обновлена». |

## Проверки

### Backend-сканер (API не трогали)

Команда:

```bash
docker run --rm -v "$PWD:/app" -w /app/backend \
  -e FPC_DB_BACKEND=sqlite -e REDIS_REQUIRED=0 \
  processmap_v1-api sh -c \
  'pip install -q -r requirements-dev.txt && python -m pytest tests/test_admin_endpoint_check.py -q'
```

Результат: **19 passed, 20 warnings**.

### Frontend-контур

Команда:

```bash
cd frontend
docker run --rm -v "$PWD:/app" -w /app node:20-alpine \
  sh -c 'node --test src/features/admin/llm/endpointCheckModel.test.mjs src/features/admin/pages/AdminLlmPage.endpointCheck.test.mjs'
```

Результат: **24/24 passed**.

### OpenAPI lint

Команда:

```bash
docker run --rm -v "$PWD:/app" -w /app node:20-alpine \
  sh -c 'npx @redocly/cli lint docs/openapi.yaml'
```

Результат: **0 errors** (`Woohoo! Your API description is valid.`).

### Регрессия фронта

Полный прогон `node --test src/**/*.test.mjs` содержит одно предсуществующее падение, не связанное с контуром:

- `NotesPanel.advanced-badge-semantics.test.mjs` — красный до изменений.

Остальные тесты (включая testgen и dashboard) зелёные.

## Скриншоты

| Что показано | Файл |
|--------------|------|
| Вкладка в общем ряду (начальное состояние) | `/Users/mac/agents_place/kimi_PM/p0-shots/endpoint-check-tab-initial.png` |
| Вкладка после завершения прогона | `/Users/mac/agents_place/kimi_PM/p0-shots/endpoint-check-tab-done.png` |
| Сводка последнего прогона (ok / новые / падают / починились) | `/Users/mac/agents_place/kimi_PM/p0-shots/endpoint-check-with-results.png` |
| Таблица результатов, фильтр «Новые» | `/Users/mac/agents_place/kimi_PM/p0-shots/endpoint-check-results-visible.png` |
| Фильтр «Все» | `/Users/mac/agents_place/kimi_PM/p0-shots/endpoint-check-filter-all.png` |
| Починенный empty-state при 0 новых ошибок | `/Users/mac/agents_place/kimi_PM/p0-shots/endpoint-check-empty-fixed.png` |
| Drill-down по строке ошибки | `/Users/mac/agents_place/kimi_PM/p0-shots/endpoint-check-drilldown.png` |
| История прогонов / деталь прогона | `/Users/mac/agents_place/kimi_PM/p0-shots/endpoint-check-run-detail.png` |
| Вкладка после reload по прямой ссылке | `/Users/mac/agents_place/kimi_PM/p0-shots/endpoint-check-tab-reloaded.png` |

## Чин пустого блока результатов

Добавлена функция `getEndpointCheckEmptyFilterState`:

- Если активен фильтр «Новые» и `new_error === 0` — показывается сообщение «Новых ошибок нет — всё чисто» и кнопка «Показать все».
- Для других пустых фильтров — соответствующий текст.
- Если результатов нет вообще — честное пустое состояние.

Проверено на реальном прогоне с 0 новых ошибок (скриншот `endpoint-check-empty-fixed.png`).

## Права доступа

- Вкладка рендерится только при `showEndpointCheck === true` (admin-право). Без права таба и панели **нет в DOM**.
- Backend-ручки `/api/admin/endpoint-check/*` продолжают отдавать 401/403 без прав (подтверждается существующими тестами `test_admin_endpoint_check.py`).

## URL

Новая вкладка адресуется через query-параметр, как и остальные:

```
/admin/llm?tab=endpoint-check
```

## CI-freshness: демонстрация правила

На временной тестовой ветке добавлен лишний эндпоинт `/api/_demo_openapi_freshness` без обновления `docs/openapi.yaml`. Джоба `spec-drift` упала с сообщением:

```text
OpenAPI drift detected. Run: ./scripts/update_openapi.sh (or make openapi)
```

После отката демо-эндпоинта drift вернулся к 0.

## Риски / ограничения

1. `docs/openapi.yaml` сильно изменился по форме (OpenAPI 3.0.3, русские теги), но не по HTTP-контракту — это следствие нового дампера. Если у потребителей есть diff-автоматика на формате, её стоит предупредить.
2. Предсуществующий красный тест `NotesPanel.advanced-badge-semantics.test.mjs` не чинился в этом контуре.
3. Вкладка открывается по умолчанию с фильтром «Новые»; пустое состояние при 0 новых ошибок теперь информативно, но пользователю нужно один раз кликнуть «Показать все», если он хочет видеть все результаты.

## Готовность

- [x] UI-перенос завершён, старая карточка удалена.
- [x] Функциональный паритет достигнут.
- [x] Пустой блок результатов при 0 новых ошибок починен.
- [x] Права и URL проверены.
- [x] Тесты сканера проходят (backend 19/19, frontend 24/24).
- [x] OpenAPI перегенерирован и проходит lint 0 errors.
- [x] Правило «спека обновляется всегда» задокументировано и внедрено в CI.
- [x] Скриншоты сделаны.

Следующий шаг: code-review и merge по согласованию с владельцем репозитория.
