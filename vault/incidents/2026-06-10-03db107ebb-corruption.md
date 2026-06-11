# INCIDENT: Production session data corruption

## ID
INC-20260610-001

## Time
2026-06-10 (during development, before final deployment)

## Affected Resource
Session `03db107ebb` in production Postgres
Versions 29+ in `bpmn_versions` table corrupted with empty XML

## Severity
HIGH (Sev-1 if paying customers affected)

## Description
During testing of `render_svg` and `_overlay_interview_annotations_on_bpmn_xml`, agent called `_legacy_save_session_scoped` which persisted empty/corrupted XML back to the production database. User observed "Нет диаграммы для отображения" on page load.

## Root Cause
1. Agent tested rendering logic directly on production session data (VIOLATION of RULE 2: NO PRODUCTION DATA FOR TESTING)
2. No sandbox session was created for testing
3. No backup was taken before DB mutation

## Recovery
Manual rollback to `bpmn_versions` version 28 (original 208 KB XML). Session restored to working state.

## Prevention
- NEVER test on production sessions
- ALWAYS create sandbox session before any render testing
- ALWAYS backup before DB mutation: `SELECT * INTO backup_table`

## Action Items
- [ ] Create sandbox session endpoint or fixture
- [ ] Add guard in `_legacy_save_session_scoped` to reject empty XML writes
- [ ] Document incident in vault (THIS DOC)
