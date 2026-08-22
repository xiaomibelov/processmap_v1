# Contour: stage1/test-paths-mcpfix2-20260612T212347Z

## 1. Objective
Validate that the MCP-aware e2e test paths are stable on the current checkout after the recent MCP-related fix iteration. Run the MCP wiring smoke test and the big-diagram roundtrip/matrix tests in both MCP-on (mock server) and MCP-off (local fallback) configurations, and collect deterministic evidence that fixture sourcing, test execution, and fallbacks behave correctly.

## 2. Bounded Scope
- **In scope:**
  - MCP mock server startup (`frontend/e2e/helpers/mcpMockServer.mjs`)
  - MCP wiring smoke test (`frontend/e2e/mcp-wiring-smoke.spec.mjs`)
  - Big BPMN roundtrip test (`frontend/e2e/bpmn-roundtrip-big.spec.mjs`)
  - Big tab-transition matrix test (`frontend/e2e/tab-transition-matrix-big.spec.mjs`)
  - Both fixture modes: MCP-on (`E2E_BPMN_MCP_URL=http://127.0.0.1:65534/mcp`) and MCP-off (no URL, local fallback)
  - Source/runtime truth capture
  - Runtime availability checks for backend (`:8011`) and frontend (`:5177`)
- **Out of scope:**
  - Product code changes
  - Merge / deploy / PR
  - Non-MCP e2e specs
  - Backend API functional changes outside the test-fixture path

## 3. UI/UX Guidelines Applied
- This is a test/validation contour; no UI changes are made.
- Tests must pass without console-critical errors or unhandled rejections.
- Performance baseline: big-diagram specs should complete without Playwright timeout (default 30 s per expectation is acceptable).

## 4. Acceptance Criteria
| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Source/runtime truth captured | `git branch`, `HEAD`, `git status -sb`, runtime URLs recorded in `RUNTIME_PROOF_CHECKLIST.md` |
| 2 | Backend is reachable | `curl -I ${E2E_API_BASE_URL}/api/health` or equivalent returns HTTP 200 |
| 3 | Frontend is reachable | `curl -I ${E2E_APP_BASE_URL}` returns HTTP 200 |
| 4 | MCP mock server starts and responds | `curl -X POST ${E2E_BPMN_MCP_URL} -d '{"kind":"big_bpmn_fixture","options":{"seed":20260221,"pools":1,"lanes":1,"tasks":1,"edges":1,"annotations":0}}'` returns HTTP 200 with valid XML |
| 5 | MCP wiring smoke passes | `npx playwright test frontend/e2e/mcp-wiring-smoke.spec.mjs` passes with `source=mcp` |
| 6 | Big roundtrip passes MCP-on | `bpmn-roundtrip-big.spec.mjs` passes with `E2E_BPMN_MCP_URL` set |
| 7 | Big matrix passes MCP-on | `tab-transition-matrix-big.spec.mjs` passes with `E2E_BPMN_MCP_URL` set |
| 8 | Big roundtrip passes MCP-off / local fallback | Same spec passes without `E2E_BPMN_MCP_URL` (source=`local` or `local_fallback`) |
| 9 | Big matrix passes MCP-off / local fallback | Same spec passes without `E2E_BPMN_MCP_URL` |
| 10 | No critical console errors | `error`/`warning` levels collected; no unhandled `TypeError`/`ReferenceError` |

## 5. Execution Steps
1. Capture source truth (`git branch --show-current`, `git rev-parse HEAD`, `git status -sb`).
2. Verify runtime endpoints (`curl -I`) for backend and frontend; report BLOCKED if missing.
3. Run MCP wiring smoke **MCP-off** first:
   - `cd frontend && E2E_BROWSER=webkit npx playwright test e2e/mcp-wiring-smoke.spec.mjs --workers=1 --reporter=list`
   - Expect spec to be skipped because `E2E_BPMN_MCP_URL` is unset; this is acceptable and proves graceful skip.
4. Start the MCP mock server in a background process:
   - `node frontend/e2e/helpers/mcpMockServer.mjs`
   - Probe it with a curl POST and record response hash/length.
5. Run MCP wiring smoke **MCP-on**:
   - `cd frontend && E2E_BROWSER=webkit E2E_BPMN_MCP_URL=http://127.0.0.1:65534/mcp npx playwright test e2e/mcp-wiring-smoke.spec.mjs --workers=1 --reporter=list`
6. Run big roundtrip **MCP-on**:
   - `E2E_BROWSER=webkit E2E_BPMN_MCP_URL=http://127.0.0.1:65534/mcp npx playwright test e2e/bpmn-roundtrip-big.spec.mjs --workers=1 --reporter=list`
7. Run big matrix **MCP-on**:
   - `E2E_BROWSER=webkit E2E_BPMN_MCP_URL=http://127.0.0.1:65534/mcp npx playwright test e2e/tab-transition-matrix-big.spec.mjs --workers=1 --reporter=list`
8. Stop the mock server, then run big roundtrip and big matrix **MCP-off** (local fallback):
   - `E2E_BROWSER=webkit npx playwright test e2e/bpmn-roundtrip-big.spec.mjs --workers=1 --reporter=list`
   - `E2E_BROWSER=webkit npx playwright test e2e/tab-transition-matrix-big.spec.mjs --workers=1 --reporter=list`
9. Collect console logs / test report artifacts and update `RUNTIME_PROOF_CHECKLIST.md`.
10. Update `STATE.json` with `worker_status`.

## 6. Context Sources
- RAG preflight: unavailable (`invalid_user` from local RAG endpoint)
- Existing institutional prompts: `stage1__test-paths-mcpfix-20260612T212306Z-planner-start.md`, `test-from-n8n-planner-start.md`
- Project e2e README: `frontend/e2e/README.md`
- MCP mock server: `frontend/e2e/helpers/mcpMockServer.mjs`
- Fixture helper: `frontend/e2e/helpers/bpmnFixtures.mjs`
- Target specs: `frontend/e2e/mcp-wiring-smoke.spec.mjs`, `frontend/e2e/bpmn-roundtrip-big.spec.mjs`, `frontend/e2e/tab-transition-matrix-big.spec.mjs`

## 7. Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| Backend/frontend not running | Worker must start services per `frontend/e2e/README.md` or mark BLOCKED |
| Mock MCP port 65534 already in use | Kill stale process or override `E2E_MCP_MOCK_PORT` |
| Playwright browser not installed | Run `npx playwright install chromium webkit` before tests |
| Big specs timeout on slow runner | Use `--workers=1` and document timing; do NOT modify product code |
| UI-UX skill unavailable | Not needed; this is a test contour |

## 8. Handoff Marker
Agent 2 waits for: `READY_FOR_EXECUTION` file present in `.planning/contours/stage1/test-paths-mcpfix2-20260612T212347Z/`
