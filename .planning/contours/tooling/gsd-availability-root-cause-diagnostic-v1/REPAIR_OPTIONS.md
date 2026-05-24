# Repair Options — GSD Availability

## Option 1 — Minimal PATH Repair
What changes: ensure the agent runtime PATH includes the directory containing a working GSD binary.

Pros:
- Smallest launcher change if a working binary already exists.

Cons:
- Not sufficient by itself now: `gsd-sdk` symlinks are broken and `gsd` is absent.

Risk: low if limited to launcher env only; medium if shell profiles are edited.

Rollback: revert launcher PATH change.

Recommendation: not sufficient alone.

## Option 2 — Recreate Symlink to Existing Local Tool
What changes: point a stable executable wrapper such as `gsd-sdk` to `/root/.codex/get-shit-done/bin/gsd-tools.cjs` or a wrapper around it.

Pros:
- Uses existing server files.
- Avoids package install.
- Can be validated with command probes after creation.

Cons:
- `gsd-tools.cjs` command surface may not match historical `gsd-sdk` CLI exactly.
- Needs a compatibility wrapper if Agent 1 expects `gsd-sdk query ...` style commands.

Risk: medium.

Rollback: remove/revert wrapper/symlink created by repair contour.

Recommendation: viable only after mapping required Agent 1 GSD calls.

## Option 3 — Install/Restore Missing Package
What changes: restore the missing global `get-shit-done-cc` npm package expected by `/root/.local/bin/gsd-sdk` and `/root/.local/bin/get-shit-done-cc`.

Pros:
- Restores original symlink intent.
- Least custom glue if package source is known.

Cons:
- Requires package install or copying package artifact.
- `gsd-sdk` is not a normal public registry package in this environment.
- Needs source/version decision and explicit permission.

Risk: medium to high depending on package source.

Rollback: remove installed package and restore previous symlink state from manifest.

Recommendation: only with explicit package source and install permission.

## Option 4 — Wire Codex-local `gsd-tools.cjs` into Agent Scripts
What changes: update ProcessMap agent launcher scripts to detect `/root/.codex/get-shit-done/bin/gsd-tools.cjs`, run safe GSD queries through `node`, and pass the detected GSD mode/tool path into Agent 1's prompt.

Pros:
- No package install required.
- Uses the GSD tooling that actually exists on the server.
- Can keep repair scoped to tooling scripts.

Cons:
- Requires defining a small adapter contract because `gsd-tools.cjs` is not the same command as broken `gsd-sdk` symlink.
- Kimi still will not automatically know Codex skills unless prompt includes skill file paths or summarized contracts.

Risk: medium.

Rollback: revert ProcessMap agent tooling script changes.

Recommendation: recommended if package install remains disallowed.

## Option 5 — Restore Skills Directory for Kimi-visible Runtime
What changes: make GSD skill contracts visible to Kimi, either by copying/syncing skill markdown into a Kimi-visible directory or by having Agent 1 prompt explicitly reference `/root/.codex/skills/gsd-*` files.

Pros:
- Addresses the `Skills/tools GSD absent` part directly.
- Avoids changing product code.

Cons:
- Requires deciding whether Kimi should read Codex skill files directly or use a curated ProcessMap prompt bundle.
- Copying skills creates drift risk.

Risk: medium.

Rollback: remove prompt references or copied skill bundle.

Recommendation: recommended as prompt/reference binding, not blind copying.

## Option 6 — Keep Documented Fallback but Improve Detection
What changes: leave Agent 1 in manual GSD fallback when no runner exists, but improve the detection output so it clearly says: broken global symlinks, Codex-local skills present, Kimi binding missing.

Pros:
- Lowest risk.
- Makes future diagnosis clear.

Cons:
- Does not restore full GSD automation.

Risk: low.

Rollback: revert detection/reporting changes.

Recommendation: acceptable temporary mitigation, not final fix.

## Recommended Repair Contour
`tooling/gsd-runner-repair-and-agent1-binding-v1`

Recommended scope:
- Do not touch product code.
- Do not run MCP repair unless separately authorized.
- Prefer no package install unless package source is explicitly provided.
- Build a stable GSD detection path for Agent 1.
- Validate `gsd`/`gsd-sdk` or adapter command availability from the exact Kimi launcher environment.
- Validate Agent 1 no longer reports `GSD_FALLBACK_MANUAL_PLANNING_ONLY` when GSD tooling is available.
- Document the final contract in Project Atlas.
