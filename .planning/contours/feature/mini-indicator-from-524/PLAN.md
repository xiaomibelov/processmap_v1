# PLAN — feature/mini-indicator-from-524

Cherry-pick Tier 1 из PR #524 (property-panel-redesign) в новую ветку от main.

## Scope (approved)
- **1a**: ExtensionStateMiniIndicator.jsx + extensionStateMiniView.js + CSS (.extensionStateMini*, .propertiesTabTopRow) + 2 unit-теста + вставка propertiesTabTopRow в NotesPanel.jsx (верх аккордеона «Свойства»).
- **1b**: BpmnStage.jsx — clearPropertiesOverlayDecor ДО maybeRemount (V2/legacy mutual exclusion fix).

## NOT in scope (остаётся в #524)
To-Be builder, dropdown-перестройка, удаление per-element fpc-show-properties, fieldChips/hiddenFields, LiveCardPreview, PanelGroup.

## Verification
- unit sweep vs baseline main (51=51 после merge #525), foundation 10/10, npm run build
- stage deploy + e2e/extension-state-mini.spec.mjs (2 теста: saved→dirty, dirty→saved+XML) + e2e/process-properties.spec.mjs (5/5 регрессия)

## Constraints
save pipeline/backend не трогаем; per-element flag не удаляем; merge только после explicit user approve.
