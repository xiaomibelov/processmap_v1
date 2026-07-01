# Design: BPMN Version History Modal Redesign

## Goal

Replace the current text-heavy, XML-only version-history modal with a compact, visual, git-log-like experience:
- left: timeline list of versions with facts + diff summary,
- right: live BPMN preview of the selected version,
- bottom: prioritized action buttons,
- diff: overlay-based visual comparison.

## Context

Current implementation lives in:
- `frontend/src/features/process/stage/ui/ProcessDialogs.jsx` — modal markup and diff UI.
- `frontend/src/components/ProcessStage.jsx` — version fetching, XML lazy-loading, restore/download actions.
- `frontend/src/lib/api.js` / `lib/apiRoutes.js` — `apiGetBpmnVersions`, `apiGetBpmnVersion`, `apiRestoreBpmnVersion`.
- `frontend/src/features/process/bpmn/diff/semanticDiff.js` — `buildSemanticBpmnDiff(baseXml, targetXml)`.
- `frontend/src/components/process/BpmnStage.jsx` — existing `NavigatedViewer` usage with ProcessMap moddle extensions.

## Decision: component split (Approach B)

Keep `ProcessDialogs.jsx` as a thin shell and extract focused components:

| Component | Responsibility |
|-----------|----------------|
| `BpmnVersionList` | Left panel: compact timeline cards, selection, empty/loading states. |
| `BpmnVersionPreview` | Right panel: readonly NavigatedViewer preview, spinner, collapsible raw XML, error state. |
| `BpmnVersionDiffOverlay` | Diff view: base viewer + colored overlay badges for added/removed/changed elements. |
| `BpmnVersionActions` | Footer buttons: Restore, Download, Compare with current, XML link, Close. |

## Layout

- Desktop modal: `min-width: 900px`, left column 30%, right column 70%, gap 16px.
- Mobile: bottom sheet, list on top, preview below.
- Visual style: radius 8px, padding 12px, text-sm, flat (matches admin redesign).

## Left panel (BpmnVersionList)

Each version card shows:
- Revision number (large) + badge: `latest`, `current`, `stale`.
- Date/time: `26.06.2026, 14:35`.
- Author avatar + name.
- Comment (only if present).
- Size in KB.
- Short hash (8 chars), copy on click.
- Diff summary vs previous version, e.g. `+3 задачи, −1 gateway`.

Empty state:
> "История версий пуста. Сохраните сессию, чтобы создать первую версию."
> Primary button: "Сохранить сейчас".

One-version state:
- "Compare A/B" button disabled with tooltip: "Нужно минимум 2 версии для сравнения".

## Right panel (BpmnVersionPreview)

- Uses `bpmn-js/lib/NavigatedViewer` with ProcessMap moddle descriptors.
- Auto-imports XML when selected version changes.
- `fit-to-viewport` after successful import.
- Shows spinner/skeleton while parsing/rendering.
- If XML is invalid/corrupted:
  > "Не удалось загрузить версию. XML повреждён или невалиден."
  > Secondary button: "Скачать XML для диагностики".
- Collapsible raw XML textarea below the viewer (link "XML" toggles it).

## Diff overlay (BpmnVersionDiffOverlay)

- Computes semantic diff via `buildSemanticBpmnDiff(baseXml, targetXml)`.
- Renders base version in a readonly viewer.
- Adds bpmn-js overlays on changed elements:
  - green `+` badge for added,
  - red `−` badge for removed,
  - yellow `~` badge for changed.
- Shows textual summary list alongside the viewer.

Two entry points:
1. "Сравнить с текущей" — compares selected version with current session state.
2. "Сравнить А/В" inside the modal — user picks base and target versions.

## Actions footer (BpmnVersionActions)

Priority order:
1. **Primary**: "Восстановить эту версию" (disabled if selected version is current).
2. **Secondary outline**: "Скачать .bpmn".
3. **Secondary outline**: "Сравнить с текущей".
4. **Tertiary link**: "XML" — toggles raw XML panel.
5. "Закрыть".

## Data flow

1. `ProcessStage` fetches version headers (`includeXml: false`).
2. On version selection:
   - call `apiGetBpmnVersion(versionId)` if XML not cached,
   - cache XML in `Map<versionId, xml>` inside component/local state.
3. `BpmnVersionPreview` receives cached XML and renders the viewer.
4. Diff summary for list cards is computed lazily vs the previous version, using `buildSemanticBpmnDiff`, and cached.
5. Restore/download/compare reuse existing action handlers from `ProcessStage`.

## Error handling

- Failed XML load → error message + diagnostic download.
- Failed diff computation → inline error, fall back to raw XML comparison.
- Long load (>3s) → skeleton overlay instead of blank space.

## Performance notes

- Do not load XML for all versions upfront.
- Cache loaded XML and computed diff summaries.
- Destroy NavigatedViewer instances on unmount to free memory.

## Out of scope

- Backend version-creation logic.
- API endpoint changes.
- Core restore logic (only UI wrapping improves).

## Testing

- `npm run build` passes.
- Playwright:
  - open versions modal,
  - select a version,
  - assert `.bpmn-version-preview` container is visible and viewer has rendered shapes.
