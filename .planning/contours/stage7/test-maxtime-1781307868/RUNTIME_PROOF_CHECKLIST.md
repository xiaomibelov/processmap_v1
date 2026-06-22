# Runtime Proof Checklist: stage7/test-maxtime-1781307868

## Required Evidence

- [ ] `node --check tools/agent-ui/lib/checkTotalTime.js` passes.
- [ ] `node --check tools/agent-ui/lib/checkTotalTime.test.js` passes.
- [ ] `node --check tools/agent-ui/server.js` passes.
- [ ] `node --test tools/agent-ui/lib/checkTotalTime.test.js` passes with all assertions.
- [ ] `.agents/tests/test_stage7_max_total_time.sh` exits 0 and prints `PASS`.

## Optional Evidence

- [ ] `node -e "require('./tools/agent-ui/server.js')"` confirms the server module loads without syntax errors.

## Not Applicable

- Browser screenshots, session URLs, Playwright traces, API health checks, and frontend runtime checks are not applicable for this server-side unit-test contour.
