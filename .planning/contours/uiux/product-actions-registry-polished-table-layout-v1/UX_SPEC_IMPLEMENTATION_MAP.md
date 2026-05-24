# UX_SPEC_IMPLEMENTATION_MAP

## Назначение

Карта переводит предоставленную UX/UI-спецификацию в bounded implementation scope. Это не требование менять backend, данные или стек.

| UX-блок | Реализация Worker 2 | Проверка Agent 4 |
|---|---|---|
| Header hierarchy | Усилить `Реестр действий с продуктом`, subtitle secondary, `Вернуться` compact navigation, CSV/XLSX utility в header | Title визуально главный; subtitle не конкурирует; export controls не дублируются |
| Metrics dashboard | Compact card/dashboard, values moderate, labels small/uppercase/secondary, subtle semantic color for complete/incomplete | Метрики читаются как единый summary block, не как перегруженная строка |
| Filter grouping | Main filters: `Группа`, `Товар`, `Тип`, `Этап`, `Категория`; secondary: `Роль`, `Полнота`, reset | Группы визуально отделены; applied state заметен; reset спокойный |
| AI block | Label `AI-предложения`, chips `Все видимые`/`Без действий`/`Неполные`, primary CTA `AI: предложить действия`, counter рядом secondary | AI block имеет ясную иерархию; controls не уехали в sources |
| Warning banner | Softer incomplete-row banner above table, quick action `Показать только неполные` if safe | Не выглядит как critical system error; action работает или documented skipped |
| Table | Table-first area, clear header, row separation, hover, consistent status badges, compact tags, muted BPMN code | Таблица доминирует как рабочая область; badges aligned and consistent |
| Checkbox column | Только при безопасной existing selection model support | Нет broken selection, no fake selected rows |
| Row expansion | Только если safe/bounded; иначе extension point/report | Нет half-built detail UI |
| Layout/spacing | Больше воздуха между секциями, card-like section backgrounds, better width usage | Нет одной серой простыни; нет narrow pasted panel feel |
| Export | CSV/XLSX только один раз в header | На странице нет второго export block |

## Stack boundary

Исполнитель обязан использовать существующие React/Vite/CSS/Tailwind паттерны. Если UX spec предполагает другой stack, фактический ProcessMap codebase имеет приоритет.

## Data boundary

Запрещены fake data, fake metrics, backend/schema changes, Product Actions durable truth changes, BPMN XML mutation и AI behavior changes.
