# WORKER_PROMPT — Agent 2 / Worker

**contour:** `fix/bpmn-properties-parser-audit-v1`
**run_id:** `20260527T194532Z-14649`
**role:** Audit + Fix + Re-scan
**reports_language:** Russian

---

## 0. Bootstrap Rules

- Work only in this contour.
- If blocked → write `EXEC_BLOCKED.md` and stop.
- Do not merge, deploy, or open a PR.
- Write all reports in Russian.
- After completion → write `WORKER_DONE`.

---

## 1. Audit Phase — Find Parser & Real BPMN

### 1.1 Find parser code
Run these exact commands and record output:

```bash
cd /opt/processmap-test
find backend/app -type f -name "*.py" | xargs grep -l -i "property\|camunda\|bpmn" | sort
```

Then inspect each matching file for property extraction logic:
```bash
grep -r -n -i "extract.*property\|parse.*property\|camunda.*property\|extension.*property\|property.*extract\|property.*parse" backend/app/ --include="*.py"
```

Document in `PARSER_AUDIT.md`:
- File paths of parser code.
- Functions/classes responsible for property extraction.
- What XML tags/attributes each function looks for.
- Whether it uses regex, XML parser (ElementTree/lxml), or string search.

### 1.2 Find actual BPMN files
```bash
find /opt/processmap-test/workspace/ /opt/processmap-test/backend/ -type f \( -name "*.bpmn" -o -name "*.bpmn2" \) 2>/dev/null | head -n 20
```

### 1.3 Inspect property patterns in real BPMN
For each of the first 3 BPMN files found, run:

```bash
for f in $(find /opt/processmap-test/workspace/ -name "*.bpmn" | head -n 3); do
  echo "=== $f ==="
  grep -o "<[^>]*property[^>]*>" "$f" | head -n 10
  grep -o "camunda:[a-zA-Z]*" "$f" | sort | uniq | head -n 10
  grep -o "name=\"[^\"]*\"" "$f" | head -n 10
  grep -o "<documentation[^>]*>.*</documentation>" "$f" | head -n 5
  grep -o "<extensionElements[^>]*>.*</extensionElements>" "$f" | head -n 5
  grep -o "<dataObject[^>]*>" "$f" | head -n 5
  grep -o "<lane[^>]*>" "$f" | head -n 5
done
```

Document exact XML snippets in `BPMN_PROPERTY_TYPES_FOUND.md`.

---

## 2. Gap Analysis Phase

Create `GAP_ANALYSIS.md` with this table:

| Property Type | Exists in BPMN? | Parser Handles? | Gap |
|---------------|-----------------|-----------------|-----|
| camunda:property | Yes/No | Yes/No | ... |
| bpmn2:property / <property> | Yes/No | Yes/No | ... |
| custom attributes on flow elements | Yes/No | Yes/No | ... |
| documentation fields | Yes/No | Yes/No | ... |
| extensionElements | Yes/No | Yes/No | ... |
| dataObject properties | Yes/No | Yes/No | ... |
| lane/set attributes | Yes/No | Yes/No | ... |

Also check database:
```bash
docker exec processmap_test-postgres-1 psql -U postgres -d processmap -c "SELECT COUNT(*), source FROM properties GROUP BY source;" 2>/dev/null || echo "DB check failed"
```

Check backend logs for parser errors:
```bash
docker logs --tail 100 processmap_test-api-1 2>/dev/null | grep -i "property\|bpmn\|parse\|extract" | tail -n 20
```

---

## 3. Fix Phase

### 3.1 Expand parser logic
Modify the identified parser code to capture ALL property types found in real BPMN files:
- If `camunda:property` exists → extract `name`/`value`.
- If `bpmn2:property` or `<property>` exists → extract `name`/`value`.
- If custom attributes on tasks/events/gateways → extract as properties.
- If `documentation` fields contain structured data → extract.
- If `extensionElements` contain properties → extract.
- If `dataObject` elements have properties → extract.
- If `lane` elements have attributes → extract.

### 3.2 Update property classification
Add provenance field to extracted properties:
- `"автоматически из BPMN"`
- `"из Camunda extension"`
- `"из custom attribute"`
- `"из documentation"`
- `"из extensionElements"`

### 3.3 Update backend messages
Find and replace misleading message:
- Old: `"Диаграммы найдены, но в них отсутствуют Camunda extensions и custom properties."`
- New: `"Свойства не найдены в BPMN-диаграммах. Убедитесь, что диаграммы содержат свойства элементов (property, extensionElements, custom attributes)."`

### 3.4 Add scan_info to API response
`view_model.scan_info` must contain:
```json
{
  "bpmn_files_scanned": N,
  "property_types_checked": ["camunda:property", "bpmn2:property", "custom_attributes", "documentation", "extensionElements", "dataObject", "lane"],
  "total_properties_found": N
}
```

---

## 4. Re-scan Phase

After parser fix:
1. Trigger re-scan of all existing BPMN files in workspace.
2. Or provide script/API endpoint to re-scan.
3. Log results in `RE_SCAN_RESULTS.md`:
   - Files scanned
   - Property types checked
   - Total properties found (by type)
   - New properties vs previously known

---

## 5. Build & Runtime Proof

1. Build/restart API if backend changed:
   ```bash
   cd /opt/processmap-test/backend && docker compose restart api 2>/dev/null || echo "manual restart needed"
   ```
2. Verify `:5177` serves current build.
3. Open Properties Registry.
4. If properties found → table renders with type pills and expandable rows.
5. If none found → empty state shows detailed scan info.
6. Document in `RUNTIME_PROOF_5177.md`.
7. Run tests and document in `TEST_RESULTS.md`.

---

## 6. Reports Checklist

- [ ] `WORKER_REPORT.md` — summary of all work done
- [ ] `PARSER_AUDIT.md` — what parser currently does
- [ ] `BPMN_PROPERTY_TYPES_FOUND.md` — what exists in real XML
- [ ] `GAP_ANALYSIS.md` — what's missing
- [ ] `PARSER_FIX.md` — what was changed
- [ ] `RE_SCAN_RESULTS.md` — re-scan results
- [ ] `RUNTIME_PROOF_5177.md` — runtime proof
- [ ] `TEST_RESULTS.md` — test results
- [ ] `WORKER_DONE` — completion marker

If blocked at any step → write `EXEC_BLOCKED.md` and stop.
