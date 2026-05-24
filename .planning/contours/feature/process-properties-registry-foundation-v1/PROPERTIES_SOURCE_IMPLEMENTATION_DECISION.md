# PROPERTIES_SOURCE_IMPLEMENTATION_DECISION

Статус: `DONE`

Решение: реализован mixed foundation mode.

- `workspace` и `project`: только honest foundation empty state, метрики `—`.
- `session`: read-only rows показываются только если в текущем `draft.bpmn_meta.camunda_extensions_by_element_id` есть Camunda properties/listeners.
- Если строк нет, показывается обязательное сообщение:

```text
Свойства ещё не собраны в реестр. Нужно подключить подтверждённые источники свойств BPMN/оверлеев.
```

Почему так:

- Clean `origin/main` не имеет page-safe workspace/project aggregate для properties.
- Session `draft?.bpmn_meta` уже находится в frontend runtime и читается без backend/schema changes.
- Нормализация выполняется существующим read helper `normalizeCamundaExtensionsMap`.
- Реестр не пишет BPMN XML, session PATCH, backend durable truth или Product Actions.
