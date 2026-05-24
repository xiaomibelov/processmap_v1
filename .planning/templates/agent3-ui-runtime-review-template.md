# Agent 3 — UI Runtime Review Template

> **Purpose:** reusable template for Agent 3 runtime reviews of UI contours.  
> **Copy this file** into the contour review folder and fill it out.  
> **Do not edit this template directly.**

---

## 0. Reviewer GSD Discipline — Mandatory

Before any verdict, Agent 3 MUST:

1. **GSD availability check**
   - `command -v gsd || true`
   - `command -v gsd-sdk || true`
   - `test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"`
   - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"`

2. **Source/runtime truth**
   - `git status -sb`, `git branch --show-current`, `git rev-parse HEAD`
   - `curl -s http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)`
   - Served JS/CSS asset names

3. **Exact user scenario reproduction**
   - Identify the exact user scenario from PLAN.md before testing
   - Test the real user scenario, not just programmatic proxies
   - Record before/after evidence with numbers

4. **Before/after evidence**
   - Screenshots or metrics proving material improvement
   - If metrics are noisy, run 3 attempts and report median

**REVIEW_PASS is FORBIDDEN if:**
- GSD discipline section is missing from REVIEW_REPORT.md
- Real drag was not tested with actual mouse events
- 5180 runtime was not verified fresh
- Visible version/update row is missing or stale
- Element drag is impossible without clear edit path
- Lag remains materially present and is dismissed as "acceptable"

---

## 1. Source truth

| Field | Value |
|-------|-------|
| Contour ID | `{{CONTOUR_ID}}` |
| Runtime URL | `{{RUNTIME_URL}}` |
| Repo root | `{{REPO_ROOT}}` |
| Target surface | `{{TARGET_SURFACE}}` |
| Files changed (from EXEC_REPORT.md) | `{{FILES_CHANGED_SUMMARY}}` |

---

## 2. Required reads (check before starting)

- [ ] `PROCESSMAP_AGENT3_UI_REVIEW_SKILL.md`
- [ ] `PROCESSMAP_AGENT3_PLAYWRIGHT_REVIEW_BINDING.md`
- [ ] Contour `PLAN.md`
- [ ] Contour `EXEC_REPORT.md`

---

## 3. Runtime inspection

### 3.1 Environment
- Browser / viewport: `{{BROWSER_VIEWPORT}}`
- Playwright MCP available: `{{YES/NO}}`

### 3.2 Navigation
- [ ] Actual runtime opened through Playwright
- [ ] Navigated to target surface
- [ ] Relevant modals / panels / sidebars opened if applicable

### 3.3 Implemented behavior
- [ ] Behavior matches contour scope
- [ ] Data renders correctly

### 3.4 Console and network
- [ ] Console checked
- [ ] Network checked
- Console errors (if any): `{{CONSOLE_ERRORS}}`
- Network errors (if any): `{{NETWORK_ERRORS}}`

### 3.5 Evidence
- Screenshot paths: `{{SCREENSHOT_PATHS}}`
- Justification if no screenshots: `{{JUSTIFICATION}}`

---

## 4. UI rubric checks

### 4.1 Density and layout
- [ ] Dense operational data is table-first, not card-first
- [ ] Hover / selected states are paint-only
- [ ] No row height change on hover / selection
- [ ] No layout shift on hover / selection
- [ ] No accidental horizontal scrollbar (unless justified)
- [ ] Light theme readable
- [ ] Dark theme readable

### 4.2 State coverage
- [ ] Loading state checked (if relevant)
- [ ] Empty state checked (if relevant)
- [ ] Error state checked (if relevant)
- [ ] Long text does not break layout
- [ ] Narrow viewport does not make target unusable (if relevant)

### 4.3 Visual hierarchy
- [ ] Status is compact and visually quiet
- [ ] Main title / content is left-oriented and primary
- [ ] Secondary metadata does not dominate the row

### 4.4 Interactivity
- [ ] Buttons look clickable with visible hover / focus affordance
- [ ] Icons are not the only way to understand action (title / aria / tooltip present)

### 4.5 Anti-patterns

### 4.6 UI/UX Pro Max discipline
- [ ] Design system from `ui-ux-pro-max` skill is documented in EXEC_REPORT.md (style, colors, typography)
- [ ] Contrast ratio ≥ 4.5:1 verified for body text (use browser dev tools or contrast checker)
- [ ] Focus states visible on all interactive elements (Tab through the page)
- [ ] Touch targets ≥ 44×44px on buttons and icons
- [ ] Animation timing 150–300ms (no instant snaps, no >500ms delays)
- [ ] `prefers-reduced-motion` respected (disable animations in OS settings and retest)
- [ ] No emoji used as structural icons (only SVG)
- [ ] Semantic color tokens used (no raw hex scattered in component files)
- [ ] Loading skeletons shown for async data (not spinners or blank space)
- [ ] `aria-label` present on icon-only buttons

- [ ] No “кислотные” row fills for dense working tables
- [ ] No “cardification” of strict operational tables

---

## 5. ProcessMap-specific checks

### 5.1 Lane display
- [ ] Same lane rendered as `L1 / L2 / L3`
- [ ] Transition rendered as `L1 → L2`
- [ ] Full lane names only in title / tooltip

### 5.2 Product Actions (if relevant)
- [ ] Accepted actions are durable truth
- [ ] Draft AI suggestions are not durable truth
- [ ] Accepted actions visible in “Все действия”
- [ ] No auto-apply before user action
- [ ] No BPMN XML mutation
- [ ] AI suggestions reusable without unnecessary repeated AI calls
- [ ] Already processed steps skipped where applicable

### 5.3 RAG panel (if relevant)
- [ ] RAG is read-only context / suggestion layer
- [ ] No auto-mutation
- [ ] No BPMN XML mutation
- [ ] Results readable
- [ ] Input / select / button layout compact and clear

### 5.4 Analysis table (if relevant)
- [ ] Strict table layout
- [ ] No layout shift
- [ ] Hover / selected paint-only
- [ ] Lane / product-action indicators quiet but visible
- [ ] No excessive cards

### 5.5 Companion / sidebar (if relevant)
- [ ] Compact density
- [ ] No huge empty vertical gaps
- [ ] Readable in light / dark
- [ ] No clipping / overflow regressions

---

## 6. Verdict

**Selected verdict:** `{{REVIEW_PASS / CHANGES_REQUESTED / REVIEW_BLOCKED}}`

**Reasoning:**
`{{DETAILED_REASONING}}`

---

## 7. Marker files

| Verdict | Marker files to create |
|---------|------------------------|
| `REVIEW_PASS` | `REVIEW_REPORT.md` + `REVIEW_PASS` |
| `CHANGES_REQUESTED` | `REVIEW_REPORT.md` + `CHANGES_REQUESTED` + `REWORK_REQUEST.md` |
| `REVIEW_BLOCKED` | `REVIEW_BLOCKED.md` |

- [ ] Correct marker files created

---

> **Reviewed by:** Agent 3  
> **Date:** `{{DATE}}`
