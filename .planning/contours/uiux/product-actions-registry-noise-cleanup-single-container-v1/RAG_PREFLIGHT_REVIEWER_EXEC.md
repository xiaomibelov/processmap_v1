# RAG Preflight — Reviewer (executed)

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- command:

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer \
  --contour "uiux/product-actions-registry-noise-cleanup-single-container-v1" \
  --query "review rules for this contour" --format md --top-k 10
```

Full output saved to `/tmp/rag_reviewer_preflight.md` (transient). Key facts surfaced:

## Required gates (from preflight)

- Reviewer GSD discipline section in `REVIEW_REPORT.md`.
- Fresh runtime proof on `:5180` / `:8088`.
- Reproduce exact user scenario.
- Before/after evidence.
- Check user-rejection override list.
- No `REVIEW_PASS` if user-visible scenario still fails.
- Product runtime unchanged outside scope.

## Warnings to honour

- Prior `REVIEW_PASS` rejections in the diagram-drag-perf line (see `ur-fix-drag-ledger-rework`, `ur-perf-drag-hot-path`, `ur-fix-real-drag-engine`, `ur-synthetic-zoom-not-drag`, `ur-version-marker-on-canvas`). Not directly applicable to this UI contour but reinforces: do not pass on synthetic/source-only checks; require runtime DOM evidence.
- “No runtime facts matched query — runtime proof may be missing.” → must collect runtime proof here (done in §2 of REVIEW_REPORT).

## Top hits (abbrev)

- `#1–#3` — reviewer prompts / review-pass rules in prior contours.
- `#9–#10` — user rejection override doc and adjacent contour `RUNTIME_PROOF_CHECKLIST`.

## Applied to this review

- Static white-list/black-list diff is collected.
- Runtime served HTML / build-info / version label captured fresh on `:5180`.
- Forbidden-pattern grep results recorded.
- Verdict in `REVIEW_REPORT.md` references RUNTIME_PROOF_CHECKLIST.md A–I.
