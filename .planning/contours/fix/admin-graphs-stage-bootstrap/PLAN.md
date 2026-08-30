# PLAN — fix/admin-graphs-stage-bootstrap

## Контур

- **type:** fix
- **name:** admin-graphs-stage-bootstrap
- **branch:** `fix/admin-graphs-stage-bootstrap`
- **base:** `origin/main` (700eaf02 — уже содержит `feature/admin-graphs-tab`)
- **worktree:** `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/fix-admin-graphs-stage-bootstrap`

## Проблема

На stage (`https://stage.processmap.ru/admin/graphs`) вкладка рендерится, но API отдаёт:

```json
{"error":{"code":"not_found","message":"no current graph snapshot"}}
```

Причина: на stage ни разу не запускалась фоновая пересборка графа, поэтому снапшот отсутствует. Локально снапшоты есть, на stage — нет.

Текущий UX при отсутствии снапшота показывает «Ошибка загрузки данных», что путает пользователя: это нормальное начальное состояние, а не сбой.

## Диагностика stage (SSH deploy@stage.processmap.ru)

### Host (/opt/processmap/app)

- **OS:** Ubuntu 24.04, Python 3.12.3
- **Checkout:** `ffaaa38f` — PR #853 (август 2026), **до** `feature/admin-graphs-tab` (#869).
- `tools/graphify-render-graph.py` — **отсутствует** на host (старый checkout).
- `graphify-out/` — **отсутствует** на host.
- **Write test в /opt/processmap/app — FAILED** (нужен target внутри контейнера, не на host).

### Container (`processmap_stage-api-1`, image `processmap_stage-api:700eaf02...`)

- Backend-код `admin_graphs.py` и роуты `/api/admin/graphs/*` **присутствуют** (образ собран из 700eaf02).
- `/app/tools/` — **отсутствует полностью** в контейнере.
- `/app/graphify-out/` — есть пустая директория `snapshots/`.
- `networkx` — **отсутствует** в Python-окружении контейнера.
- `graphify` CLI / node — **отсутствуют** на host и в контейнере.

### Вывод

Пересборка на stage **невозможна** в текущем виде, потому что:
1. Docker-образ не копирует `tools/` в `/app`.
2. В образе не установлен `networkx`.
3. Graphify CLI (генератор `graph.json`) отсутствует; `graph.json` и `.graphify_analysis.json` нужно принести извне.

Поэтому:
- **Первый снапшот** создаём копированием локальных `graph.json` + `.graphify_analysis.json` + запуском `graphify-render-graph.py` внутри контейнера (или копируем уже готовый `graph.html`).
- **Для будущих пересборок** чиним Dockerfile: копируем `tools/graphify-render-graph.py` + `tools/graphify-semantic-config.json` и ставим `networkx`.

## Цель

1. Сделать так, чтобы на stage появился первый рабочий снапшот графа.
2. Улучшить UX empty state: при отсутствии снапшота показывать нейтральное состояние «Граф ещё не собран» с кнопкой «Пересобрать граф» и подсказкой о длительности.
3. Ошибку показывать только при реальных сбоях (5xx, таймаут пересборки).
4. Сохранить 403 для не-admin.

## В скоупе

- Диагностика stage-окружения (выполнена).
- Исправление Dockerfile: включить `tools/graphify-render-graph.py`, `tools/graphify-semantic-config.json`, зависимость `networkx`.
- Уточнение пути к скрипту в `backend/app/admin_graphs.py` для container layout (`/app/tools/...`).
- Первый снапшот на stage: seed из локальных артефактов.
- UX empty state для `/admin/graphs`.
- Обновление i18n-ключей (ru).
- Backend/frontend тесты.
- OpenAPI regen (если меняются роуты/ответы).
- PR на русском, deploy на stage и merge — только по явному approve.

## Вне скоупа

- Переход с iframe на нативный компонент (это future work из `feature/admin-graphs-tab`).
- Изменение авторизации/ролей админки.
- Полноценный graphify CLI внутри образа (дорого и не нужно для bootstrap; достаточно render-script + input artifacts).

## План выполнения

### Phase 1 — Диагностика stage (✅ выполнена)

Результаты см. выше. Зафиксированы в этом PLAN.md.

### Phase 2 — Исправление сборки/деплоя

**Файлы:**
- `backend/requirements.txt` — добавить `networkx>=3.0`.
- `Dockerfile` — добавить `COPY tools/graphify-render-graph.py tools/graphify-semantic-config.json /app/tools/`.
- `backend/app/admin_graphs.py` — упростить/усилить поиск скрипта: пробовать `/app/tools/graphify-render-graph.py`, fallback рядом с модулем.

**Проверка локально:**
```bash
docker build -t processmap_test_api -f Dockerfile .
docker run --rm processmap_test_api ls -la /app/tools/
docker run --rm processmap_test_api python3 -c "import networkx; print('ok')"
```

### Phase 3 — Первый снапшот на stage

**Вариант A (предпочтительный):** после merge и deploy на stage запустить пересборку через UI/API.

**Вариант B (fallback, используем сейчас):** залить локальный снапшот как initial snapshot:
1. Взять свежие `graph.json` и `.graphify_analysis.json` из `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/feature-admin-graphs-tab/graphify-out/` (дата 2026-08-30).
2. Скопировать их в контейнер `processmap_stage-api-1` в `/app/graphify-out/`.
3. Запустить внутри контейнера:
   ```bash
   python3 /app/tools/graphify-render-graph.py --graph-dir /app/graphify-out --output /app/graphify-out/snapshots/20260830-000000-000000/graph.html
   ```
4. Создать `meta.json` и symlink `current`.

**Решение и причина выбора варианта зафиксировать в `EXEC_REPORT.md`.**

### Phase 4 — UX empty state

**Файлы:**
- `frontend/src/features/admin/pages/AdminGraphsPage.jsx`
- `frontend/src/shared/i18n/ru.js`

**Изменения:**
- Если `data?.current == null` и `error == ""` и не идёт пересборка — показывать empty state:
  - Заголовок: «Граф ещё не собран»
  - Текст: «Нажмите «Пересобрать граф», чтобы собрать первый снапшот. Процесс занимает до 10 минут.»
  - Кнопка «Пересобрать граф».
- Если `error != ""` — показывать ошибку как сейчас.
- Если `rebuilding` — показывать статус пересборки.

### Phase 5 — Проверки

1. Локально:
   - `backend/tests/test_admin_graphs.py` — 12/12 OK.
   - `frontend/src/features/admin/pages/AdminGraphsPage.smoke.test.jsx` — 7/7 OK.
   - `./scripts/update_openapi.sh` — 0 errors.
   - Docker build: `/app/tools/` и `networkx` на месте.
2. На stage после deploy:
   - `/admin/graphs` показывает empty state при отсутствии снапшота.
   - Нажатие «Пересобрать граф» запускает фоновую задачу и отрабатывает до `success`.
   - После завершения вьювер рендерит граф, аналитика отдаёт данные.
   - Не-admin получает 403 на `/admin/graphs` и на `/api/admin/graphs/*`.

## Риски / блокеры

- **Dockerfile-изменения касаются продовой сборки.** Нужно убедиться, что build остаётся стабильным и не увеличивается критично.
- **Graphify CLI отсутствует на stage.** Пересборка будет работать только поверх уже существующего `graph.json`/`.graphify_analysis.json`. Для обновления графа от актуального checkout нужен внешний graphify-шаг (CI или ручной).
- **Host checkout отстаёт от main.** Stage-деплой, вероятно, идёт через CI/workflow, а не через host checkout. Это drift, который выходит за рамки контура, но отмечен в диагностике.

## Acceptance criteria

- [ ] Stage-диагностика задокументирована в `EXEC_REPORT.md`.
- [ ] Dockerfile копирует `tools/graphify-render-graph.py` + `tools/graphify-semantic-config.json`.
- [ ] `networkx` добавлен в `backend/requirements.txt`.
- [ ] `backend/app/admin_graphs.py` корректно находит скрипт в container layout.
- [ ] На stage есть текущий снапшот (через пересборку после deploy или seed).
- [ ] `/admin/graphs` при отсутствии снапшота показывает нейтральный empty state с кнопкой пересборки.
- [ ] Ошибки показываются только при реальных сбоях.
- [ ] 403 для не-admin сохраняется.
- [ ] Все backend/frontend тесты проходят.
- [ ] `docs/openapi.yaml` актуален.
- [ ] PR на русском создан; merge/deploy только по явному approve.

## Артефакты

- `.planning/contours/fix/admin-graphs-stage-bootstrap/PLAN.md`
- `.planning/contours/fix/admin-graphs-stage-bootstrap/EXEC_REPORT.md`
- `.planning/contours/fix/admin-graphs-stage-bootstrap/REVIEW_REPORT.md`
- `.planning/contours/fix/admin-graphs-stage-bootstrap/STATE.json`
- Mirror в Obsidian
