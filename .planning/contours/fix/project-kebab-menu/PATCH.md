# PATCH: fix/project-kebab-menu

## Изменения

### `frontend/src/features/explorer/WorkspaceExplorer.jsx`

В компоненте `ProjectRow` ячейка действий (`<td>` с кнопкой «···» и `ContextMenu`) получает класс `relative`, чтобы абсолютно позиционированное меню было привязано к ячейке, а не к внешнему ancestor. Это выравнивает поведение с `FolderRow`.

```diff
-        <td className={`px-2 py-2.5 text-right ${layout.compact ? "w-8" : "w-[88px]"}`} onClick={(e) => e.stopPropagation()}>
+        <td className={`px-2 py-2.5 text-right relative ${layout.compact ? "w-8" : "w-[88px]"}`} onClick={(e) => e.stopPropagation()}>
```

### `frontend/e2e/explorer-project-kebab-menu.spec.mjs` (новый файл)

Playwright e2e-тест, который:
- мокает аутентификацию, организацию, workspace и explorer page;
- рендерит одну строку проекта;
- наводит курсор на строку и кликает по «···»;
- проверяет, что контекстное меню видимо и содержит пункт «Открыть».

## Почему этого достаточно

- `ContextMenu` рендерится `absolute right-0 top-full` внутри action-cell. Без `relative` на `<td>` его containing block непредсказуем.
- `FolderRow` уже использует `relative` на action-cell; `ProjectRow` теперь ведёт себя идентично.
- CTA «Открыть проект» остаётся в том же flex-контейнере, но не перекрывает kebab, так как занимает свою позицию в потоке.
