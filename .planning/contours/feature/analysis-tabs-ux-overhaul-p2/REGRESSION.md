# Regression Audit: analysis-tabs-ux-overhaul-p2

**Repo:** `/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone`  
**Baseline:** `0fd01f16` (pre-PR #829)  
**Current:** `c9abdb25` (`origin/main`)  
**Scope:** `frontend/src/features/process/analysis/`, `frontend/src/components/process/interview/`, `frontend/src/components/process/InterviewStage.jsx`

## Methodology

- `git diff --name-only 0fd01f16..c9abdb25 -- <paths>` to identify changed files.
- `git diff 0fd01f16..c9abdb25 -- <file>` and `git show <commit>:<file>` for pre/post comparison.
- `grep` to verify whether reported UI elements still exist or are wired into the tab rendering.
- Static/code-level audit; runtime screenshots from `.planning/contours/feature/analysis-tabs-ux-overhaul/evidence/` were used as secondary reference.

## Executive Summary

| Category | Verdict |
|---|---|
| Summary tab rich content | **Pre-existing loss** — already missing at `0fd01f16` (introduced by PR #828). Must restore. |
| Branches tab Russian filters / add transition / condition badges | **Pre-existing loss** — already missing at `0fd01f16`. Must restore/localize. |
| Steps table subprocess collapsing / status chips | **Pre-existing loss** — `VirtualStepsTable` was already flat at `0fd01f16`. Must restore. |
| Toolbar clutter / duplicate "Порядок: BPMN" | **Introduced in PR #829** by `TimelineControls.jsx` redesign. Must fix. |
| Companion panel collapsibility | **Introduced in PR #829** — `<details>` replaced with always-open `<div>`. Must restore collapse. |
| Boundaries summary-after-save visibility | **Changed in PR #829** — summary row moved below cards. Must move back. |

---

## Losses Introduced in `0fd01f16..c9abdb25` (PR #829)

### 1. Timeline / Actions tab — toolbar clutter and duplicate controls

**File:** `frontend/src/components/process/interview/TimelineControls.jsx`

| Element | Pre-PR (`0fd01f16`) | Current (`c9abdb25`) | Resolution |
|---|---|---|---|
| Advanced controls toggle | Single "Дополнительно · {activeViewLabel}" button hid the utility row (`data-testid="interview-advanced-toggle"`, lines ~288-296). | Removed. View-mode buttons, Filters, Binding assistant, and order select are now always visible in the primary row (lines 253-311). | **Restore-in-new-style:** keep primary row minimal (+Добавить шаг, search, quick input) and move non-essential controls back behind a single "Дополнительно" toggle. |
| "Порядок: BPMN" label | Shown only inside the `<select>` (lines ~307-311). | Shown inside `<select>` **and** repeated in a bottom hint span (lines 607-609). | **Restore:** remove the duplicate bottom hint or make it show only the fallback reason, not the same label. |
| "Быстрый ввод" placement | In primary row as a secondary button (pre-PR lines ~265-274). | Moved to a separate chip below the primary row (lines 565-604). | **Restore-in-new-style:** move back to primary row if quick input is a primary action, or keep as chip if deliberate. |
| Selected-step group button | Visible button "Выделено: N" appeared when steps selected (pre-PR lines ~332-346). | Only inside the "Ещё" menu (lines 379-394). | **Restore:** surface the group button when `selectedStepCount > 0`; burying it adds friction. |
| Filter summary tooltip | "Фильтры" button had `title={filterSummary}` showing active filters (pre-PR line ~324). | Tooltip removed. | **Restore:** re-add the tooltip or an equivalent filter-summary chip. |
| "Свернуть фильтры" button | Present inside filter chips (pre-PR lines ~623-625). | Removed. | **Restore-in-new-style:** the "Фильтры" toggle now acts as collapse, but an explicit "Свернуть фильтры" improves discoverability. |

### 2. Steps tab — companion panel no longer collapsible

**File:** `frontend/src/components/process/InterviewStage.jsx`

| Element | Pre-PR (`0fd01f16`) | Current (`c9abdb25`) | Resolution |
|---|---|---|---|
| "Шаг и продукт" panel | Collapsible `<details open>` (lines ~803-813 pre-PR). | Always-open `<div className={analysisStyles.analysisCompanionCard}>` (lines 803-813 current). | **Restore-in-new-style:** make the companion card collapsible again, or provide a collapse affordance. |
| "RAG-агент" panel | Collapsible `<details>` (pre-PR lines ~813-817). | Always-open `<div>` (current lines 813-817). | **Restore-in-new-style:** same as above. |

`ProductActionsPanel` and `RagSearchPanel` still receive the same props; no functional data loss, only loss of collapsibility.

### 3. Boundaries tab — summary-after-save visibility degraded

**File:** `frontend/src/components/process/interview/BoundariesBlock.jsx`

| Element | Pre-PR (`0fd01f16`) | Current (`c9abdb25`) | Resolution |
|---|---|---|---|
| `BoundsSummaryRow` position | At the top of the block, acting as a navigation stepper (pre-PR line ~209). | Moved below the three stepper cards (current lines 228-236). | **Restore:** move summary row back to the top so it functions as navigation and save confirmation is visible. |
| Save notice visibility | Appeared directly below the top summary row (pre-PR line ~215). | Appears below the bottom summary row, after the cards (current line 238). | **Restore:** if summary stays at top, keep notice near it; otherwise add a toast/inline confirmation near the save button. |
| Stepper visual | Cards rendered in `interviewBoundsGrid`. | Cards rendered in `styles.analysisStepper` / `styles.analysisStepperTrack` (current lines 177-226). | **Keep** — stepper is the new design language, but summary should remain navigational. |
| "Изменить" behavior | Scrolls to intermediate card (`scrollToCard("intermediate")`). | Same behavior. | **No action** — behavior preserved. |

---

## Pre-existing Losses (already absent at `0fd01f16`)

These were reported by the owner but were **not introduced** by PR #829. They date to the earlier redesign PR #828 (`feature/analysis-tabs-redesign`). This contour restores them.

### 4. Summary tab — rich summary metrics missing

**Files:**
- `frontend/src/features/process/analysis/ProcessAnalysisSummaryTab.jsx:36-65` — renders only `model.kpi_cards` (lead, active, wait, throughput).
- `frontend/src/components/process/interview/SummaryBlock.jsx:9-168` — contains the richer layout but is **dead code**.
- `frontend/src/components/process/InterviewStage.jsx:13` — imports `SummaryBlock` but never uses it.
- `frontend/src/features/process/analysis/processAnalysisModel.js:107-194` — `buildSummaryPropsFromProcessMetrics` already prepares data for `SummaryBlock`.

Missing elements to restore:
- "Mainline время" / "Средняя длительность шага"
- "Привязка к BPMN (N/N, %)"
- "Топ-3 ожидания"
- Collapsible "Дополнительно: распределения, AI и диагностика покрытия"

**Resolution:** Replace `<ProcessAnalysisSummaryTab />` with `<SummaryBlock {...buildSummaryPropsFromProcessMetrics(model.metrics)} />`, or extend `ProcessAnalysisSummaryTab` to render the same sections using existing `model` data.

### 5. Branches tab — Russian filters, add transition, condition badges missing

**Files:**
- `frontend/src/features/process/analysis/ProcessAnalysisBranchesTab.jsx:84-123` — uses `VirtualBranchesTable`.
- `frontend/src/features/process/analysis/ui/VirtualBranchesTable.jsx:37-44` — English headers: `From`, `To`, `Condition`, `Actions`.
- `frontend/src/features/process/analysis/ui/VirtualBranchesTable.jsx:80-104` — English buttons: `Save`, `Edit`.
- `frontend/src/components/process/interview/transitions/BpmnBranchesPanel.jsx:35-311` — richer panel with "Проблемные", "Группировать по From", "+ Добавить переход", condition badges, insert-between.
- `frontend/src/components/process/interview/TransitionsBlock.jsx:1-5` — re-exports `BpmnBranchesPanel` but is **dead code**.
- `frontend/src/components/process/InterviewStage.jsx` — never renders `TransitionsBlock`.

**Resolution:** Either switch the branches tab back to `TransitionsBlock` / `BpmnBranchesPanel`, or port the missing Russian labels, filters, add-transition button, and condition badges into `VirtualBranchesTable`.

### 6. Steps table — subprocess tree collapsing and status chips missing

**Files:**
- `frontend/src/features/process/analysis/ui/VirtualStepsTable.jsx:97-237` — flat rows; no subprocess collapsing; status cell shows only tier, product-action count, and BPMN bind badge.
- `frontend/src/components/process/interview/TimelineTable.jsx` and `TimelineRow.jsx` — contain subprocess toggling (`collapsedSubprocessByStepId`), AI count chip (`AI: N`), branch summary, step type meta, but are **dead code**.

**Resolution:** Either resurrect `TimelineTable`/`TimelineRow` for the matrix view, or add subprocess grouping/collapse, AI-count chip, and step-type label to `VirtualStepsTable`.

---

## Dead Code Identified

| File | Reason |
|---|---|
| `frontend/src/components/process/interview/SummaryBlock.jsx` | Imported but never rendered. |
| `frontend/src/components/process/interview/TransitionsBlock.jsx` | Re-exports `BpmnBranchesPanel`; imported but never rendered. |
| `frontend/src/components/process/interview/transitions/BpmnBranchesPanel.jsx` | Only used by dead `TransitionsBlock`. |
| `frontend/src/components/process/interview/TimelineTable.jsx` | Imported but never rendered. |
| `frontend/src/components/process/interview/TimelineRow.jsx` | Only used by dead `TimelineTable`. |

## Recommendations (priority order)

1. **Toolbar:** collapse non-primary controls behind a single toggle and remove duplicate "Порядок: BPMN" hint.
2. **Boundaries:** move `BoundsSummaryRow` back above the stepper cards so save confirmation is visible and summary serves navigation.
3. **Companion panels:** restore collapse affordance for "Шаг и продукт" and "RAG-агент".
4. **Summary tab:** wire `SummaryBlock` or extend `ProcessAnalysisSummaryTab` to restore rich metrics.
5. **Branches tab:** restore Russian labels/filters/add-transition either by switching to `BpmnBranchesPanel` or enhancing `VirtualBranchesTable`.
6. **Steps table:** restore subprocess collapsing and status chips, or remove dead `TimelineTable` code.
7. **Cleanup:** remove or deprecate dead components once a direction is chosen.
