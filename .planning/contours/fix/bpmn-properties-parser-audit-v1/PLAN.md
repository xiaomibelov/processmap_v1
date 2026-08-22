# PLAN — fix/bpmn-properties-parser-audit-v1

**run_id:** `20260527T194532Z-14649`
**contour:** `fix/bpmn-properties-parser-audit-v1`
**agents:** 3-agent (Planner → Worker → Reviewer)
**language:** prompts in English, reports/docs in Russian

---

## 1. Problem Statement

- **Registry shows:** "Свойства не найдены. BPMN-диаграммы сохранены, но расширения Camunda и пользовательские свойства не обнаружены."
- **User confirms:** properties exist in actual BPMN XML.
- **Suspected cause:** parser is Camunda-only and misses other property types (`bpmn2:property`, custom attributes, `extensionElements`, documentation, dataObjects, lane attributes).
- **Misleading message:** backend says "Диаграммы найдены, но в них отсутствуют Camunda extensions и custom properties" even when properties exist in non-Camunda formats.

---

## 2. Audit Strategy (Agent 2 / Worker)

### 2.1 Find parser code
- Search backend Python files for BPMN property extraction.
- Target areas: `backend/app/services/bpmn_*.py`, `backend/app/utils/bpmn_*.py`, `backend/app/analysis/process_properties/*.py`, `backend/app/importers/*.py`, `backend/app/rag/*.py`.

### 2.2 Inspect real BPMN XML
- Find actual BPMN files in `workspace/` and `backend/`.
- Inspect 2–3 real files for property patterns: `property`, `camunda:`, `extensionElements`, `documentation`, custom attributes, dataObjects, lanes.
- Document exact XML snippets found.

### 2.3 Compare & identify gap
- Create gap analysis table: property type vs parser support vs actual existence in BPMN files.
- Determine which types are missing from parser logic.

---

## 3. Fix Strategy (Agent 2 / Worker)

### 3.1 Expand parser logic
- Add extraction for ALL property types found in real BPMN files.
- Support at minimum:
  - `camunda:property` (name/value)
  - `bpmn2:property` or `<property>` (name/value)
  - custom attributes on flow elements (tasks, events, gateways)
  - `documentation` fields with structured data
  - `extensionElements` containing properties
  - `dataObject` properties
  - lane/set attributes

### 3.2 Update property classification & provenance
- "Подтверждено" = extracted automatically from BPMN XML.
- "Предположение" = inferred or partial extraction.
- Store extraction method: provenance field = `"автоматически из BPMN"`, `"из Camunda extension"`, `"из custom attribute"`, etc.

### 3.3 Re-scan existing diagrams
- After parser fix, trigger re-scan of all existing BPMN files in workspace.
- Log: files scanned, property types checked, total properties found.

### 3.4 Update backend messages
- Remove Camunda-only wording.
- New honest empty state: "В просканированных диаграммах не обнаружены свойства. Поддерживаемые форматы: Camunda properties, BPMN2 properties, custom attributes. Проверьте XML-структуру диаграмм."
- Add diagnostic field `scan_info` to API response: `{ bpmn_files_scanned, property_types_checked, total_properties_found }`.

### 3.5 Update frontend empty state
- If properties found → render table with type pills and expandable rows.
- If none found → show detailed scan info instead of generic "not found".

---

## 4. Integration Points

- **Endpoint:** `/api/analysis/process-properties/registry`
  - Must return real properties after fix in `view_model.properties`.
  - Must return honest `empty_state` with `scan_info` if none found.
- **Build/restart:** API may need restart after backend changes.

---

## 5. Runtime Proof

- `:5177` inspected.
- Properties Registry opens.
- If properties exist → table renders with pills and expandable rows.
- If none → empty state shows scan info (`bpmn_files_scanned`, `property_types_checked`, `total_properties_found`).
- No console errors, no 502 errors.

---

## 6. Context Sources

- RAG preflight: `.planning/contours/fix/bpmn-properties-parser-audit-v1/RAG_PREFLIGHT_PLANNER.md`
- Obsidian context: `.planning/contours/fix/bpmn-properties-parser-audit-v1/OBSIDIAN_CONTEXT_USED.md`
- GSD context: `.planning/contours/fix/bpmn-properties-parser-audit-v1/GSD_CONTEXT_USED.md`
- Previous contour handoff: `feature/process-properties-registry-foundation-v1` (executor part 1 + reviewer changes requested) — properties registry UI exists, backend aggregate missing.

---

## 7. Required Gates (before READY_FOR_EXECUTION)

- [x] GSD discipline recorded
- [x] Source/runtime truth captured
- [x] Bounded scope defined in PLAN.md
- [x] Acceptance criteria defined (see AGENT3_ACCEPTANCE_CRITERIA.md)
- [x] Real BPMN inspection requirement included in WORKER_PROMPT.md
- [x] No product code written by Agent 1
- [x] No merge/deploy/PR planned without explicit approval
