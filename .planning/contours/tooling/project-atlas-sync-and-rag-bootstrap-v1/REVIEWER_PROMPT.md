# Reviewer Prompt

## Objective
Verify that the Project Atlas sync and RAG bootstrap plan has been executed correctly and safely.

## Verification Checklist

### 1. Local/Server Sync Verification

- [ ] Syncthing is installed and running on both local Mac and server
- [ ] Devices are paired and connected
- [ ] Folder `/srv/obsidian/project-atlas` is shared with `~/Documents/Obsidian/ProjectAtlas`
- [ ] `.stignore` is active on both sides

### 2. Bidirectional Sync Test

- [ ] **Server writes, local sees**: Create a test note on the server in `_Inbox/test_sync_from_server.md` and verify it appears on the local Mac within 5 minutes
- [ ] **Local writes, server sees**: Create a test note on the local Mac in `_Inbox/test_sync_from_local.md` and verify it appears on the server within 5 minutes
- [ ] **Conflict handling**: Simulate a conflict (edit same file on both sides) and verify resolution is sensible

### 3. Secret Exclusion Verification

- [ ] No `.env` files in the vault on either side
- [ ] No `secrets/` directories in the vault
- [ ] No `*.pem`, `*.key`, `id_rsa`, `id_ed25519` files
- [ ] No `node_modules/`, `.venv/`, `venv/` directories
- [ ] No raw log files >1MB
- [ ] Run a grep scan for common secret patterns and confirm zero matches

```bash
# Server-side secret scan
cd /srv/obsidian/project-atlas
grep -riE '(password|secret|token|api_key|private_key)' --include="*.md" . || echo "No obvious secrets found"
```

### 4. Canonical Structure Verification

- [ ] All canonical directories exist: `ProcessMap/{HANDOFF,Evidence,Decisions,Runtime,Prompts,Contours,Architecture,Audits,Backlog,RAG}`, `_Inbox`, `_Templates`
- [ ] No unexpected files at the vault root (only README, directories, `.stignore`)
- [ ] Naming conventions followed (kebab-case, dated files where applicable)

### 5. RAG Plan Boundedness

- [ ] RAG plan is explicitly read-only
- [ ] RAG plan excludes secrets and sensitive files
- [ ] RAG plan defers implementation to a follow-up contour
- [ ] RAG API is not exposed publicly without auth
- [ ] No auto-mutation capabilities are planned

### 6. Non-Goals Verification

- [ ] MCP repair agent was NOT started
- [ ] No product code changes were made
- [ ] No deployment was performed
- [ ] No merge was performed
- [ ] No files were deleted
- [ ] No secrets were transferred

## Review Output

Produce a `REVIEW_REPORT.md` with:
1. Pass/fail for each checklist item
2. Any issues found and severity (BLOCKER / WARNING / INFO)
3. Recommendations for remediation
4. Overall verdict: `APPROVED` or `NEEDS_FIX`

## Approval Criteria

- All BLOCKER items must pass
- No secrets in the vault
- Sync is functional bidirectionally
- RAG plan is bounded and safe
