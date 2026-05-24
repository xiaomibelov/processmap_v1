# PROPERTIES_REGISTRY_PLACEHOLDER_REPORT.md

> **Контур:** `feature/process-analytics-hub-and-registry-navigation-v1`  
> **Агент:** Agent 3 / Worker  
> **Дата:** 2026-05-17

---

## Доказательство: «Реестр свойств» — чистый placeholder

### 1. UI-only реализация

В `ProcessAnalyticsHub.jsx` (строки 117–131) карточка «Реестр свойств» представляет собой исключительно статический React-элемент:

```jsx
React.createElement(
  "div",
  { className: "processAnalyticsHubModuleCard", "data-testid": "analytics-hub-module-properties" },
  React.createElement(
    "div",
    { className: "moduleCardHeader" },
    React.createElement("h3", { className: "moduleCardTitle" }, "Реестр свойств"),
    React.createElement("span", { className: "badge muted" }, "Скоро")
  ),
  React.createElement(
    "p",
    { className: "moduleCardDescription" },
    "Свойства BPMN-элементов и процессных объектов."
  )
)
```

- Нет кнопки CTA (в отличие от «Реестр действий»).
- Нет обработчиков onClick.
- Нет props, связанных с загрузкой данных.

### 2. Отсутствие backend API вызовов

Поиск по кодовой базе:
- Нет запросов к `/api/properties-registry` или аналогичным endpoint.
- Нет импортов API-функций для properties registry.
- Нет хуков useEffect с загрузкой данных для properties.

### 3. Отсутствие DB entities / schema changes

`git diff --name-only` не содержит:
- `backend/app/` файлов.
- `backend/tests/` файлов, связанных с properties.
- Миграций Alembic.
- Изменений `models.py` или `schema.py`.

### 4. Отсутствие fake data model во frontend

- Нет массивов с mock-данными properties.
- Нет нормализации/денормализации объектов properties.
- Нет TypeScript/JSDoc типов для Property Registry Item.

### 5. Пользовательская коммуникация

- Бейдж «Скоро» чётко сообщает, что функция находится в разработке.
- Описание карточки объясняет, что будет в модуле, не создавая иллюзию готовности.

---

## Вывод

«Реестр свойств» в Analytics Hub является чистым UI-placeholder без backend-поддержки, fake данных или скрытых API-вызовов. Соответствует non-goals контура.
