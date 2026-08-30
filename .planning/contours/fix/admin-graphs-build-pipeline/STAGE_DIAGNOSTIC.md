# Stage diagnostic — fix/admin-graphs-build-pipeline

## Дата диагностики

2026-08-30T15:31:24+00:00

## Контейнеры

- `processmap_stage-api-1` — `processmap_stage-api:7edec2c24a7bf994c4f32690c2c838eafd33b7fe` (PR #872 уже задеплоен).
- `processmap_stage-frontend-1` — healthy.

## Состояние `/app/graphify-out/` в API-контейнере

```
/app/graphify-out/
├── snapshots/
│   ├── 20260830-101015-232391/
│   ├── 20260830-101035-254231/
│   └── 20260830-152558-746270/
```

Нет `graph.json` и `.graphify_analysis.json` в корне `/app/graphify-out/`.

## Логи неудачных пересборок

Последняя попытка `20260830-152558-746270` (уже с фиксом PR #872):

```json
{
  "status": "failed",
  "error": "rebuild failed: FileNotFoundError: graph.json not found at /app/graphify-out/graph.json"
}
```

Лог содержит stderr и `exit code=1` — логирование работает корректно.

## Генератор graph.json

Внутри репозитория `processmap_v1` генератора `graph.json` нет. Есть только:

- `tools/graphify-render-graph.py` — рендерер HTML из готового `graph.json`;
- `tools/graphify-semantic-config.json` — конфиг семантических слоёв;
- `tools/graphify-render-graph.test.py` — тесты рендерера.

Генератор `graph.json` / `.graphify_analysis.json` находится в отдельном репозитории/инструменте `graphify` (remote `git@github.com:xiaomibelov/graphify.git`).

## Host checkout

`/opt/processmap/app` на stage-хосте:

- commit: `ffaaa38f45e78a215471b980c8f98b1c333a412d` (до `feature/admin-graphs-tab`);
- `graphify-out/` отсутствует;
- `tools/graphify-render-graph.py` отсутствует.

## Вывод

Stage-контейнер не может самостоятельно произвести `graph.json` — у него нет ни checkout репозитория, ни graphify-CLI. Нужен внешний шаг генерации + публикация артефактов в контейнер.
