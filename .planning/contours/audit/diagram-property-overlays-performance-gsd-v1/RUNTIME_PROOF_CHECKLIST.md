# Runtime Proof Checklist

## Pre-execution
- [ ] GSD discipline recorded
- [ ] Source/runtime truth captured
- [ ] Session/route for Diagram audit documented
- [ ] Playwright availability checked

## Runtime Scenarios
- [ ] Baseline Diagram open tested (Scenario A)
- [ ] Analysis ↔ Diagram tab switch tested (Scenario B)
- [ ] Overlay visibility tested (Scenario C)
- [ ] Selection/hover tested (Scenario C)
- [ ] Pan/zoom tested (Scenario D)
- [ ] Large diagram / heavy session tested (Scenario E)

## Evidence Capture
- [ ] Network requests captured
- [ ] Console errors captured
- [ ] Duplicate version/limit messages checked
- [ ] Overlay DOM count checked
- [ ] Duplicate overlays checked
- [ ] EventBus/listener leak candidates checked
- [ ] useEffect/remount candidates checked

## Analysis
- [ ] Source map created
- [ ] Root-cause hypotheses ranked
- [ ] Fix recommendations created
- [ ] Project Atlas audit note created

## Safety
- [ ] No product code changed
- [ ] No BPMN XML mutation
- [ ] No commit/push/PR/deploy
- [ ] No .env changes
- [ ] No secrets in reports

## Gates
- [ ] Agent 3 review required
- [ ] Agent 3 review passed (or CHANGES_REQUESTED with rework)
