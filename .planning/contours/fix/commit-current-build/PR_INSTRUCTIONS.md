# PR Instructions — fix/commit-current-build

## Вручную создайте Pull Request на GitHub

### Шаг 1 — Откройте compare URL

```text
https://github.com/xiaomibelov/processmap_v1/compare/main...fix/bpmn-drilldown-ui
```

### Шаг 2 — Заполните поля

- **base branch:** `main`
- **compare branch:** `fix/bpmn-drilldown-ui`
- **Title:** `fix: текущее состояние билда перед правками subprocess transitions`
- **Description:**

```markdown
## Что зафиксировано

Текущее состояние ветки `fix/bpmn-drilldown-ui` перед началом правок subprocess transitions (Фаза 1).

В коммите только артефакты планирования и handoff-заметки:
- контуры `.planning/contours/audit/*` и `.planning/contours/fix/*`;
- handoff-заметки в `PROCESSMAP/HANDOFF/`;
- decision-заметка в `vault/decisions/`.

Product code не изменён.

## Связанные контуры

- Audit: `.planning/contours/audit/subprocess-transition-audit/`
- Next: `fix/commit-current-build/`
```

### Шаг 3 — Не мержите сразу

Дождитесь review и явного approve перед merge.
