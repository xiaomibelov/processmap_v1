# FIX: Session Version Conflict — TESTS

**Contour:** `fix/session-version-conflict-base-hydration-v1`

---

## 1. Unit tests

### 1.1 `createBpmnPersistence.test.mjs`

Run:

```bash
cd /Users/mac/agents_place/kimi_PM/fix-session-version
docker run --rm -v "$PWD:/ws" -w /ws/frontend node:20-alpine \
  node --test src/features/process/bpmn/persistence/createBpmnPersistence.test.mjs
```

Result: **14/14 pass**

```text
# tests 14
# pass 14
# fail 0
```

Key new assertions:
- `saveRaw returns missing_base_version when base diagram state version is not known`
- `tracked diagram state version is scoped by session id`

### 1.2 `useProcessTabs.cas-base-propagation.test.mjs`

Run:

```bash
cd /Users/mac/agents_place/kimi_PM/fix-session-version
docker run --rm -v "$PWD:/ws" -w /ws/frontend node:20-alpine \
  node --test src/features/process/hooks/useProcessTabs.session-entry-tab.test.mjs \
              src/features/process/hooks/useProcessTabs.cas-base-propagation.test.mjs
```

Result: **7/7 pass**

```text
# tests 7
# pass 7
# fail 0
```

New structural test:
- `tab-switch bpmn flush hydrates base diagram state version before remote save`

### 1.3 `persistRetryMachine.test.mjs` (regression)

Run:

```bash
cd /Users/mac/agents_place/kimi_PM/fix-session-version
docker run --rm -v "$PWD:/ws" -w /ws/frontend node:20-alpine \
  node --test src/features/process/hybrid/controllers/persistRetryMachine.test.mjs
```

Result: **3/3 pass**

```text
# tests 3
# pass 3
# fail 0
```

### 1.4 `ProcessStage` version-context tests (regression)

Run:

```bash
cd /Users/mac/agents_place/kimi_PM/fix-session-version
docker run --rm -v "$PWD:/ws" -w /ws/frontend node:20-alpine \
  node --test src/components/ProcessStage.diagram-state-version-context.test.mjs \
              src/components/ProcessStage.cas-base-propagation.test.mjs
```

Result: **6/6 pass**

```text
# tests 6
# pass 6
# fail 0
```

---

## 2. Full suite limitation

Host `node`/`npm` are not installed in this environment. Running the full `npm test` inside Docker fails for tests that import React / `@babel/parser` / `jsdom` because `node_modules` are not present in the container:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'react' imported from ...
```

This is an environment limitation, not a code failure. All targeted tests for the bounded fix pass.

---

## 3. Syntax checks

```bash
docker run --rm -v "$PWD:/ws" -w /ws/frontend node:20-alpine \
  node --check src/features/process/bpmn/persistence/createBpmnPersistence.js
docker run --rm -v "$PWD:/ws" -w /ws/frontend node:20-alpine \
  node --check src/features/process/hooks/useProcessTabs.js
```

Both pass.
