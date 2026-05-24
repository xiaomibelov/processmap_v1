# REWORK_REQUEST — research/product-actions-ai-ag-ui-protocol-fit-v1

## For Agent 2 / Executor

Please address the following items from REVIEW_REPORT.md before recreating READY_FOR_REVIEW.

### Item 1: Add Consolidated Risk Matrix
Location: `/srv/obsidian/project-atlas/ProcessMap/Architecture/AG-UI Protocol Fit for ProcessMap.md`
Action: Add a consolidated risk matrix table with columns: Risk, Likelihood, Impact, Mitigation.
Minimum rows to include:
- Dependency risk (native integration)
- Breaking change risk (pre-1.0 spec)
- Vendor lock-in risk (CopilotKit ecosystem)
- Security leak via event stream
- Parallel audit/logging layer creation
- AG-UI spec drift before 1.0
- Over-engineering for current synchronous batch

### Item 2: Qualify Release Cadence Claim
Location: `/srv/obsidian/project-atlas/ProcessMap/Architecture/AG-UI Protocol Fit for ProcessMap.md` Section 1.5
Action: Change "Daily (release/YYYY-MM-DD)" to an accurate description. Verified data shows a 3-week gap between 2026-04-21 and 2026-05-13 releases. Suggested phrasing: "Frequent (release/YYYY-MM-DD naming; near-daily during active cycles, with occasional gaps)."

### Item 3: Update RUNTIME_PROOF_CHECKLIST
Location: `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/RUNTIME_PROOF_CHECKLIST.md`
Action: Mark all completed Agent 2 checklist items as `[x]`. Items that were not applicable or not completed should remain `[ ]` with a brief note.

## Rework Loop Rules
- Do NOT silently fix issues; document changes in EXEC_REPORT.md under "Rework Round 1"
- Recreate READY_FOR_REVIEW only when all 3 items are addressed
- Do NOT modify product code
- Do NOT commit/push/PR/deploy
