# PROPERTIES_REGISTRY_UX_REQUIREMENTS

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`

## Analytics

- `Аналитика` остаётся top-level section.
- Внутри есть:
  - `Реестр действий`;
  - `Реестр свойств`;
  - `Дашборды`.
- `Реестр действий` не заменяет Analytics.
- `Реестр свойств` не заменяет Analytics.
- `Дашборды` честно marked future/placeholder.

## Реестр свойств

Header:

- `Реестр свойств`;
- `Сводный список свойств BPMN-элементов и процессных объектов.`;
- `Вернуться`.

Scope:

- `Workspace`;
- `Проект`;
- `Сессия`;
- no fake active state.

Metrics:

- `Источников`;
- `Элементов`;
- `Свойств`;
- `Типов свойств`;
- `После фильтров`.

Use `—` if values are unavailable.

Filters:

- show only filters backed by real data.
- do not create cosmetic filters without mapping.

Table:

- primary object of the page in data mode.
- candidate columns: `Объект`, `Свойство`, `Значение`, `Источник / процесс`, `Тип / группа`, `Статус`.

Foundation mode:

- show page shell.
- show honest message:

```text
Свойства ещё не собраны в реестр. Нужно подключить подтверждённые источники свойств BPMN/оверлеев.
```

- planned groups may be text only and must be marked as planned.

## Visual

- one main white container;
- light separators;
- no gradients;
- no dotted borders;
- no nested cards;
- no colored metric cards;
- typography over decoration.
