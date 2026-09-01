# fix/hide-dsv-chip-header

## Контекст
`diagram_state_version` (dsv) — технический CAS-счётчик, растёт на каждое сохранение. Показ его в шапке сессии путает пользователя. Решение: убрать сырой dsv из шапки, оставить только осмысленный номер опубликованной ревизии `V. N`; dsv показывать в истории версий.

## Цель
Минимальный UI-патч: удалить dsv-чип из `ProcessStageHeader`, оставив `diagram-toolbar-version-chip` (`V. N`) и все остальные бейджи. Добавить отображение dsv в панели истории версий. Обновить затронутые тесты.

## Границы
- Не трогать backend, CAS-логику, `revisionBadgePolicy`, конфликтную модалку, presence/upload бейджи, общую структуру шапки.
- Не прятать чип за флагом — удалить окончательно.

## Файлы изменений
1. `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx`
   - Удалить разметку dsv-чипа (`data-testid="diagram-toolbar-diagram-state-version-chip"`).
   - Удалить ставшие ненужными пропсы `diagramStateVersion`, `diagramStateConflict`, `diagramStateConflictServerVersion`, `diagramStateConflictActorLabel`.
   - Удалить вычисления `localDiagramStateVersion`, `serverVersion`, `isDiagramStateConflict`, `diagramStateVersionChipLabel`, `diagramStateVersionChipTitle`.
   - Оставить `diagram-toolbar-version-pair`/`diagram-toolbar-version-chip` и остальную логику без изменений.
2. `frontend/src/features/process/stage/orchestration/buildDiagramViewModel.js`
   - Убрать из `buildDiagramHeaderView` вычисление и возврат `diagramStateVersion`, `diagramStateConflict`, `diagramStateConflictServerVersion`, `diagramStateConflictActorLabel`.
3. `frontend/src/components/ProcessStage.jsx`
   - В `normalizeBpmnVersionListItem` добавить каноническое поле `diagramStateVersion` из `diagram_state_version`/`diagramStateVersion`.
4. `frontend/src/features/process/stage/ui/ProcessDialogs.jsx`
   - В строке истории версий добавить мелкую подпись `dsv: N` (или "—") через поле `item.diagramStateVersion`, чтобы технический счётчик был доступен в истории.
5. Тесты:
   - `ProcessStageHeader.revision-visibility.test.mjs` — оставить, возможно добавить проверку отсутствия старого testid.
   - `ProcessStageHeader.revision-action-contract.test.mjs` — убедиться, что порядок сохранить/создать версию/V-чип сохраняется.
   - `ProcessDialogs.revision-localization.test.mjs` — не сломать; добавленная строка не должна конфликтовать с проверяемыми подписями.
   - Добавить/обновить тест, доказывающий отсутствие dsv-чипа и наличие V-чипа.

## Verify
- `node --test` для затронутых `.test.mjs` в `frontend/src/features/process/stage/ui/`.
- `npm run test:smoke` (vitest) — 9 файлов зелёные.
- Полный `npm run test` — сверить счётчик failures с baseline (известно 82 fail на main), не должно увеличиться.

## Git / proof
- Ветка: `fix/hide-dsv-chip-header` от `origin/main` (HEAD `25f63aef`).
- Worktree: `processmap_v1_main_clone-worktrees/fix-hide-dsv-chip-header`.
- Без approve — никакого push/merge/deploy.
