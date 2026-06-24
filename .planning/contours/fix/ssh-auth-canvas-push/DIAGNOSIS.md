# SSH auth diagnosis — fix/canvas-load-optimization-v2 push

## Source truth

- Repo: `/root/processmap_v1`
- Branch: `fix/canvas-load-optimization-v2`
- HEAD: `e96b0c77843c1f0dcd0b5f8dd2ba58e8d1c5ed0f`
- Remote `new-origin`: `git@github.com:xiaomibelov/processmap_v1.git` (SSH)

## Diagnosis steps

1. `git remote -v` — `new-origin` points to `git@github.com:xiaomibelov/processmap_v1.git`.
2. `~/.ssh/` — directory does not exist; no SSH keys available.
3. `~/.ssh/config` — does not exist.
4. `ssh-add -l` — no ssh-agent running, no identities.
5. `ssh -vT git@github.com` — GitHub accepts only `publickey`; client has no keys → `Permission denied (publickey)`.
6. `git push new-origin fix/canvas-load-optimization-v2` — fails with `Permission denied (publickey)`.

## Root cause

The environment has no SSH key pair and GitHub rejects unauthenticated SSH access. The user provided a GitHub Personal Access Token (`ghp_***`), so the fix is to switch the `new-origin` remote to HTTPS and authenticate with the token via `gh`.

## Fix applied

1. Authenticated `gh` CLI with the provided PAT:
   ```bash
   gh auth login --with-token --hostname github.com < /tmp/gh_token
   gh auth setup-git --hostname github.com
   ```
2. Switched `new-origin` to HTTPS:
   ```bash
   git remote set-url new-origin https://github.com/xiaomibelov/processmap_v1.git
   ```
3. Pushed the branch:
   ```bash
   git push new-origin fix/canvas-load-optimization-v2 --force-with-lease
   ```
4. Verified with `git ls-remote`:
   ```
   e96b0c77843c1f0dcd0b5f8dd2ba58e8d1c5ed0f	refs/heads/fix/canvas-load-optimization-v2
   ```

## History check

The branch contains 8 clean, separate commits on top of `new-origin/main`:

```
e96b0c77 fix(canvas): keep BPMN XML cache fresh after backend load to avoid parent refetch on subprocess return
1cb6d183 fix(canvas): wire extracted modules, fix createDiagram import_error signal, tune pan throttle
f5d5d8d5 refactor(canvas): extract BpmnStage pure helpers into runtimeHelpers module
31b8b621 feat(canvas): extract stage runtime performance constants module
d14eba45 feat(canvas): extract diagram load state machine into dedicated module + tests
4ce6e429 feat(canvas): extract session status optimistic update hook from App.jsx
9aea11eb feat(canvas): extract subprocess navigation hook from App.jsx
c52f5f9b feat(canvas): extract BPMN XML cache module (cache + hook + tests)
```

## PR

- URL: https://github.com/xiaomibelov/processmap_v1/pull/408
- Title: `[CRITICAL] Canvas load timeout + FPS + decomposition`
- Base: `main`
- Head: `fix/canvas-load-optimization-v2`
- Merge strategy requested: **Merge pull request (create a merge commit)** — no squash, no rebase.

## Remaining gate

Merge is blocked until explicit user approval (per AGENTS.md §7).
