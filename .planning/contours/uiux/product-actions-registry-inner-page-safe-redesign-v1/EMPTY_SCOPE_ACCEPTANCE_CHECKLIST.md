# Acceptance checklist: empty workspace scope

Статус перед rework: `CHANGES_REQUESTED`.

- [ ] Путь `Analytics -> Реестр действий` не открывает visually broken blank registry.
- [ ] Title/description registry остаются видимыми.
- [ ] Scope tabs остаются видимыми.
- [ ] Metrics area остается компактной и видимой даже при `0` rows.
- [ ] Filters/actions остаются видимыми.
- [ ] AI controls видимы в primary actions/filter area.
- [ ] Table shell остается видимым: либо headers, либо deliberate empty-state table shell.
- [ ] Empty-state message понятен: `В выбранном scope нет действий с продуктом. Выберите проект или сессию либо загрузите источники данных.`
- [ ] Отсутствие rows не скрывает всю registry structure.
- [ ] Не используется fake data.
- [ ] Viewing/navigation не вызывает unsafe `PUT/PATCH/DELETE`.
