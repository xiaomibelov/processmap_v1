# VISUAL_ACCEPTANCE_CHECKLIST

## Header

- [ ] `Реестр действий с продуктом` визуально сильнее subtitle и utility controls.
- [ ] Subtitle читаемый, вторичный, не выглядит как body noise.
- [ ] `Вернуться` компактный и navigation-like.
- [ ] CSV/XLSX находятся только в header area.

## Metrics

- [ ] Метрики собраны в компактный dashboard/card.
- [ ] Значения заметны, но не oversized.
- [ ] Labels маленькие, uppercase/secondary.
- [ ] `Полных` и `Неполных` имеют тонкую semantic coloring.
- [ ] `После фильтров` не дублирует total тяжело; если равно total, оно secondary/badge-like.

## Filters

- [ ] Main filters сгруппированы: `Группа`, `Товар`, `Тип`, `Этап`, `Категория`.
- [ ] Secondary filters сгруппированы: `Роль`, `Полнота`, `Сбросить`.
- [ ] Applied filters визуально обнаружимы.
- [ ] `Сбросить фильтры` спокойный link/text-style action.

## AI block

- [ ] Label `AI-предложения` сохранен.
- [ ] `Все видимые`, `Без действий`, `Неполные` выглядят как secondary toggle chips.
- [ ] `AI: предложить действия` выглядит как primary CTA внутри AI block.
- [ ] `Выбрано для AI: 0/10` расположен рядом с CTA и визуально secondary.
- [ ] AI controls находятся в primary actions area, не в `Источники данных`.

## Warning

- [ ] Warning о неполных строках находится над таблицей.
- [ ] Warning мягкий, не critical-error style.
- [ ] `Показать только неполные` есть, если безопасно; если нет, есть documented skip.

## Table

- [ ] Таблица является основной рабочей областью.
- [ ] Header спокойный и ясный.
- [ ] Rows имеют separation и hover state.
- [ ] Status badges `Полная`/`Неполная` aligned and consistent.
- [ ] Tags под actions компактные.
- [ ] BPMN code менее визуально доминирует.
- [ ] Checkbox column есть только при safe selection support.
- [ ] Sticky header реализован только если нет layout regressions.

## Layout

- [ ] Между секциями ясный vertical rhythm.
- [ ] Используются card-like section backgrounds там, где они помогают.
- [ ] Нет ощущения единой серой непрерывной простыни.
- [ ] Нет ощущения узкой вставленной панели.
- [ ] Table использует workspace width лучше, сохраняя readable margins.
