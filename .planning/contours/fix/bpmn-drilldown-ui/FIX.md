# FIX — fix/bpmn-drilldown-ui

> Diff-подобное описание изменений. Актуальный код будет написан Agent 2 только после approve плана.

## 1. `frontend/src/features/process/bpmn/stage/styles/subprocessNavigation.css`

```diff
 .subprocessBreadcrumbsOnCanvas {
   position: absolute;
-  top: 0;
+  top: 12px;                 /* или calc(var(--header-height) + 12px) */
   left: 12px;
   z-index: 50;
   max-width: calc(100% - 24px);
   pointer-events: none;
 }
```

- Сохраняем `pointer-events: none` на обёртке и `pointer-events: auto` на внутренней панели.
- `z-index: 50` остаётся ниже модалок и drilldown-стрелки (`z-index: 300`).

## 2. `frontend/src/lib/sessionNoteAggregates.js` — новый хук (расширение)

Добавить экспорт:

```js
export function useChildSessionNoteAggregatesByElementId(parentSessionId, sessions = []) {
  const childSessions = useMemo(() => {
    const pid = String(parentSessionId || "").trim();
    if (!pid) return [];
    return sessions.filter(
      (s) => String(s?.parent_session_id || "").trim() === pid && String(s?.element_id_in_parent || "").trim()
    );
  }, [parentSessionId, sessions]);

  const childIds = useMemo(() => childSessions.map((s) => String(s?.id || s?.session_id || "").trim()).filter(Boolean), [childSessions]);
  const aggregates = useSessionNoteAggregates(childIds);

  return useMemo(() => {
    const map = new Map();
    for (const s of childSessions) {
      const sid = String(s?.id || s?.session_id || "").trim();
      const eid = String(s?.element_id_in_parent || "").trim();
      if (!sid || !eid) continue;
      const agg = aggregates.get(sid) || null;
      if (agg && Number(agg.open_notes_count || 0) > 0) {
        map.set(eid, agg);
      }
    }
    return map;
  }, [childSessions, aggregates]);
}
```

## 3. `frontend/src/App.jsx`

- Импорт `useChildSessionNoteAggregatesByElementId`.
- Внутри `AppShell` props добавить:

```jsx
const childDiscussionAggregates = useChildSessionNoteAggregatesByElementId(sessionId, sessions);
...
<AppShell
  ...
  childSessionDiscussionAggregates={childDiscussionAggregates}
/>
```

- `sessionId` здесь — текущий открытый session id, т.е. parent для child-сессий.

## 4. `frontend/src/components/AppShell.jsx`

- Принять `childSessionDiscussionAggregates` и пробросить в `ProcessStage`:

```jsx
<ProcessStage
  ...
  childSessionDiscussionAggregates={childSessionDiscussionAggregates}
/>
```

## 5. `frontend/src/components/ProcessStage.jsx`

- Принять `childSessionDiscussionAggregates` и пробросить в `BpmnStage`:

```jsx
<BpmnStage
  ...
  childSessionDiscussionAggregates={childSessionDiscussionAggregates}
/>
```

## 6. `frontend/src/components/process/BpmnStage.jsx`

### 6a. Забрать `transition` из state machine

```diff
- const { isReady: loadStateIsReady } = useDiagramLoadStateMachine();
+ const {
+   isReady: loadStateIsReady,
+   transition: loadTransition,
+ } = useDiagramLoadStateMachine({ warmTimeoutMs: 10000, coldTimeoutMs: 20000 });
```

### 6b. Сброс при смене сессии / view

В эффекте смены `sessionId` или `view`:

```js
useEffect(() => {
  loadTransition("reset");
}, [sessionId, view, loadTransition]);
```

### 6c. Проброс `loadTransition` в runtime lifecycle

```diff
const renderCtx = {
  ...,
+ loadTransition,
  ensureViewer,
  ensureModelerRuntime,
  ...
};
```

### 6d. Оборачивание canvas в `DiagramLoadBoundary`

```diff
- {diagramReady ? (
-   <div ref={bpmnStackRef} ... />
- ) : (
-   <DiagramSkeleton />
- )}
+ <DiagramLoadBoundary loadState={loadState} errorReason={errorReason} onRetry={retryImport}>
+   <div ref={bpmnStackRef} ... />
+ </DiagramLoadBoundary>
```

Для этого state machine должен экспортировать `loadState`, `errorReason`, `transition`.

## 7. `frontend/src/features/process/bpmn/stage/orchestration/bpmnRenderRuntimeLifecycle.js`

### 7a. Перед `importXML`

```js
const { loadTransition } = ctx;
loadTransition?.("import_start");
```

### 7b. После успешного `importXML`

```js
await v.importXML(...);
...
loadTransition?.("import_success");
```

### 7c. При ошибке

```js
try {
  await v.importXML(...);
} catch (err) {
  loadTransition?.("import_error", { reason: String(err?.message || "viewer_import_failed") });
  throw;
}
```

Аналогично для modeler-ветки.

## 8. `frontend/src/features/process/bpmn/stage/decor/decorManager.js` — discussion badge overlay

Добавить функцию:

```js
function buildSubprocessDiscussionBadge(aggregate) {
  const count = Number(aggregate?.open_notes_count || 0);
  if (count <= 0) return null;
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "fpcNodeBadge fpcNodeBadge--discussions";
  badge.title = `Открытые обсуждения: ${count}`;
  badge.setAttribute("aria-label", badge.title);
  badge.dataset.badgeKind = "subprocess_discussions";
  badge.innerHTML = `<span class="fpcNodeBadgeIcon fpcNodeBadgeIcon--discussions"></span><span class="fpcNodeBadgeCount">${count}</span>`;
  return badge;
}
```

В `applyFullBpmnDecorSet` / `runBpmnRenderDecorSync` после рендера основных декоров:

```js
const childAggregates = asObject(ctx?.childSessionDiscussionAggregates);
for (const el of registry.getAll()) {
  const type = String(el?.type || "");
  if (type !== "bpmn:CallActivity" && type !== "bpmn:SubProcess") continue;
  const agg = childAggregates.get?.(el.id);
  const badge = buildSubprocessDiscussionBadge(agg);
  if (!badge) continue;
  overlays.add(el.id, {
    position: { top: -6, right: -6 },
    html: badge,
    show: { minZoom: 0.2 },
  });
  bindBadgeClick(badge, () => {
    callbacks.emitElementSelection(el, `${kind}.subprocess_discussion_badge_click`);
    callbacks.onOpenElementNotes?.(el.id);
  });
}
```

## 9. `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css` (или новый `subprocessNavigation.css`)

```css
.fpcNodeBadge--discussions {
  @apply inline-flex items-center gap-1 rounded-full border border-sky-300/70 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800;
  pointer-events: auto;
}

.fpcNodeBadgeIcon--discussions::before {
  content: "💬";
}
```

## 10. `scripts/e2e/check_subprocess_click.mjs`

Добавить проверки:

```js
// после клика на drilldown-стрелку
await page.waitForSelector('[data-testid="diagram-skeleton"]', { timeout: 5000 });
await page.waitForSelector('[data-testid="bpmn-stage-ready"]', { timeout: 15000 });
```

## Итоговый diffstat (ожидаемый)

```
frontend/src/features/process/bpmn/stage/styles/subprocessNavigation.css   |  2 +-
frontend/src/lib/sessionNoteAggregates.js                                   | 40 +++++++++
frontend/src/App.jsx                                                         |  8 ++
frontend/src/components/AppShell.jsx                                         |  4 ++
frontend/src/components/ProcessStage.jsx                                      |  4 ++
frontend/src/components/process/BpmnStage.jsx                                 | 25 +++++
frontend/src/features/process/bpmn/stage/orchestration/bpmnRenderRuntimeLifecycle.js | 15 +++
frontend/src/features/process/bpmn/stage/decor/decorManager.js                 | 55 +++++++++++
frontend/src/styles/app/05/05-02-bpmn-text-contrast.css                        | 12 +++
scripts/e2e/check_subprocess_click.mjs                                        |  8 ++
10 files changed, 173 insertions(+), 1 deletion(-)
```
