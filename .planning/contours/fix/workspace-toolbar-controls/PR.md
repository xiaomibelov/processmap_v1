# PR: fix/workspace-toolbar-controls

## Что исправлено

- В toolbar workspace добавлена кнопка развернуть/свернуть всё рядом с menu статусов.
- Кнопка отражает состояние дерева: expanded, collapsed, mixed. В mixed состоянии действие по умолчанию — развернуть.
- Массовое действие transient: оно не вызывает сохранение `explorer.tree.expanded` и не перезаписывает ручное состояние preferences.
- При bulk expand раскрываются известные разделы, папки и проекты; для папок запускается lazy-load, а новые загруженные descendants раскрываются в рамках текущей сессии.
- После reload восстанавливается прежнее persisted manual state. Ручной toggle после bulk action снова работает как обычное явное изменение и сохраняется.
- Починен project kebab: у строки проекта теперь есть relative anchor.
- Общий `ContextMenu` переведён на fixed positioning с viewport clamping, чтобы меню не уезжало за правый/нижний край экрана.

## Тесты

- Focused bulk/menu: 14/14 passed.
- Workspace/explorer contracts: 36/36 passed.
- Explorer suite без существующего локального SessionCreateModal Node 22 blocker: 204/204 passed.
- Smoke render: 1/1 passed.
- Lint: exit 0.
- Build: exit 0.

## ui-ux-pro-max

Выполнены обязательные запросы:

- `tree expand collapse all`
- `dropdown menu positioning`

Применено:

- icon-only control с `aria-label`, `title`, `aria-pressed`;
- control расположен в строке chips рядом с `...`;
- dropdown получил stable fixed positioning и viewport clamp;
- bulk helpers проверены на 100+ rows без тяжёлых операций.

## Известное

- Backend/API не менялись, OpenAPI не трогался.
- Полный explorer node-test локально исключает существующий `SessionCreateModal.test.mjs` blocker под Node 22; связанные тесты контура зелёные.

Merge только после approve владельца.
