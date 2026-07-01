# BPMN Version History Modal Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-heavy XML-only BPMN version-history modal with a compact, visual, git-log-like experience: timeline list on the left, live BPMN preview on the right, overlay diff, and prioritized actions.

**Architecture:** Extract focused components (`BpmnVersionList`, `BpmnVersionPreview`, `BpmnVersionActions`, `BpmnVersionDiffOverlay`) and keep `ProcessDialogs.jsx` as a thin shell. Reuse existing `NavigatedViewer`, `buildSemanticBpmnDiff`, and version API helpers. State and XML caching stay in `ProcessStage.jsx`.

**Tech Stack:** React 18, Vite, Tailwind CSS, bpmn-js `NavigatedViewer`, existing `semanticDiff.js`.

---

## File map

| File | Responsibility |
|------|----------------|
| `frontend/src/features/process/stage/ui/BpmnVersionList.jsx` | Left panel timeline cards, selection, empty/loading states. |
| `frontend/src/features/process/stage/ui/BpmnVersionPreview.jsx` | Right panel readonly BPMN viewer, spinner, raw XML toggle, error state. |
| `frontend/src/features/process/stage/ui/BpmnVersionActions.jsx` | Footer buttons: Restore, Download, Compare, XML toggle, Close. |
| `frontend/src/features/process/stage/ui/BpmnVersionDiffOverlay.jsx` | Diff viewer: base viewer + colored overlay badges + summary. |
| `frontend/src/features/process/stage/ui/ProcessDialogs.jsx` | Modal shell wiring the components above. |
| `frontend/src/components/ProcessStage.jsx` | State: version list, XML cache, diff summaries, auto-select, action handlers. |
| `/root/ui_verify/verify_bpmn_versions_modal.js` | Playwright smoke test. |

---

## Task 1: Create `BpmnVersionPreview` component

**Files:**
- Create: `frontend/src/features/process/stage/ui/BpmnVersionPreview.jsx`

- [ ] **Step 1: Write the component**

```jsx
import { useEffect, useRef, useState } from "react";
import pmModdleDescriptor from "../../robotmeta/pmModdleDescriptor";
import camundaModdleDescriptor from "../../camunda/camundaModdleDescriptor";

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n === 0) return "0 B";
  const kb = n / 1024;
  return `${kb < 1 ? n.toFixed(0) : kb.toFixed(1)} ${kb < 1 ? "B" : "KB"}`;
}

export default function BpmnVersionPreview({
  xml,
  label,
  size,
  onDownload,
  downloadLabel = "Скачать .bpmn",
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState("");
  const [showXml, setShowXml] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let viewer = null;

    async function render() {
      if (!containerRef.current) return;
      const xmlText = String(xml || "").trim();
      if (!xmlText) {
        setStatus("idle");
        return;
      }
      setStatus("loading");
      setError("");

      try {
        if (!viewerRef.current) {
          const mod = await import("bpmn-js/lib/NavigatedViewer");
          const Viewer = mod.default || mod.NavigatedViewer || mod;
          viewer = new Viewer({
            container: containerRef.current,
            moddleExtensions: { pm: pmModdleDescriptor, camunda: camundaModdleDescriptor },
          });
          viewerRef.current = viewer;
        } else {
          viewer = viewerRef.current;
        }
        await viewer.importXML(xmlText);
        if (cancelled) return;
        viewer.get("canvas").zoom("fit-viewport");
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(String(err?.message || err || "Не удалось загрузить версию. XML повреждён или невалиден."));
      }
    }

    render();

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        try { viewerRef.current.destroy(); } catch {}
        viewerRef.current = null;
      }
    };
  }, [xml]);

  return (
    <div className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-border bg-panel2/35">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-xs text-muted">
          {label ? `Предпросмотр · ${label}` : "Выберите версию слева"}
        </div>
        <div className="flex items-center gap-2">
          {size ? <span className="text-[11px] text-muted">{formatBytes(size)}</span> : null}
          <button
            type="button"
            className="text-[11px] text-accent hover:underline"
            onClick={() => setShowXml((prev) => !prev)}
          >
            {showXml ? "Скрыть XML" : "XML"}
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-panel">
        {status === "loading" ? (
          <div className="grid h-full place-items-center" data-testid="bpmn-version-preview-loading">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          </div>
        ) : status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center" data-testid="bpmn-version-preview-error">
            <div className="text-sm text-danger">{error}</div>
            <button type="button" className="secondaryBtn h-8 px-2 text-xs" onClick={onDownload}>
              Скачать XML для диагностики
            </button>
          </div>
        ) : status === "ready" || status === "idle" ? (
          <div ref={containerRef} className="h-full w-full" data-testid="bpmn-version-preview-canvas" />
        ) : null}
      </div>

      {showXml ? (
        <div className="border-t border-border p-2">
          <textarea
            className="xmlEditorTextarea h-40 w-full text-xs"
            value={String(xml || "")}
            readOnly
            data-testid="bpmn-version-preview-xml"
          />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Run build to catch syntax errors**

```bash
cd /opt/processmap-test/frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /opt/processmap-test && git add frontend/src/features/process/stage/ui/BpmnVersionPreview.jsx && git commit -m "feat(bpmn-versions): add BpmnVersionPreview component"
```

---

## Task 2: Create `BpmnVersionList` component

**Files:**
- Create: `frontend/src/features/process/stage/ui/BpmnVersionList.jsx`

- [ ] **Step 1: Write the component**

```jsx
function shortHash(value) {
  const s = String(value || "").trim();
  return s.length > 8 ? s.slice(0, 8) : s;
}

function formatKb(len) {
  const n = Number(len || 0);
  if (n === 0) return "0 B";
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

function formatSnapshotTs(ts) {
  const d = new Date(Number(ts || 0));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function snapshotLabel(item) {
  const comment = String(item?.comment || "").trim();
  const rev = Number(item?.revisionNumber || item?.rev || 0);
  if (comment) return comment;
  if (rev > 0) return `Версия ${rev}`;
  return "Без названия";
}

function resolveBadge(item, currentVersionId, latestId) {
  const id = String(item?.id || "");
  if (id === String(currentVersionId || "")) return { label: "текущая", tone: "info" };
  if (id === String(latestId || "")) return { label: "последняя", tone: "ok" };
  return { label: "устаревшая", tone: "muted" };
}

function DiffSummary({ text }) {
  if (!text) return null;
  return <div className="truncate text-[11px] text-muted">{text}</div>;
}

export default function BpmnVersionList({
  versions,
  selectedId,
  currentVersionId,
  busy,
  loadState,
  loadError,
  emptyMessage,
  onSelect,
  onDownload,
  onRestore,
  onDiffWithCurrent,
  onDiffAB,
  onSaveSession,
}) {
  const list = Array.isArray(versions) ? versions : [];
  const latestId = String(list[0]?.id || "");
  const hasEnoughForDiff = list.length >= 2;

  if (loadState === "loading") {
    return (
      <div className="grid h-40 place-items-center" data-testid="bpmn-versions-loading">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
      </div>
    );
  }

  if (loadState === "failed") {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" data-testid="bpmn-versions-error">
        Не удалось загрузить историю версий: {String(loadError || "ошибка загрузки")}
      </div>
    );
  }

  if (loadState === "empty" || list.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-panel px-3 py-4" data-testid="bpmn-versions-empty">
        <div className="text-sm text-muted">
          {String(emptyMessage || "История версий пуста. Сохраните сессию, чтобы создать первую версию.")}
        </div>
        {onSaveSession ? (
          <button type="button" className="primaryBtn h-8 px-3 text-xs" onClick={onSaveSession}>
            Сохранить сейчас
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted">Версии: {list.length}</span>
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          onClick={onDiffAB}
          disabled={busy || !hasEnoughForDiff}
          title={hasEnoughForDiff ? "" : "Нужно минимум 2 версии для сравнения"}
          data-testid="bpmn-versions-open-diff"
        >
          Сравнить А/В
        </button>
      </div>
      <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
        {list.map((item) => {
          const id = String(item?.id || "");
          const active = id === String(selectedId || "");
          const badge = resolveBadge(item, currentVersionId, latestId);
          const authorName = String(item?.authorName || item?.authorEmail || item?.authorId || "").trim();

          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect?.(item)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-accent bg-accentSoft/35"
                  : "border-border bg-panel hover:bg-accentSoft/20"
              }`}
              data-testid="bpmn-version-item"
              data-snapshot-id={id}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg">
                  {snapshotLabel(item)}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <span className={`badge text-[10px] ${badge.tone}`}>{badge.label}</span>
                  <span className="badge text-[10px] info">
                    {Number(item?.revisionNumber || item?.rev || 0) > 0
                      ? `№${Number(item?.revisionNumber || item?.rev || 0)}`
                      : "—"}
                  </span>
                </div>
              </div>

              <div className="mb-1 text-xs text-muted">{formatSnapshotTs(item?.ts)}</div>

              {authorName ? (
                <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-accentSoft text-[10px] font-semibold text-fg">
                    {authorName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{authorName}</span>
                </div>
              ) : null}

              <DiffSummary text={item?.diffSummary} />

              <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                <span
                  className="font-mono hover:text-fg"
                  title="Кликните, чтобы скопировать"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(String(item?.sessionPayloadHash || item?.hash || item?.xml || ""));
                  }}
                >
                  {shortHash(item?.sessionPayloadHash || item?.hash || item?.xml)}
                </span>
                <span>{formatKb(item?.len || item?.xml?.length)}</span>
              </div>

              {active ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="primaryBtn h-7 px-2 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore?.(item);
                    }}
                    disabled={busy || id === currentVersionId}
                    data-testid="bpmn-version-restore"
                  >
                    Восстановить
                  </button>
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload?.(item);
                    }}
                  >
                    Скачать
                  </button>
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDiffWithCurrent?.(item);
                    }}
                    disabled={busy || id === currentVersionId}
                  >
                    Сравнить с текущей
                  </button>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run build**

```bash
cd /opt/processmap-test/frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /opt/processmap-test && git add frontend/src/features/process/stage/ui/BpmnVersionList.jsx && git commit -m "feat(bpmn-versions): add BpmnVersionList component"
```

---

## Task 3: Create `BpmnVersionActions` component

**Files:**
- Create: `frontend/src/features/process/stage/ui/BpmnVersionActions.jsx`

- [ ] **Step 1: Write the component**

```jsx
export default function BpmnVersionActions({
  selectedVersion,
  currentVersionId,
  busy,
  showXml,
  onRestore,
  onDownload,
  onDiffWithCurrent,
  onToggleXml,
  onClose,
}) {
  const id = String(selectedVersion?.id || "");
  const isCurrent = id === String(currentVersionId || "");
  const hasSelection = !!id;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {hasSelection ? (
          <button
            type="button"
            className="primaryBtn h-8 px-3 text-xs"
            onClick={() => onRestore?.(selectedVersion)}
            disabled={busy || isCurrent}
            title={isCurrent ? "Это текущая версия" : "Восстановить выбранную версию"}
            data-testid="bpmn-version-restore"
          >
            Восстановить эту версию
          </button>
        ) : null}
        {hasSelection ? (
          <button
            type="button"
            className="secondaryBtn h-8 px-3 text-xs"
            onClick={() => onDownload?.(selectedVersion)}
            disabled={busy}
          >
            Скачать .bpmn
          </button>
        ) : null}
        {hasSelection ? (
          <button
            type="button"
            className="secondaryBtn h-8 px-3 text-xs"
            onClick={() => onDiffWithCurrent?.(selectedVersion)}
            disabled={busy || isCurrent}
          >
            Сравнить с текущей
          </button>
        ) : null}
        {hasSelection ? (
          <button
            type="button"
            className="text-xs text-accent hover:underline"
            onClick={onToggleXml}
          >
            {showXml ? "Скрыть XML" : "XML"}
          </button>
        ) : null}
      </div>
      <button type="button" className="secondaryBtn h-8 px-3 text-xs" onClick={onClose}>
        Закрыть
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Build and commit**

```bash
cd /opt/processmap-test/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /opt/processmap-test && git add frontend/src/features/process/stage/ui/BpmnVersionActions.jsx && git commit -m "feat(bpmn-versions): add BpmnVersionActions component"
```

---

## Task 4: Create `BpmnVersionDiffOverlay` component

**Files:**
- Create: `frontend/src/features/process/stage/ui/BpmnVersionDiffOverlay.jsx`
- Uses: `frontend/src/features/process/bpmn/diff/semanticDiff.js`

- [ ] **Step 1: Write the component**

```jsx
import { useEffect, useRef, useState, useMemo } from "react";
import { buildSemanticBpmnDiff } from "../../bpmn/diff/semanticDiff";
import pmModdleDescriptor from "../../robotmeta/pmModdleDescriptor";
import camundaModdleDescriptor from "../../camunda/camundaModdleDescriptor";

function diffSummaryText(diff) {
  if (!diff?.ok) return String(diff?.error || "Не удалось построить diff.");
  const s = diff.summary || {};
  const parts = [];
  const added = (s.added?.tasks || 0) + (s.added?.flows || 0) + (s.added?.lanes || 0) + (s.added?.subprocess || 0);
  const removed = (s.removed?.tasks || 0) + (s.removed?.flows || 0) + (s.removed?.lanes || 0) + (s.removed?.subprocess || 0);
  const changed = (s.changed?.tasks || 0) + (s.changed?.flows || 0) + (s.changed?.lanes || 0) + (s.changed?.subprocess || 0) + (s.changed?.conditions || 0);
  if (added) parts.push(`+${added}`);
  if (removed) parts.push(`−${removed}`);
  if (changed) parts.push(`~${changed}`);
  return parts.length ? `Изменения: ${parts.join(", ")}` : "Изменений нет";
}

function collectChangedIds(diff) {
  if (!diff?.ok) return { added: [], removed: [], changed: [] };
  const added = [
    ...asArray(diff.details?.tasks?.added).map((x) => x.id),
    ...asArray(diff.details?.flows?.added).map((x) => x.id),
    ...asArray(diff.details?.lanes?.added).map((x) => x.id),
    ...asArray(diff.details?.subprocess?.added).map((x) => x.id),
  ].filter(Boolean);
  const removed = [
    ...asArray(diff.details?.tasks?.removed).map((x) => x.id),
    ...asArray(diff.details?.flows?.removed).map((x) => x.id),
    ...asArray(diff.details?.lanes?.removed).map((x) => x.id),
    ...asArray(diff.details?.subprocess?.removed).map((x) => x.id),
  ].filter(Boolean);
  const changed = [
    ...asArray(diff.details?.tasks?.changed).map((x) => x.id),
    ...asArray(diff.details?.flows?.changed).map((x) => x.id),
    ...asArray(diff.details?.lanes?.changed).map((x) => x.id),
    ...asArray(diff.details?.subprocess?.changed).map((x) => x.id),
    ...asArray(diff.details?.conditions?.changed).map((x) => x.key),
  ].filter(Boolean);
  return { added, removed, changed };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function BpmnVersionDiffOverlay({ baseXml, targetXml, baseLabel, targetLabel }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const diff = useMemo(() => {
    if (!String(baseXml || "").trim() || !String(targetXml || "").trim()) return null;
    return buildSemanticBpmnDiff(baseXml, targetXml);
  }, [baseXml, targetXml]);

  useEffect(() => {
    let cancelled = false;
    let viewer = null;

    async function render() {
      if (!containerRef.current) return;
      if (!diff || !diff.ok) {
        setStatus(diff ? "error" : "idle");
        setError(diff?.error || "");
        return;
      }
      setStatus("loading");
      setError("");

      try {
        if (!viewerRef.current) {
          const mod = await import("bpmn-js/lib/NavigatedViewer");
          const Viewer = mod.default || mod.NavigatedViewer || mod;
          viewer = new Viewer({
            container: containerRef.current,
            moddleExtensions: { pm: pmModdleDescriptor, camunda: camundaModdleDescriptor },
          });
          viewerRef.current = viewer;
        } else {
          viewer = viewerRef.current;
        }
        await viewer.importXML(String(baseXml || ""));
        if (cancelled) return;
        viewer.get("canvas").zoom("fit-viewport");

        const { added, removed, changed } = collectChangedIds(diff);
        const overlays = viewer.get("overlays");
        [...added, ...changed].forEach((id) => {
          try {
            overlays.add(id, {
              position: { top: -10, right: -10 },
              html: `<div class="bpmn-diff-badge bpmn-diff-badge--added">+</div>`,
            });
          } catch {}
        });
        removed.forEach((id) => {
          try {
            overlays.add(id, {
              position: { top: -10, right: -10 },
              html: `<div class="bpmn-diff-badge bpmn-diff-badge--removed">−</div>`,
            });
          } catch {}
        });
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(String(err?.message || err || "Не удалось отобразить diff."));
      }
    }

    render();

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        try { viewerRef.current.destroy(); } catch {}
        viewerRef.current = null;
      }
    };
  }, [baseXml, diff]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{baseLabel || "База"} → {targetLabel || "Цель"}</span>
        <span>{diffSummaryText(diff)}</span>
      </div>
      <div className="relative h-[50vh] overflow-hidden rounded-xl border border-border bg-panel">
        {status === "loading" ? (
          <div className="grid h-full place-items-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          </div>
        ) : status === "error" ? (
          <div className="grid h-full place-items-center px-4 text-sm text-danger">{error}</div>
        ) : (
          <div ref={containerRef} className="h-full w-full" />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add minimal diff badge CSS to tailwind.css**

```css
.bpmn-diff-badge {
  @apply flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm;
}
.bpmn-diff-badge--added {
  @apply bg-emerald-500;
}
.bpmn-diff-badge--removed {
  @apply bg-red-500;
}
.bpmn-diff-badge--changed {
  @apply bg-amber-500;
}
```

- [ ] **Step 3: Build and commit**

```bash
cd /opt/processmap-test/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /opt/processmap-test && git add frontend/src/features/process/stage/ui/BpmnVersionDiffOverlay.jsx frontend/src/styles/tailwind.css && git commit -m "feat(bpmn-versions): add BpmnVersionDiffOverlay component"
```

---

## Task 5: Wire components into `ProcessDialogs.jsx`

**Files:**
- Modify: `frontend/src/features/process/stage/ui/ProcessDialogs.jsx`

- [ ] **Step 1: Update imports and props**

Add imports near the top:

```jsx
import BpmnVersionList from "./BpmnVersionList";
import BpmnVersionPreview from "./BpmnVersionPreview";
import BpmnVersionActions from "./BpmnVersionActions";
```

Destructure these new props from `view` (add after existing version-related props):

```jsx
currentVersionId,
versionXmlCache,
onSaveCurrentTab,
```

- [ ] **Step 2: Replace the versions modal body and footer**

Replace lines 232–407 (the whole `Modal` with `open={versionsOpen}`) with:

```jsx
      <Modal
        open={versionsOpen}
        title="История версий BPMN"
        onClose={closeVersionsDialog}
        footer={(
          <BpmnVersionActions
            selectedVersion={previewSnapshot}
            currentVersionId={currentVersionId}
            busy={versionsBusy}
            showXml={false}
            onRestore={restoreSnapshot}
            onDownload={downloadSnapshot}
            onDiffWithCurrent={openDiffForSnapshot}
            onClose={closeVersionsDialog}
          />
        )}
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,30%)_minmax(0,70%)]" data-testid="bpmn-versions-modal">
          <div className="rounded-xl border border-border bg-panel2/45 p-3">
            <BpmnVersionList
              versions={versionsList}
              selectedId={previewSnapshotId}
              currentVersionId={currentVersionId}
              busy={versionsBusy}
              loadState={versionsLoadState}
              loadError={versionsLoadError}
              emptyMessage={revisionEmptyState?.message}
              onSelect={previewSnapshotVersion}
              onDownload={downloadSnapshot}
              onRestore={restoreSnapshot}
              onDiffWithCurrent={openDiffForSnapshot}
              onDiffAB={() => {
                const latestId = String(asArray(versionsList)[0]?.id || "");
                const prevId = String(asArray(versionsList)[1]?.id || "");
                if (!latestId || !prevId) {
                  setGenErr("Для сравнения нужно минимум две версии.");
                  return;
                }
                setDiffTargetSnapshotId(latestId);
                setDiffBaseSnapshotId(prevId);
                openDiffDialog();
              }}
              onSaveSession={onSaveCurrentTab}
            />
          </div>
          <BpmnVersionPreview
            xml={previewSnapshot?.xml}
            label={previewSnapshot ? `${snapshotLabel(previewSnapshot)} · ${formatSnapshotTs(previewSnapshot?.ts)}` : ""}
            size={previewSnapshot?.len}
            onDownload={() => previewSnapshot && downloadSnapshot(previewSnapshot)}
          />
        </div>
      </Modal>
```

- [ ] **Step 3: Build and commit**

```bash
cd /opt/processmap-test/frontend && npm run build 2>&1 | tail -10
```

```bash
cd /opt/processmap-test && git add frontend/src/features/process/stage/ui/ProcessDialogs.jsx && git commit -m "feat(bpmn-versions): wire new components into versions modal"
```

---

## Task 6: Update `ProcessStage.jsx` state and data flow

**Files:**
- Modify: `frontend/src/components/ProcessStage.jsx`

- [ ] **Step 1: Add state for diff summaries and current version id**

Add near other version state declarations (around line 825):

```jsx
const [versionDiffSummaries, setVersionDiffSummaries] = useState({});
```

- [ ] **Step 2: Derive `currentVersionId`**

Add a memo near the dialogs view construction:

```jsx
const currentVersionId = useMemo(() => {
  const hash = bpmnVersionTruthState?.currentSessionPayloadHash || "";
  if (!hash) return "";
  return asArray(versionsList).find((item) => String(item?.sessionPayloadHash || "") === hash)?.id || "";
}, [versionsList, bpmnVersionTruthState]);
```

- [ ] **Step 3: Auto-select first version when modal opens**

Add a `useEffect`:

```jsx
useEffect(() => {
  if (!versionsOpen) return;
  const list = asArray(versionsList);
  if (!previewSnapshotId && list.length > 0) {
    const first = list[0];
    setPreviewSnapshotId(String(first?.id || ""));
    void ensureBpmnVersionXml(first);
  }
}, [versionsOpen, versionsList, previewSnapshotId, ensureBpmnVersionXml]);
```

- [ ] **Step 4: Compute diff summaries for visible versions**

Add a `useEffect`:

```jsx
useEffect(() => {
  let cancelled = false;
  const list = asArray(versionsList);
  if (list.length < 2) return;

  async function compute() {
    const next = {};
    for (let i = 0; i < Math.min(list.length, 10); i += 1) {
      const item = list[i];
      const prev = list[i + 1];
      if (!prev) continue;
      const itemId = String(item?.id || "");
      const prevId = String(prev?.id || "");
      if (versionDiffSummaries[itemId]) continue;
      const [a, b] = await Promise.all([
        ensureBpmnVersionXml(itemId),
        ensureBpmnVersionXml(prevId),
      ]);
      if (cancelled) return;
      if (a?.xml && b?.xml) {
        const diff = buildSemanticBpmnDiff(b.xml, a.xml);
        if (diff?.ok) {
          const s = diff.summary || {};
          const parts = [];
          const added = (s.added?.tasks || 0) + (s.added?.flows || 0);
          const removed = (s.removed?.tasks || 0) + (s.removed?.flows || 0);
          const changed = (s.changed?.tasks || 0) + (s.changed?.flows || 0);
          if (added) parts.push(`+${added} задач`);
          if (removed) parts.push(`−${removed} задач`);
          if (changed) parts.push(`~${changed} изменено`);
          next[itemId] = parts.length ? parts.join(", ") : "без изменений";
        }
      }
    }
    if (!cancelled && Object.keys(next).length) {
      setVersionDiffSummaries((prev) => ({ ...prev, ...next }));
    }
  }

  compute();
  return () => { cancelled = true; };
}, [versionsList, ensureBpmnVersionXml, versionDiffSummaries]);
```

- [ ] **Step 5: Pass diff summaries into version list data**

Where `versionsList` is passed to `buildTopPanelsView` / `dialogsView`, map over it to attach summaries:

```jsx
const versionsListWithSummaries = useMemo(
  () => asArray(versionsList).map((item) => ({
    ...item,
    diffSummary: versionDiffSummaries[String(item?.id || "")] || "",
  })),
  [versionsList, versionDiffSummaries],
);
```

Then pass `versionsListWithSummaries` instead of `versionsList` to the dialogs view, and pass `currentVersionId` and `onSaveCurrentTab: handleSaveCurrentTab`.

- [ ] **Step 6: Build and commit**

```bash
cd /opt/processmap-test/frontend && npm run build 2>&1 | tail -10
```

```bash
cd /opt/processmap-test && git add frontend/src/components/ProcessStage.jsx && git commit -m "feat(bpmn-versions): auto-select, diff summaries, current version id"
```

---

## Task 7: Update the diff modal to use `BpmnVersionDiffOverlay`

**Files:**
- Modify: `frontend/src/features/process/stage/ui/ProcessDialogs.jsx`

- [ ] **Step 1: Add import**

```jsx
import BpmnVersionDiffOverlay from "./BpmnVersionDiffOverlay";
```

- [ ] **Step 2: Replace diff modal body**

Replace the diff modal body (around lines 421–531) with:

```jsx
        <div className="space-y-3" data-testid="bpmn-versions-diff-modal">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block space-y-1 text-xs text-muted">
              <span>Версия А (база)</span>
              <select
                className="select w-full"
                value={String(diffBaseSnapshotId || "")}
                onChange={(e) => setDiffBaseId(String(e.target.value || ""))}
                data-testid="bpmn-diff-base-select"
              >
                <option value="">Выберите версию</option>
                {asArray(versionsList).map((item) => {
                  const id = String(item?.id || "");
                  return (
                    <option key={`base_${id}`} value={id}>
                      {snapshotLabel(item)} · {formatSnapshotTs(item?.ts)}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="block space-y-1 text-xs text-muted">
              <span>Версия B (цель)</span>
              <select
                className="select w-full"
                value={String(diffTargetSnapshotId || "")}
                onChange={(e) => setDiffTargetId(String(e.target.value || ""))}
                data-testid="bpmn-diff-target-select"
              >
                <option value="">Выберите версию</option>
                {asArray(versionsList).map((item) => {
                  const id = String(item?.id || "");
                  return (
                    <option key={`target_${id}`} value={id}>
                      {snapshotLabel(item)} · {formatSnapshotTs(item?.ts)}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          {diffBaseSnapshotId && diffTargetSnapshotId ? (
            <BpmnVersionDiffOverlay
              baseXml={asArray(versionsList).find((i) => String(i?.id || "") === String(diffBaseSnapshotId || ""))?.xml}
              targetXml={asArray(versionsList).find((i) => String(i?.id || "") === String(diffTargetSnapshotId || ""))?.xml}
              baseLabel={snapshotLabel(asArray(versionsList).find((i) => String(i?.id || "") === String(diffBaseSnapshotId || "")))}
              targetLabel={snapshotLabel(asArray(versionsList).find((i) => String(i?.id || "") === String(diffTargetSnapshotId || "")))}
            />
          ) : (
            <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted">
              Выберите две версии для сравнения.
            </div>
          )}
        </div>
```

- [ ] **Step 3: Build and commit**

```bash
cd /opt/processmap-test/frontend && npm run build 2>&1 | tail -10
```

```bash
cd /opt/processmap-test && git add frontend/src/features/process/stage/ui/ProcessDialogs.jsx && git commit -m "feat(bpmn-versions): use overlay viewer in diff modal"
```

---

## Task 8: Add Playwright verification

**Files:**
- Create: `/root/ui_verify/verify_bpmn_versions_modal.js`

- [ ] **Step 1: Write the test**

```js
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.STAGE_URL || 'http://clearvestnic.ru:5177';
const PROJECT = process.env.PROJECT_ID || 'b1c8a56b6e';
const SESSION = process.env.SESSION_ID || '03db107ebb';
const OUT_DIR = path.join(__dirname, 'screenshots');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const failures = [];
  function expect(condition, message) {
    if (!condition) {
      failures.push(message);
      console.error(`FAIL: ${message}`);
    }
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('input[type="email"]', 'admin@local');
  await page.fill('input[type="password"]', 'admin');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname.startsWith('/app'), { timeout: 15000 });
  try { await page.click('text=Default', { timeout: 5000 }); } catch {}

  await page.goto(`${BASE}/app?project=${PROJECT}&session=${SESSION}`, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(4000);

  // Open versions modal via toolbar ellipsis menu.
  const overflowToggle = page.locator('[data-testid="diagram-toolbar-overflow-toggle"]').first();
  await overflowToggle.click({ force: true });
  await sleep(300);
  await page.locator('[data-testid="bpmn-versions-open"]').click();
  await sleep(800);

  const modal = page.locator('[data-testid="bpmn-versions-modal"]').first();
  await expect(await modal.isVisible().catch(() => false), 'versions modal is open');

  // First version should be auto-selected and preview rendered.
  const previewCanvas = page.locator('[data-testid="bpmn-version-preview-canvas"]').first();
  await expect(await previewCanvas.isVisible().catch(() => false), 'version preview canvas is visible');

  await page.screenshot({ path: path.join(OUT_DIR, 'bpmn_versions_modal.png'), fullPage: false });

  await browser.close();

  if (failures.length > 0) {
    console.error(`\n${failures.length} verification failure(s).`);
    process.exit(1);
  }
  console.log('\nPASS: BPMN versions modal renders preview.');
})();
```

- [ ] **Step 2: Run it after deployment**

```bash
cd /root/ui_verify && node verify_bpmn_versions_modal.js
```

Expected: PASS.

---

## Task 9: Final build and deploy to `clearvestnic.ru:5177`

- [ ] **Step 1: Full build**

```bash
cd /opt/processmap-test/frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 2: Deploy dev container**

```bash
cd /opt/processmap-test
 docker compose -p processmap_v1 build --no-cache frontend
 docker compose -p processmap_v1 up -d --force-recreate -V frontend
```

- [ ] **Step 3: Verify on stage**

```bash
cd /root/ui_verify && node verify_bpmn_versions_modal.js
```

Expected: PASS.

- [ ] **Step 4: Push branch**

```bash
cd /opt/processmap-test && git push origin feat/admin-redesign-v1
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Right panel visual preview | Task 1, 5, 6 |
| Auto-load on select | Task 6 (Step 3) |
| Fit-to-viewport | Task 1 |
| Spinner/skeleton | Task 1 |
| Corrupted XML error | Task 1 |
| Left panel compact, no explanations | Task 2 |
| Version facts (number, date, author, size, hash) | Task 2 |
| Diff summary vs previous | Task 2, 6 |
| Visual diff overlay | Task 4, 7 |
| Action buttons regrouped | Task 3, 5 |
| Empty/one-version edge cases | Task 2 |
| Build + Playwright | Task 8, 9 |
