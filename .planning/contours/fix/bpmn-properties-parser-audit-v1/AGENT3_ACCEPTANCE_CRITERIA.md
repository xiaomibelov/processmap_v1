# AGENT3_ACCEPTANCE_CRITERIA

**contour:** `fix/bpmn-properties-parser-audit-v1`
**run_id:** `20260527T194532Z-14649`

---

## A. Parser Audit (PASS required)

- [ ] `PARSER_AUDIT.md` exists and identifies parser code files with line numbers.
- [ ] `BPMN_PROPERTY_TYPES_FOUND.md` contains actual XML snippets from ≥2 real BPMN files.
- [ ] `GAP_ANALYSIS.md` shows which property types are missing from parser.

## B. Parser Fix (PASS required)

- [ ] Parser expanded to handle all property types found in real BPMN files.
- [ ] Provenance stores extraction method for each property.
- [ ] No misleading "Camunda only" messages remain in backend.
- [ ] API response includes `scan_info` with:
  - `bpmn_files_scanned` (integer)
  - `property_types_checked` (array of strings)
  - `total_properties_found` (integer)

## C. Re-scan Results (PASS required)

- [ ] `RE_SCAN_RESULTS.md` exists.
- [ ] Existing BPMN files re-scanned.
- [ ] Results logged: files scanned, properties found by type.

## D. Registry Rendering (PASS required)

- [ ] If properties found → Properties Registry table renders with type pills and expandable rows.
- [ ] If none found → empty state shows detailed scan info (files scanned, types checked).
- [ ] No fake data injected.

## E. Runtime (PASS required)

- [ ] `:5177` serves current build.
- [ ] No console errors on Properties Registry page.
- [ ] No 502 errors from backend.

## Final Verdict Rules

- **REVIEW_PASS** — only if A+B+C+D+E all pass.
- **CHANGES_REQUESTED** — if any gate fails, with specific rework items in `REWORK_REQUEST.md`.
