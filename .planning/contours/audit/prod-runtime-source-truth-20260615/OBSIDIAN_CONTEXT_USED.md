# Obsidian Context Used — audit/prod-runtime-source-truth-20260615

**Vault:** `/srv/obsidian/project-atlas/ProcessMap`
**RAG manifest:** `/opt/processmap-test/.agents/rag-index/work-20260615T162609Z/RAG_MANIFEST_BALANCED.json`
**Index:** `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_SEARCH_INDEX_BALANCED.json`

**Command used:**
```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour audit/prod-runtime-source-truth-20260615 \
  --area "ProcessMap runtime source truth deploy" \
  --query "prod server error git truth deploy" \
  --top-k 5 \
  --format md \
  --out /tmp/rag-preflight.md
```

**RAG size:**
- `total_files`: 2897
- `limit`: 2855
- `RAG_SEARCH_INDEX_BALANCED.json`: ~242 MB

**Top relevant sources found:**
1. `/opt/processmap-test/.planning/contours/premium-urgent-task-analytics-ui-ux-addi-mqdketwb/PLAN.md` — source/runtime truth section (score 37.008).
2. `/srv/obsidian/project-atlas/ProcessMap/AgentReports/premium-urgent-task-analytics-ui-ux-addi-mqdketwb/PLAN.md` — mirrored source/runtime truth.
3. `/srv/obsidian/project-atlas/ProcessMap/AgentReports/workflow/pr-stage-manual-merge-only-v1/PLAN.md` — source truth and release flow policy.
4. `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/analytics-and-diagram-overlays-server-side-view-model-v1/REVIEW_REPORT.md` — source/runtime truth proof.
5. `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-source-registry-and-index-policy-v1/PLAN.md` — non-goals and RAG scope boundaries.

**Key facts applied:**
- Working directory for server work: `/opt/processmap-test`.
- Gateway build source: `/root/processmap_v1` (must receive synced frontend changes before deploy).
- AGENTS.md release flow: branch → push → PR → user approval → merge → auto deploy to stage → verify → manual prod deploy.
- RAG is read-only suggestion layer; no auto-mutation.

**Files read directly:**
- `/opt/processmap-test/AGENTS.md`
- `/root/.kimi/skills/processmap-agent/SKILL.md`

**Decisions changed by context:**
- Recognized that `/root/processmap_v1` is the actual gateway build source, not `/opt/processmap-test`.
- Confirmed that deploy without PR/approval violates AGENTS.md §7.
