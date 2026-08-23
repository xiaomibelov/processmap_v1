# fix/i18n-diagram-section

Hotfix: падение интерфейса при открытии overflow-меню (троеточие) на вкладке Diagram (BPMN).

## Root cause

`frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx` читает:
- `getDict().diagram.editingSectionTitle`
- `getDict().diagram.alignDiagram`
- `getDict().diagram.resetCanvas`

А также `frontend/src/components/ProcessStage.jsx`:
- `getDict().diagram.alignFailed`
- `getDict().diagram.resetCanvasConfirm`
- `getDict().diagram.resetFailed`

Секции `diagram` в `shared/i18n/ru.js` и `shared/i18n/en.js` не существовало → `TypeError` при открытии меню.

## Исправления

1. Добавлена секция `diagram` в `frontend/src/shared/i18n/ru.js` и `frontend/src/shared/i18n/en.js`:
   - `editingSectionTitle`
   - `alignDiagram`
   - `resetCanvas`
   - `alignFailed`
   - `resetCanvasConfirm`
   - `resetFailed`

2. Добавлен инвариант-тест `frontend/src/shared/i18n/i18nKeysInvariant.test.mjs`:
   - собирает все статические `getDict().<ns>.<key>` и `t("<ns>.<key>")` в `frontend/src`;
   - проверяет наличие каждого ключа в `ru.js` и `en.js`;
   - падает на любом новом отсутствующем ключе.

3. Технический долг (458 существующих отсутствующих ключей) зафиксирован в `frontend/src/shared/i18n/i18nKnownMissingKeys.mjs`, чтобы тест блокировал новые ключи, не ломаясь на старом долге.

## Проверка

```bash
cd /Users/mac/agents_place/kimi_PM/server-backup/opt/processmap-test-worktrees/fix-i18n-diagram-section/frontend

# build
npm run build  # ✅

# invariant test
node --test src/shared/i18n/i18nKeysInvariant.test.mjs  # ✅

# smoke
npm run test:smoke  # ✅ 4/4
```

Без фикса инвариант-тест падает на:
- `diagram.editingSectionTitle`
- `diagram.alignDiagram`
- `diagram.resetCanvas`
- `diagram.alignFailed`
- `diagram.resetCanvasConfirm`
- `diagram.resetFailed`

## Git

- Ветка: `fix/i18n-diagram-section`
- HEAD: `7635ea87`
- Base: `origin/main` (`5e4c555c`)
- PR: https://github.com/xiaomibelov/processmap_v1/pull/809

## Статус

- [x] Добавлена diagram-секция в ru/en
- [x] Инвариант-тест написан и проходит
- [x] Показан красный прогон без фикса
- [x] `npm run build` зелёный
- [x] `npm run test:smoke` зелёный
- [x] Push в `origin/fix/i18n-diagram-section`
- [x] PR #809 создан
- [ ] Merge — только владелец
