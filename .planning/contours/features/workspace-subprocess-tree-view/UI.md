# UI Specification — Workspace Subprocess Tree View

## Wireframe (текстовое описание)

```
[Workspace / Project pane]

Сессии
────────────────────────────────────────────────────────────
▶  ◯ Root process          draft   ...   Открыть сессию
▶  ◯ Another root process  ready   ...   Открыть сессию
▼  ◯ Parent process        draft   ...   Открыть сессию
   │
   ▼  ◯ Subprocess A       draft   ...   Открыть сессию
   ▶  ◯ Subprocess B       draft   ...   Открыть сессию
      │
      ▼  ◯ Sub-subprocess  draft   ...   Открыть сессию
────────────────────────────────────────────────────────────
```

- Chevron (`▶` / `▼`) слева от иконки сессии.
- Сессии без детей не имеют chevron; вместо него — пустой spacer того же размера.
- Child-сессии сдвинуты вправо относительно родителя.
- Между уровнями — тонкая вертикальная линия-связка (опционально, см. CSS).

---

## Компоненты

### SessionRow

**File:** `frontend/src/features/explorer/WorkspaceExplorer.jsx:2189-2436`

**New props:**

```js
{
  depth = 0,
  expanded = false,
  expandable = false,
  loadingChildren = false,
  onToggleExpand,
}
```

**Layout changes:**

1. Первая ячейка (`td.w-5`) заменяется/дополняется ячейкой с chevron:
   - `<td className="px-1 py-2.5 w-7">`.
   - Внутри — spacer или кнопка с `IcoChevron`.
2. Ячейка с названием (`td.text-sm.font-medium`) получает inline style `paddingLeft` для indent:
   - `const leftPadding = 8 + depth * 18;`.
   - Содержимое оборачивается в `flex items-center gap-2`.
3. Для child-сессий добавить лёгкую левую границу/линию (`border-l border-border/40`) или просто indent.

**Chevron button:**

```jsx
{expandable ? (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
    className="..."
    aria-expanded={expanded}
    title={expanded ? "Свернуть подпроцессы" : "Развернуть подпроцессы"}
  >
    {loadingChildren ? <IcoSpinner className="animate-spin" /> : <IcoChevron right className={expanded ? "rotate-90" : ""} />}
  </button>
) : (
  <span className="inline-flex h-6 w-6" aria-hidden />
)}
```

**Click behavior:**
- Chevron click — toggle expand (stop propagation to avoid opening session).
- Row click / title link / CTA — open session (unchanged).

### ProjectPane

**File:** `frontend/src/features/explorer/WorkspaceExplorer.jsx:2440-2777`

**New state:**

```js
const [expandedSessionIds, setExpandedSessionIds] = useState(new Set());
const [sessionChildrenCache, setSessionChildrenCache] = useState({}); // { [parentId]: SessionItem[] }
const [loadingSessionChildren, setLoadingSessionChildren] = useState(new Set());
```

**New helpers:**

```js
const toggleSessionExpand = useCallback(async (sessionId) => {
  setExpandedSessionIds((prev) => {
    const next = new Set(prev);
    if (next.has(sessionId)) {
      next.delete(sessionId);
      return next;
    }
    next.add(sessionId);
    return next;
  });

  if (sessionChildrenCache[sessionId]) return;

  setLoadingSessionChildren((prev) => new Set(prev).add(sessionId));
  try {
    const resp = await apiGetSessionChildren(sessionId);
    if (resp?.ok) {
      setSessionChildrenCache((prev) => ({ ...prev, [sessionId]: resp.data || [] }));
    }
  } finally {
    setLoadingSessionChildren((prev) => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  }
}, [sessionChildrenCache]);

const buildVisibleSessionRows = useCallback((sessions) => {
  const rows = [];
  for (const s of sessions) {
    rows.push({ session: s, depth: 0 });
    const sid = s.id || s.session_id;
    if (expandedSessionIds.has(sid)) {
      const children = sessionChildrenCache[sid] || [];
      for (const c of children) {
        rows.push({ session: c, depth: 1 });
        // recursion if multi-level expand desired
      }
    }
  }
  return rows;
}, [expandedSessionIds, sessionChildrenCache]);
```

**Render loop:**

```jsx
{visibleRows.map(({ session, depth }) => (
  <SessionRow
    key={session.id || session.session_id}
    session={session}
    depth={depth}
    expandable={depth === 0 ? session.has_children : false}
    expanded={expandedSessionIds.has(session.id)}
    loadingChildren={loadingSessionChildren.has(session.id)}
    onToggleExpand={() => toggleSessionExpand(session.id)}
    ...
  />
))}
```

> Note: multi-level expand (depth > 1) requires recursive builder; Phase 1 can support depth 0/1, recursion added in Phase 2 if needed.

---

## CSS / Tailwind

### Indent

```js
const leftPadding = 8 + depth * 18;
```

Applied to the title cell:

```jsx
<td className="px-2 py-2.5 text-sm font-medium text-fg">
  <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${leftPadding}px` }}>
    ...
  </div>
</td>
```

### Chevron button style

Reuse `FolderRow` style:

```jsx
<button
  type="button"
  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-panelAlt/70 text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${loadingChildren ? "cursor-wait border-border/70" : "border-border/70 hover:border-border hover:bg-bg hover:text-fg active:bg-panelAlt"}`}
>
  <IcoChevron right className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} />
</button>
```

### Child row background (optional)

```jsx
<tr className={`group transition-colors cursor-pointer ${isChild ? "bg-panelAlt/15" : ""} ${isOpening ? "bg-accentSoft/20" : "hover:bg-accentSoft/30"}`}>
```

### Connector line (optional)

```jsx
<span className="absolute left-[calc(8px+depth*18px-9px)] top-0 bottom-0 w-px bg-border/40" aria-hidden />
```

Can be skipped in MVP to reduce complexity; indent alone is sufficient.

---

## Feature flag gating

```jsx
const treeViewEnabled = useFeatureFlag("workspace_session_tree_view");
```

- When `false`: load flat list (`rootOnly=false`), ignore `has_children`, no chevron.
- When `true`: load `rootOnly=true`, show tree UI.

---

## Responsive considerations

- Chevron cell fixed width `w-7`.
- Indent reduces usable title width on narrow sidebars; keep `max-w` and truncate.
- Mobile: same behavior, touch target for chevron at least 24×24 px.
