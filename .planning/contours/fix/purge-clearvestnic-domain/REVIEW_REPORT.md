# REVIEW_REPORT — fix/purge-clearvestnic-domain

**Reviewer:** Kimi Code CLI (self-review per contour discipline)  
**Date:** 2026-08-28  
**Verdict:** REVIEW_PASS with notes

---

## Review checklist

1. **Source/runtime truth captured:** yes — branch `fix/purge-clearvestnic-domain` from `origin/main` @ `ffaaa38f`.
2. **Bounded scope respected:** yes — only domain-purge changes, no product code, no server changes.
3. **No auto-PR/merge/deploy:** yes — waiting for owner approval.
4. **Active files correctly updated:** yes — all active clearvestnic mentions replaced with `stage.processmap.ru` / `localhost`.
5. **AGENTS.md domain block:** yes — section 1.5 added.
6. **Historical files not rewritten:** yes — only DEPRECATED banners inserted.
7. **Obsidian notes:** yes — 468 historical notes bannered.
8. **CI/workflows:** no clearvestnic mentions found in `.github/workflows`.

## Findings

- `tools/rag` facts now point to `stage.processmap.ru` for stage environment and `localhost:5177` for local dev runtime checks. This matches `AGENTS.md` section 11 and current `verify-deploy.sh` defaults.
- `AGENTS.md` now explicitly forbids `clearvestnic.ru` and defines prod/stage/localhost mapping.
- The only remaining `clearvestnic` occurrences in the repo (excluding `.git`) are:
  - DEPRECATED banners in historical `.planning` documents;
  - the explicit prohibition in `AGENTS.md`.

## Risks / limitations

- Historical JSON artifacts (e.g., `STATE.json`, `fps_measurements.json`) still contain `clearvestnic.ru` inside structured data, but each file is prefixed with a DEPRECATED comment. These files are not consumed by active code.
- The Obsidian vault path `/srv/obsidian/project-atlas` does not exist locally; mirror was performed equivalently into `server-backup/srv/obsidian/project-atlas/ProcessMap`.

## Recommendation

Approve. Wait for owner approval before merge.
