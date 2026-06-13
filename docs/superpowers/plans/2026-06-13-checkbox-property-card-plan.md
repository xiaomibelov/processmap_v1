# Checkbox-driven property card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a BPMN property `fpc-show-properties` that, when truthy, renders a compact property card above the task (up to 5 rows, colored keys, hover expand, gap), while keeping the existing colored badge.

**Architecture:** The parser flags the checkbox in the overlay descriptor. `BpmnStage.jsx` mounts a second HTML overlay (the card) next to the badge for flagged elements. Styles live in the already-loaded `legacy_bpmn.css`. A UI checkbox in the properties panel adds/removes the `fpc-show-properties` row through the existing extension-state draft.

**Tech Stack:** React, bpmn-js, Vite, plain CSS, Node test runner for parser tests.

---

## Task 1: Detect `fpc-show-properties` in the parser

**Files:**
- Modify: `frontend/src/components/process/utils/bpmnOverlayParser.js`
- Test: `/mnt/agents/output/overlay_parser_test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `/mnt/agents/output/overlay_parser_test.mjs` (after the existing `auto overlay` tests):

```js
{
  const props = [
    { name: "fpc-show-properties", value: "true" },
    { name: "ingredient", value: "cream" },
  ];
  const overlay = parseOverlayFromProperties(props, "Task_1", "Add ingredient");
  assert.strictEqual(overlay.showProperties, true, "should detect fpc-show-properties");
  assert.ok(!overlay.properties, "parseOverlayFromProperties does not attach properties");
}

{
  const props = [
    { name: "fpc-show-properties", value: "false" },
    { name: "ingredient", value: "cream" },
  ];
  const overlay = parseOverlayFromProperties(props, "Task_2", "Add ingredient");
  assert.strictEqual(overlay.showProperties, false, "should not enable card for false value");
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node /mnt/agents/output/overlay_parser_test.mjs`
Expected: FAIL — `overlay.showProperties` is `undefined`.

- [ ] **Step 3: Implement parser change**

In `frontend/src/components/process/utils/bpmnOverlayParser.js`:

1. Update `isOverlayMetaProperty`:

```js
function isOverlayMetaProperty(name) {
  const n = String(name).trim().toLowerCase();
  return n === "fpc-overlay-v2" || n.startsWith("fpc:overlay:") || n === "fpc-show-properties" || n === "fpc:show-properties";
}
```

2. Add helper:

```js
function isShowPropertiesFlag(name) {
  const n = String(name).trim().toLowerCase();
  return n === "fpc-show-properties" || n === "fpc:show-properties";
}

function readShowPropertiesFlag(props) {
  const flag = asArray(props).find((p) => isShowPropertiesFlag(p?.name));
  if (!flag) return false;
  const v = String(flag.value ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
```

3. In `parseOverlayFromProperties`, add `showProperties: readShowPropertiesFlag(props)` to all three return points (JSON, prefixed, auto-generated).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node /mnt/agents/output/overlay_parser_test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/process/utils/bpmnOverlayParser.js /mnt/agents/output/overlay_parser_test.mjs
git commit -m "feat(overlay): detect fpc-show-properties checkbox in parser"
```

---

## Task 2: Add property-card styles

**Files:**
- Modify: `frontend/src/styles/legacy/legacy_bpmn.css`

- [ ] **Step 1: Append the new styles**

Add at the bottom of `frontend/src/styles/legacy/legacy_bpmn.css`:

```css
/* V2 checkbox-driven property card above tasks */
.fpc-overlay-property-card {
  position: relative;
  box-sizing: border-box;
  padding: 6px 8px;
  background: #fff9c4;
  color: #333333;
  border: 1px solid #fbc02d;
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  font-size: 10px;
  line-height: 1.35;
  overflow: hidden;
  user-select: none;
  pointer-events: auto;
}

.fpc-overlay-property-card__title {
  font-weight: 700;
  font-size: 11px;
  margin-bottom: 4px;
  padding-bottom: 3px;
  border-bottom: 1px dashed #fbc02d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fpc-overlay-property-card__list,
.fpc-overlay-property-card__extra {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fpc-overlay-property-card__extra {
  display: none;
}

.fpc-overlay-property-card:hover .fpc-overlay-property-card__extra {
  display: flex;
}

.fpc-overlay-property-card:hover .fpc-overlay-property-card__more {
  display: none;
}

.fpc-overlay-property-card__row {
  display: flex;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fpc-overlay-property-card__name {
  font-weight: 600;
  flex: 0 0 auto;
}

.fpc-overlay-property-card__value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fpc-overlay-property-card__more {
  color: #777777;
  font-style: italic;
}
```

- [ ] **Step 2: Verify build still compiles**

Run: `cd /root/processmap_v1/frontend && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/legacy/legacy_bpmn.css
git commit -m "feat(overlay): add property card styles"
```

---

## Task 3: Render the property card in BpmnStage

**Files:**
- Modify: `frontend/src/components/process/BpmnStage.jsx`

- [ ] **Step 1: Add card factory helper**

Near `fillOverlayTooltip` (top-level helpers), add:

```js
const CARD_GAP = 8;
const MAX_VISIBLE_CARD_PROPS = 5;

function createPropertyCard(ovl, realProps, elementWidth) {
  const card = document.createElement("div");
  card.className = "fpc-overlay-property-card";
  card.style.width = `${Math.max(20, Number(elementWidth || 0))}px`;

  const titleText = String(ovl.text || ovl.meta?.title || "").trim();
  if (titleText) {
    const titleEl = document.createElement("div");
    titleEl.className = "fpc-overlay-property-card__title";
    titleEl.textContent = titleText;
    card.appendChild(titleEl);
  }

  function makeRow(prop) {
    const name = String(prop.name ?? "").trim();
    let value = String(prop.value ?? "");
    if (value.length > 80) value = `${value.slice(0, 80)}...`;
    const colorModel = overlayPropertyColorByKey(name || "property");

    const rowEl = document.createElement("li");
    rowEl.className = "fpc-overlay-property-card__row";

    const nameEl = document.createElement("span");
    nameEl.className = "fpc-overlay-property-card__name";
    nameEl.style.color = colorModel.accent;
    nameEl.textContent = `${name}:`;

    const valueEl = document.createElement("span");
    valueEl.className = "fpc-overlay-property-card__value";
    valueEl.textContent = value;

    rowEl.appendChild(nameEl);
    rowEl.appendChild(valueEl);
    return rowEl;
  }

  const visibleProps = realProps.slice(0, MAX_VISIBLE_CARD_PROPS);
  const hiddenProps = realProps.slice(MAX_VISIBLE_CARD_PROPS);

  const listEl = document.createElement("ul");
  listEl.className = "fpc-overlay-property-card__list";
  visibleProps.forEach((prop) => listEl.appendChild(makeRow(prop)));
  card.appendChild(listEl);

  if (hiddenProps.length > 0) {
    const moreEl = document.createElement("div");
    moreEl.className = "fpc-overlay-property-card__more";
    moreEl.textContent = `+${hiddenProps.length} more`;
    card.appendChild(moreEl);

    const extraEl = document.createElement("ul");
    extraEl.className = "fpc-overlay-property-card__extra";
    hiddenProps.forEach((prop) => extraEl.appendChild(makeRow(prop)));
    card.appendChild(extraEl);
  }

  return card;
}
```

- [ ] **Step 2: Mount the card when `showProperties` is true**

Inside `mountLightweightOverlays`, after the badge overlay is mounted and before `overlaysAdded += 1`, add:

```js
          if (ovl.showProperties && elWidth >= 60 && elHeight >= 30) {
            const card = createPropertyCard(ovl, realProps, elWidth);
            const cardOid = overlays.add(el.id, {
              position: { top: -(card.offsetHeight + CARD_GAP), left: 0 },
              html: card,
            });
            lightweightOverlayStateRef.current[kind].push(cardOid);
          }
```

Because `card.offsetHeight` is 0 until the element is in the DOM, compute the height explicitly instead. Replace the position block with:

```js
          if (ovl.showProperties && elWidth >= 60 && elHeight >= 30) {
            const card = createPropertyCard(ovl, realProps, elWidth);
            // Append to a hidden measuring container so offsetHeight is available.
            const measurer = document.createElement("div");
            measurer.style.position = "absolute";
            measurer.style.visibility = "hidden";
            measurer.style.pointerEvents = "none";
            document.body.appendChild(measurer);
            measurer.appendChild(card);
            const cardHeight = card.offsetHeight || 30;
            document.body.removeChild(measurer);

            const cardOid = overlays.add(el.id, {
              position: { top: -(cardHeight + CARD_GAP), left: 0 },
              html: card,
            });
            lightweightOverlayStateRef.current[kind].push(cardOid);
          }
```

- [ ] **Step 3: Verify build passes**

Run: `cd /root/processmap_v1/frontend && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/process/BpmnStage.jsx
git commit -m "feat(overlay): render property card above tasks when fpc-show-properties is set"
```

---

## Task 4: Add a UI checkbox in the properties panel

**Files:**
- Modify: `frontend/src/components/sidebar/useElementSettingsController.js`
- Modify: `frontend/src/components/sidebar/ElementSettingsControls.jsx`

- [ ] **Step 1: Add controller helper**

In `useElementSettingsController.js`, add after `deletePropertyRow`:

```js
  const SHOW_PROPERTIES_KEY = "fpc-show-properties";

  function showPropertiesFlag() {
    return properties.some((row) => String(row?.name || "").trim().toLowerCase() === SHOW_PROPERTIES_KEY);
  }

  function setShowPropertiesFlag(enabled) {
    const hasFlag = showPropertiesFlag();
    if (enabled && hasFlag) return;
    if (!enabled && !hasFlag) return;

    if (enabled) {
      replaceExtensionProperties([
        ...properties,
        { id: `prop_draft_${Date.now()}`, name: SHOW_PROPERTIES_KEY, value: "true" },
      ]);
    } else {
      replaceExtensionProperties(
        properties.filter((row) => String(row?.name || "").trim().toLowerCase() !== SHOW_PROPERTIES_KEY)
      );
    }
  }
```

Expose them in the return object:

```js
    showPropertiesFlag,
    setShowPropertiesFlag,
```

- [ ] **Step 2: Destructure helpers in the component**

In `CamundaPropertiesSettings` (line ~1127), add to the destructuring list:

```js
    showPropertiesFlag,
    setShowPropertiesFlag,
```

- [ ] **Step 3: Render the checkbox**

Inside the "Дополнительные BPMN-свойства" section, just before the `{additionalBpmnOpen ? (` block (around line 2026), add:

```jsx
          <label className="inline-flex items-center gap-2 text-[11px] text-muted px-1 py-1.5">
            <input
              type="checkbox"
              checked={showPropertiesFlag()}
              onChange={(event) => setShowPropertiesFlag(!!event.target.checked)}
              disabled={!!disabled || !!extensionStateBusy}
              data-testid="bpmn-show-properties-checkbox"
            />
            Показывать свойства над задачей
          </label>
```

- [ ] **Step 4: Verify build passes**

Run: `cd /root/processmap_v1/frontend && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/sidebar/useElementSettingsController.js frontend/src/components/sidebar/ElementSettingsControls.jsx
git commit -m "feat(overlay): add UI checkbox to toggle fpc-show-properties"
```

---

## Task 5: End-to-end verification

**Files:**
- None (verification only)

- [ ] **Step 1: Rebuild gateway Docker image**

```bash
cd /root/processmap_v1
docker compose up -d --build gateway
```

- [ ] **Step 2: Run parser unit test**

```bash
node /mnt/agents/output/overlay_parser_test.mjs
```
Expected: PASS.

- [ ] **Step 3: Run E2E check**

Use `/mnt/agents/output/e2e_overlay_badge_check.mjs` as the base. Manually or via a one-off Playwright script, add `fpc-show-properties=true` to one element in the test session and verify:

- Badge remains visible.
- A card appears above the element.
- Card width does not exceed element width.
- Up to 5 properties visible; `+N more` shown when applicable.
- Hover expands to all properties.

- [ ] **Step 4: Commit any test/E2E updates**

```bash
git add /mnt/agents/output/e2e_overlay_badge_check.mjs  # if changed
git commit -m "test(overlay): verify checkbox property card E2E"
```

---

## Self-review

- **Spec coverage:**
  - BPMN property checkbox → Task 1 + Task 4.
  - Card above task → Task 3.
  - Up to 5 rows, colored keys, hover expand, gap → Task 2 + Task 3.
  - Badge stays → unchanged badge code in Task 3.
- **Placeholder scan:** All steps include exact file paths, code, and commands. No TBDs.
- **Type consistency:** `showProperties` boolean is set by parser and read by renderer. UI helper names match between controller and component.
