# SECTION_SEPARATION_CHECKLIST

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`

## Цель

Зафиксировать проверяемое значение «таблица реестра и Источники данных — две разные секции».

## Таблица реестра

Таблица считается основной секцией, если:

- [ ] она расположена перед sources section;
- [ ] занимает самый крупный content block после filters/warning;
- [ ] имеет самостоятельный контейнер или визуальный ритм;
- [ ] строки и status chips читаются без конкуренции с source controls;
- [ ] pagination относится к таблице и не выглядит частью sources.

## «Источники данных»

Sources section считается отделённой, если:

- [ ] начинается после таблицы и pagination с явным вертикальным отступом;
- [ ] имеет заголовок «Источники данных» или эквивалентный section title;
- [ ] использует отличимый background/border/divider/section frame;
- [ ] внутри есть ясная семантика Workspace / Проект / Сессия;
- [ ] actions «Открыть проект» и «Открыть сессию» не смешиваются с table row actions;
- [ ] secondary controls не поднимаются выше основной таблицы.

## Недостаточная separation

Считать rework проваленным, если:

- [ ] sources визуально продолжают таблицу тем же контейнером без разрыва;
- [ ] section title не виден или выглядит как обычная строка таблицы;
- [ ] source rows и registry rows используют одинаковую плотность/фон без delimiter;
- [ ] sources занимают больше внимания, чем registry table;
- [ ] AI/source controls перетягивают primary focus до просмотра таблицы.

## Explorer-like scope semantics

Безопасная интерпретация Explorer-like semantics:

- [ ] компактные markers с явным type label;
- [ ] выбранный scope виден как активный context marker;
- [ ] Workspace / Проект / Сессия выглядят как уровни навигационного контекста;
- [ ] не копируется весь Explorer UI и не меняется Explorer code;
- [ ] нет broad redesign, только локальная registry styling adaptation.

