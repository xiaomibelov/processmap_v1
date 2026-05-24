# PLAN.md — tooling/processmap-agent3-ui-review-skill-binding-v1

## Goal
Create a reviewer-owned UI review skill and Playwright binding for Agent 3 (Reviewer) in the ProcessMap project.

## Scope
- Pure tooling / process documentation.
- No product code changes.
- No frontend/backend application file changes.
- No commit, push, PR, or deploy.

## Deliverables

### Project Atlas (Obsidian vault)
1. `/srv/obsidian/project-atlas/ProcessMap/Prompts/PROCESSMAP_AGENT3_UI_REVIEW_SKILL.md`
   - Reviewer rubric for ProcessMap UI/runtime review.
2. `/srv/obsidian/project-atlas/ProcessMap/Prompts/PROCESSMAP_AGENT3_PLAYWRIGHT_REVIEW_BINDING.md`
   - Binding between Agent 3 and Playwright MCP.

### Repo planning templates
3. `/opt/processmap-test/.planning/templates/agent3-ui-runtime-review-template.md`
   - Reusable template for future Agent 3 reviews.
4. `/opt/processmap-test/.planning/templates/agent3-ui-runtime-proof-checklist.md`
   - Checklist for Agent 3 runtime proof steps.

### Contour folder
5. `PLAN.md` (this file)
6. `REVIEWER_PROMPT.md` — summary prompt for Agent 3 invocation
7. `EXEC_REPORT.md` — execution report
8. `REVIEW_PASS` — final marker

## Acceptance criteria
- All 8 files exist and contain the required content.
- No product code modified.
- No secrets touched.
- No CI/CD triggered.

## Safety checks
- [ ] Product code unchanged
- [ ] No secrets touched
- [ ] No commit/push/PR
- [ ] No deploy
- [ ] No MCP repair
- [ ] No RAG bootstrap
