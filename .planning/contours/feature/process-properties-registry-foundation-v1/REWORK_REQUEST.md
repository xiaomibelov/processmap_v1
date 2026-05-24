# REWORK_REQUEST

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`  
Вердикт: `CHANGES_REQUESTED`

## Что исправить

В `Реестр свойств` session real-data mode фильтр `Тип объекта` сейчас заполняется element id:

```text
Event_1duwp2k
Activity_1c5b5zb
Gateway_08u1e7m
...
```

Это не тип объекта. По UX/source contract `Тип объекта` должен быть backed by `elementType / BPMN type`.

## Требуемое изменение

Выбрать один безопасный вариант:

1. Скрыть/убрать фильтр `Тип объекта` в real-data mode, пока у rows нет доказанного `elementType`.
2. Или добавить доказанный read-only mapping `elementType` из текущего frontend/runtime source и использовать его для фильтра.

Табличная колонка `Объект` может продолжать показывать element id, если это documented object identity.

## Тесты

Добавить/обновить тесты так, чтобы они проверяли:

- `Тип объекта` не получает `Activity_*`, `Event_*`, `Gateway_*` как options;
- если `elementType` отсутствует, фильтр не отображается или честно недоступен;
- остальные фильтры остаются backed by real row fields.

## Повторная проверка Agent 4

После rework нужно снова доказать:

- workspace foundation mode без fake rows/counts;
- session real-data mode с корректными фильтрами;
- no unsafe `PUT/PATCH/DELETE`;
- `Реестр действий` still opens;
- served `/build-info.json` still matches contour/run or updated rework run.
