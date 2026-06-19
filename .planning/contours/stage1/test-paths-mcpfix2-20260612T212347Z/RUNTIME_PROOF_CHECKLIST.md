# RUNTIME_PROOF_CHECKLIST — stage1/test-paths-mcpfix2-20260612T212347Z

> To be filled by Agent 2 (Worker) and validated by Agent 3 (Reviewer).

## Source Truth
- [ ] Git branch: `___________________________`
- [ ] Git HEAD: `_____________________________`
- [ ] Git status: clean / dirty (circle one)

## Runtime Truth
- [ ] Backend reachable: `curl -I http://127.0.0.1:8011/api/health` returned HTTP 200
- [ ] Frontend reachable: `curl -I http://127.0.0.1:5177` returned HTTP 200

## MCP Mock Server Truth
- [ ] Mock server started on `http://127.0.0.1:65534/mcp`
- [ ] Probe returned HTTP 200
- [ ] Probe XML length: `___________`
- [ ] Probe XML hash (`fnv1aHex`): `________________`
- [ ] Probe has DI markers: yes / no

## MCP-On Test Results
- [ ] `mcp-wiring-smoke.spec.mjs` passed
- [ ] `mcp-wiring-smoke` source reported as `mcp`
- [ ] `bpmn-roundtrip-big.spec.mjs` passed
- [ ] `tab-transition-matrix-big.spec.mjs` passed

## MCP-Off / Local Fallback Test Results
- [ ] `mcp-wiring-smoke.spec.mjs` skipped (expected when URL unset)
- [ ] `bpmn-roundtrip-big.spec.mjs` passed
- [ ] `tab-transition-matrix-big.spec.mjs` passed

## Console / Artifact Proof
- [ ] Playwright report saved: path `___________________________`
- [ ] Errors collected: `____________________________________`
- [ ] Warnings collected: `__________________________________`
- [ ] Critical issues: yes / no

## Worker Sign-Off
- Agent 2 status: `pending`
- Completed at: `___________________________`

## Reviewer Sign-Off
- Agent 3 status: `pending`
- Completed at: `___________________________`
