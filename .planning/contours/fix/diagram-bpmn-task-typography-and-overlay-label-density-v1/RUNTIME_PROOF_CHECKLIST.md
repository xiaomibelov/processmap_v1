# RUNTIME_PROOF_CHECKLIST — fix/diagram-bpmn-task-typography-and-overlay-label-density-v1

## Agent 2 (Executor) Checklist

### Before Code
- [ ] Fresh 5180 opened with cache-bust (`?cb=<timestamp>`).
- [ ] build-info.json matches current HEAD.
- [ ] Version in footer is v1.0.133 (before bump).
- [ ] Marker NOT on canvas.
- [ ] Default task label computed styles recorded (font-weight, font-size, fill, stroke, paint-order, text-shadow, filter).
- [ ] Interaction mode computed styles recorded (before / during / after pan).
- [ ] Chip density observed and recorded.
- [ ] Screenshots taken.

### After Code
- [ ] Frontend build passes.
- [ ] build-info.json regenerated with correct contourId and timestamp.
- [ ] Fresh 5180 opened with cache-bust.
- [ ] Version in footer is v1.0.134.
- [ ] Marker NOT on canvas.
- [ ] Default task label computed styles recorded after fix.
- [ ] Text is readable but not heavy/bold.
- [ ] Interaction mode stable (no flash, no style jump).
- [ ] Chip density re-checked.
- [ ] 0 PUT /bpmn during pan.
- [ ] 0 PATCH /sessions during pan.
- [ ] 0 console errors.
- [ ] Screenshots taken.
- [ ] All reports written.
- [ ] `READY_FOR_REVIEW` created.

## Agent 3 (Reviewer) Checklist

### Independent Validation
- [ ] Reviewer GSD recorded.
- [ ] Reviewer RAG preflight completed.
- [ ] Fresh 5180 proof collected independently.
- [ ] build-info.json sha matches HEAD.
- [ ] Version v1.0.134 verified in footer.
- [ ] Marker NOT on canvas verified.
- [ ] Default task typography inspected independently.
- [ ] Task text is actually calmer / less bold (visual judgment, not just number).
- [ ] Text remains readable.
- [ ] Task fill white/light, not gray.
- [ ] Real canvas pan performed (not synthetic zoom/click).
- [ ] No white flash during pan.
- [ ] No style jump during/after pan.
- [ ] Chip density assessed.
- [ ] 0 PUT /bpmn during pan.
- [ ] 0 PATCH /sessions during pan.
- [ ] 0 console errors.
- [ ] Source review passed (bounded scope).
- [ ] Previous performance protections preserved.
- [ ] Visual evidence present.
- [ ] Real browser visual check performed.
- [ ] Verdict issued (REVIEW_PASS or REWORK_REQUEST).
