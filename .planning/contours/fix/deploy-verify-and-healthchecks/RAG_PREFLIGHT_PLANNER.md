# RAG Preflight — fix/deploy-verify-and-healthchecks

**Role:** Planner  
**Contour:** fix/deploy-verify-and-healthchecks  
**Area:** deploy/verify/healthcheck/agent  
**Query:** `verify-deploy.sh SHA normalization compose project name celery-worker healthcheck JSONDecodeError agent service version endpoint BRPOP timeout`

## Result

Local BM25 index (`rag-index/RAG_SEARCH_INDEX.json`) returned **no supporting documents** for this deploy/healthcheck/agent runtime topic. Prior RAG context is limited to ProcessMap product code and agent tooling infrastructure.

## Fallback sources used

1. Server-side inspection via SSH (`deploy@45.87.104.69`):
   - `/opt/processmap/app/verify-deploy.sh`
   - `/opt/processmap/app/docker-compose*.yml`
   - container labels and health states
   - `/home/deploy/app` vs `/opt/processmap/app` drift evidence
2. Codebase inspection in worktree `fix/deploy-verify-and-healthchecks`:
   - `backend/services/agent/routers/health.py`
   - `backend/services/agent/memory/schema_memory.py`
   - `backend/app/routers/version.py`
   - `docker-compose.yml`
3. Obsidian notes:
   - `project-atlas/ProcessMap/Fixes/stage-deploy-pipeline/DEPLOY_SCRIPT.md`
   - `project-atlas/ProcessMap/AgentReports/fix/agent-local-env-canonical/INVENTORY.md`
   - `project-atlas/ProcessMap/Audits/stage-server/DOCKER_RUNTIME.md`

## Implication

No institutional patterns exist for verify-deploy/healthcheck fixes. The plan is built from direct code/runtime inspection and standard Docker/Celery/Redis practices.
