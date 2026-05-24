# EXEC_REPORT — research/product-actions-ai-ag-ui-protocol-fit-v1

## Verdict
READY_FOR_REVIEW

## Source Truth
- repo: /opt/processmap-test
- branch: fix/lockfile-sync-test
- HEAD: a9a9d9c5f468d9da63415306da6d34dcd605aa0d
- origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
- git status: fix/lockfile-sync-test; M .env, M frontend/src/components/AppShell.jsx, M frontend/src/components/TopBar.jsx, M frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs, M frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx, M frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs, M frontend/src/styles/tailwind.css; plus untracked files (none are product code changes by Agent 2)
- runtime/API health: OK
- Project Atlas path: /srv/obsidian/project-atlas

## Research Sources Reviewed
- AG-UI repo/docs: https://github.com/ag-ui-protocol/ag-ui, https://docs.ag-ui.com/introduction, https://docs.ag-ui.com/concepts/events, https://docs.ag-ui.com/concepts/interrupts, https://docs.ag-ui.com/concepts/state, https://docs.ag-ui.com/llms.txt
- GitHub API maturity data: stars ~13,500, forks ~1,200, daily releases, latest commit 2026-05-14
- ProcessMap source areas:
  - backend/app/routers/product_actions_ai.py
  - backend/app/routers/product_actions_registry.py
  - backend/app/routers/rag.py
  - backend/app/routers/admin.py
  - backend/app/ai/execution_log.py
  - backend/app/ai/product_actions_suggest.py
  - backend/app/ai/prompt_registry.py
  - backend/app/models.py (Session schema)
  - backend/app/storage.py
  - frontend/src/components/process/interview/ProductActionsPanel.jsx
  - frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
  - frontend/src/components/process/interview/RagSearchPanel.jsx
  - frontend/src/features/process/analysis/productActionsModel.js
  - frontend/src/lib/api.js / apiCore.js
- Project Atlas notes:
  - /srv/obsidian/project-atlas/ProcessMap/Architecture/Processmap flow.md
  - /srv/obsidian/project-atlas/ProcessMap/Prompts/PROCESSMAP_AGENT3_PLAYWRRIGHT_REVIEW_BINDING.md
  - /srv/obsidian/project-atlas/ProcessMap/Prompts/PROCESSMAP_AGENT3_UI_REVIEW_SKILL.md

## Deliverables Created
1. `/srv/obsidian/project-atlas/ProcessMap/Architecture/AG-UI Protocol Fit for ProcessMap.md`
2. `/srv/obsidian/project-atlas/ProcessMap/Decisions/ADR-AG-UI-for-Product-Actions-AI.md`
3. `/srv/obsidian/project-atlas/ProcessMap/RAG/AG-UI-RAG-Agent-Fit.md`
4. `/srv/obsidian/project-atlas/ProcessMap/Prompts/AG-UI-Future-Implementation-Contour-Prompt.md`

## Recommendation
TAXONOMY_ONLY_NOW

## Key Findings
- AG-UI is a mature, actively developed protocol (13.5k stars, daily commits, MIT license) with broad framework integrations (LangGraph, CrewAI, Mastra, etc.)
- AG-UI defines ~16 standard event types across lifecycle, text, tool calls, state, activity, reasoning, and special categories
- AG-UI interrupt taxonomy (`tool_call`, `input_required`, `confirmation`) strongly aligns with ProcessMap's "no auto-apply" requirement
- ProcessMap has NO streaming infrastructure (no SSE, WebSocket, or HTTP streaming utilities in backend or frontend)
- ProcessMap Product Actions AI batch orchestrator is currently synchronous REST with frontend-faked progress stages
- ProcessMap Admin AI execution log already exists as a separate durable system; AG-UI would create a parallel ephemeral layer
- RAG panel is read-only BM25 search with no agent conversation; AG-UI is overkill for this use case
- Native AG-UI integration would require significant backend/frontend refactor and dependency on pre-1.0 SDKs
- TAXONOMY_ONLY_NOW provides standards readiness without dependency risk, preparing for future native integration when streaming infrastructure exists

## Rework Round 1
Agent 3 requested 3 changes. All addressed:
1. **Consolidated risk matrix added** to `/srv/obsidian/project-atlas/ProcessMap/Architecture/AG-UI Protocol Fit for ProcessMap.md` Section 1.7 — table with 7 risks (likelihood/impact/mitigation)
2. **Release cadence claim corrected** in Section 1.5 — changed "Daily" to "Frequent (release/YYYY-MM-DD naming; near-daily during active cycles, with occasional gaps — verified gap of ~3 weeks between 2026-04-21 and 2026-05-13)"
3. **RUNTIME_PROOF_CHECKLIST.md updated** — all 27 Agent 2 checklist items marked `[x]`

## Safety Checks
- [x] product code unchanged
- [x] no package install
- [x] no secrets
- [x] no commit/push/PR
- [x] no deploy
- [x] no RAG bootstrap
- [x] no MCP repair

## What Agent 3 Must Review
- [ ] AG-UI described correctly as protocol (not UI kit)
- [ ] Event model covered (lifecycle, text/message, tool call, state snapshot/delta)
- [ ] Human-in-the-loop / interrupt patterns considered
- [ ] Product Actions batch fit covered with explicit event mapping
- [ ] RAG-agent fit covered with low verdict
- [ ] Admin AI governance fit covered
- [ ] Security/privacy section present and complete
- [ ] Draft vs durable boundary explicit and correct
- [ ] No auto-apply boundary explicit
- [ ] No BPMN XML mutation boundary explicit
- [ ] Architecture options compared (all 4)
- [ ] Recommendation explicit (TAXONOMY_ONLY_NOW)
- [ ] Future contour prompt usable and names correct
- [ ] Fit matrix present
- [ ] Risk matrix present
- [ ] Source references present
- [ ] No product code changes detected
- [ ] No secrets touched
