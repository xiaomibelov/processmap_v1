# PR.md — fix/rbac-5-features

## Заголовок PR
fix(rbac): audit and harden permission boundaries in 5 core features

## Что делает
- Проводит аудит RBAC в шаблонах, сессиях, версиях сессий, BPMN-элементах/оверлеях и обсуждениях.
- Закрывает критичные gap'ы между гранулярной матрицей прав (`view/create/edit/delete/export/manage_users`) и существующими ролевыми проверками.
- Добавляет тестовое покрытие для каждого исправленного gap'а.

## Границы
- Только authz-аудит и минимальные патчи в 5 фичах.
- Не затрагивает user-access-redesign UI, storage schema, broad authz refactor.
- Deferred-проблемы вынесены в AUDIT.md.

## Чек-лист
- [ ] AUDIT.md финализирован
- [ ] Патчи применены
- [ ] Новые тесты проходят
- [ ] Существующие RBAC-тесты не регрессируют
- [ ] Frontend npm test не регрессирует
- [ ] Артефакты замиррорены в Obsidian
