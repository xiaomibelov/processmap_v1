# RE_SCAN_PROTOCOL

**contour:** `fix/bpmn-properties-parser-audit-v1`
**run_id:** `20260527T194532Z-14649`

---

## Re-scan Steps (Agent 2)

1. **Identify all BPMN files**
   ```bash
   find /opt/processmap-test/workspace/ -type f \( -name "*.bpmn" -o -name "*.bpmn2" \) > /tmp/bpmn_files_list.txt
   wc -l /tmp/bpmn_files_list.txt
   ```

2. **Trigger re-scan**
   - Option A: Call existing backend endpoint if one exists for re-scan.
   - Option B: Write and run a Python script that imports the parser module and re-processes all files.
   - Option C: Provide curl/API instructions for the user to trigger re-scan.

3. **Log results**
   For each file scanned, record:
   - file path
   - properties found (by type)
   - errors encountered

4. **Aggregate results**
   - total files scanned
   - total properties found (by type)
   - total new properties vs previously known
   - files with errors

5. **Store in `RE_SCAN_RESULTS.md`**

## Expected Output Format

```markdown
# RE_SCAN_RESULTS

## Summary
- Files scanned: N
- Total properties found: N
- Properties by type:
  - camunda:property: N
  - bpmn2:property: N
  - custom attributes: N
  - documentation: N
  - extensionElements: N
  - dataObject: N
  - lane: N

## Per-file details
| File | Properties Found | Types | Errors |
|------|------------------|-------|--------|
| ...  | ...              | ...   | ...    |

## Database state after re-scan
SELECT COUNT(*), source FROM properties GROUP BY source;
```
