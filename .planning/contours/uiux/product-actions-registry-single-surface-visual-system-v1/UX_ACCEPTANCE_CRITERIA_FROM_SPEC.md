# UX_ACCEPTANCE_CRITERIA_FROM_SPEC

Контур: `uiux/product-actions-registry-single-surface-visual-system-v1`  
Run ID: `20260518T110633Z-57765`  
Роль: Agent 3 / Worker, independent UX/spec/checklist lane

## Общий принцип

Страница `Реестр действий с продуктом` должна восприниматься как один рабочий инструмент, а не как набор разрозненных карточек. Вся область под app shell живет в одном белом контейнере с внутренними горизонтальными разделителями.

## Acceptance criteria

### 1. Единственная активная поверхность

- На странице нет зависимости от `Аналитика`, Analytics Hub, registry dashboard или `Реестр свойств`.
- Пользователь попадает непосредственно в `Реестр действий с продуктом`.
- В навигации и visible UI нет карточек/ссылок, которые возвращают удаленный Analytics Hub как обязательный промежуточный экран.

### 2. Главный контейнер

- Все содержимое реестра ниже app shell находится внутри одного контейнера.
- Контейнер визуально белый: `#FFFFFF`.
- Допустимы только border `1px solid #E5E7EB`, radius около `12px` и один subtle outer shadow `0 1px 3px rgba(0,0,0,0.06)`.
- Внутри контейнера нет вложенных card surfaces с собственными shadows, colored backgrounds или отдельными декоративными border accents.
- Внутренний rhythm строится через separators `1px solid #F3F4F6`, а не через разрозненные margins и floating blocks.

### 3. Header и exports

- Заголовок: `Реестр действий с продуктом`, примерно `18px`, weight `700`, color `#111827`.
- Subtitle: компактный, примерно `13px`, weight `400`, color `#6B7280`.
- `Вернуться` выглядит как text action с arrow icon и не выглядит как framed button.
- CSV и XLSX доступны только в header area, один раз на странице.
- Export controls compact outline style и не конкурируют с основным AI CTA.

### 4. Scope tabs

- `Workspace`, `Проект`, `Сессия` выглядят как compact tabs.
- Active tab: dark text `#111827` и purple underline около `2px`.
- Inactive tabs: subdued gray text около `#9CA3AF`.
- Scope selector не выглядит как disabled gray card, segmented card stack или набор heavy pills.
- Переключение scope не должно создавать fake counts или fake rows.

### 5. Metrics row

- Метрики представлены text-only row, без metric cards.
- Число примерно `20px / 700`.
- Label примерно `11px`, uppercase, subdued `#9CA3AF`.
- Между метриками есть спокойный горизонтальный gap около `32px`.
- Только метрика `неполных` может использовать orange signal.
- Метрика `полных` не должна быть зеленой.
- `после фильтров` subdued или скрыта/сжата, если значение равно total и не добавляет смысла.

### 6. Filters row

- Фильтры собраны в компактную рабочую строку, где это помещается без overflow.
- Ожидаемые selects: `Группа`, `Товар`, `Тип`, `Этап`, `Категория`, `Роль`, `Полнота`.
- Select height около `34px`, min-width около `120px`, border `#E5E7EB`, radius около `6px`.
- `Сбросить фильтры` выглядит как text link, а не как framed button.
- Фильтры не должны занимать визуальный приоритет выше таблицы.

### 7. AI row

- AI controls находятся внутри основной registry surface, не в sources/data section.
- Нет gradient, filled purple panel, colored card background или decorative glow.
- Label `AI-предложения` uppercase secondary.
- Toggle chips: `Все видимые`, `Без действий`, `Неполные`.
- Primary CTA `AI: предложить действия` остается purple и является единственным сильным purple action.
- Selected counter маленький и вторичный.
- AI row не меняет data truth сама по себе без явного user action.

### 8. Warning row

- Warning для неполных данных выглядит как compact text row с warning icon.
- Текст warning использует orange/brown signal около `#B45309`.
- Нет filled yellow banner, alert card, thick colored left border или heavy background.
- Допустим text link `Показать только неполные`, если он безопасно применяет существующий фильтр completeness.

### 9. Table

- Таблица является главным визуальным объектом страницы.
- Header background `#FAFAFA`, uppercase text `#6B7280`.
- Rows разделены light separators.
- Hover state `#FAFAFA`.
- Нет zebra striping.
- Sticky header допустим только если он не ломает layout, scroll и mobile behavior.
- Status badges - единственные сильные цветные элементы внутри таблицы:
  - `Полная`: background `#ECFDF5`, signal `#10B981`.
  - `Неполная`: background `#FFFBEB`, signal `#F59E0B`.
- Tags compact gray chips.
- BPMN code subdued, около `#9CA3AF`.
- Checkboxes не добавляются, если текущая модель selection не поддерживает их безопасно.

### 10. Empty state

- Empty state не показывает fake rows, fake metrics или mock Product Actions.
- Empty state объясняет отсутствие данных в текущем scope и сохраняет тот же single-container visual system.
- Export и AI controls не должны обещать действие над несуществующими строками.

## Review verdict rule

Agent 4 не должен выдавать pass, если runtime visual state не соответствует этим критериям или если `intended != served` по build-info/worktree/commit.
