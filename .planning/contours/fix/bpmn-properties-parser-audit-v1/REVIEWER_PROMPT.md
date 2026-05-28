# REVIEWER_PROMPT — Agent 3 / Reviewer

**contour:** `fix/bpmn-properties-parser-audit-v1`
**run_id:** `20260527T194532Z-14649`
**role:** Verification
**reports_language:** Russian

---

## 0. Bootstrap Rules

- Work only in this contour.
- Review independently — do not trust Worker reports without own verification.
- If blocked → write `REVIEW_BLOCKED.md`.
- Do not merge or deploy.
- Create PR to stage if all gates pass, but do NOT merge.

---

## 1. Verification Gates

### A. Parser Audit (PASS required)
1. Parser code identified and documented in `PARSER_AUDIT.md`.
2. Real BPMN files inspected — verify `BPMN_PROPERTY_TYPES_FOUND.md` contains actual XML snippets from at least 2 real files.
3. `GAP_ANALYSIS.md` exists and shows which property types are missing.

### B. Parser Fix (PASS required)
1. Parser expanded to handle all property types found in real BPMN files.
2. Provenance stores extraction method for each property.
3. Backend messages updated — no Camunda-only wording remains.
4. `scan_info` present in API response with `bpmn_files_scanned`, `property_types_checked`, `total_properties_found`.

### C. Re-scan Results (PASS required)
1. Existing BPMN files re-scanned (verify in `RE_SCAN_RESULTS.md`).
2. Results logged: files scanned, properties found by type.

### D. Registry Rendering (PASS required)
1. If properties found → table renders with pills and expandable rows.
2. If none found → empty state shows detailed scan info (not generic "not found").
3. No fake data injected.

### E. Runtime (PASS required)
1. `:5177` serves current build.
2. No console errors.
3. No 502 errors.

---

## 2. Independent Verification Commands

Run these yourself — do not rely on Worker output alone:

```bash
cd /opt/processmap-test

# Verify parser files changed
git diff --name-only HEAD~1 | grep -E "backend/app/.*\.py" || git diff --name-only | grep -E "backend/app/.*\.py"

# Verify real BPMN files exist and contain properties
find workspace/ backend/ -name "*.bpmn" | head -n 5
for f in $(find workspace/ -name "*.bpmn" | head -n 2); do
  echo "=== $f ==="
  grep -c "property\|camunda\|extensionElements\|documentation" "$f" || true
done

# Verify API returns scan_info
curl -s http://localhost:8000/api/analysis/process-properties/registry 2>/dev/null | python3 -m json.tool | grep -A5 "scan_info" || echo "API check needed"

# Verify no misleading messages remain
grep -r "отсутствуют Camunda extensions" backend/app/ --include="*.py" && echo "FAIL: old message remains" || echo "PASS: old message removed"
```

---

## 3. Final Verdict

- **REVIEW_PASS** only if A+B+C+D+E all pass.
- **CHANGES_REQUESTED** if parser still misses property types found in real BPMN, or if misleading messages remain, or if runtime proof is insufficient.

Write `REVIEW_REPORT.md` with:
- Verdict (REVIEW_PASS or CHANGES_REQUESTED)
- Gate-by-gate results
- Independent verification evidence
- PR link (if created)
- Risks / remaining work

---

## 4. Reports Checklist

- [ ] `REVIEW_REPORT.md`
- [ ] `REVIEW_PASS` or `CHANGES_REQUESTED` marker
- [ ] If CHANGES_REQUESTED → `REWORK_REQUEST.md` with specific fixes needed
