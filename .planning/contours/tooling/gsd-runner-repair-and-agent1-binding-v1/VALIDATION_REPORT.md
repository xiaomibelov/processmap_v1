# VALIDATION_REPORT — tooling/gsd-runner-repair-and-agent1-binding-v1

Generated: 2026-05-14T19:18:39+00:00

## Source truth after repair

```bash
cd /opt/processmap-test; pwd; whoami; hostname; date -Is; git status -sb; git branch --show-current; git rev-parse HEAD; git rev-parse origin/main; curl -s http://clearvestnic.ru:8088/health || true
```

```text
/opt/processmap-test
root
clearvestnic.ru
2026-05-14T19:18:39+00:00
## fix/lockfile-sync-test
 M .env
 M frontend/src/components/AppShell.jsx
 M frontend/src/components/TopBar.jsx
 M frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs
 M frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
 M frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
 M frontend/src/styles/tailwind.css
?? .agents/
?? .env.backup_20260514_095731
?? .planning/agent-logs/
?? .planning/contours/
?? .planning/templates/agent3-ui-runtime-proof-checklist.md
?? .planning/templates/agent3-ui-runtime-review-template.md
?? .playwright-mcp/
?? TEST_RUNTIME.md
?? bin/
?? registry-bottom.png
?? registry-fullpage.png
?? registry-initial.png
?? registry-light-attempt.png
?? registry-light-bottom.png
?? registry-light-middle.png
?? registry-light-top.png
?? registry-light.png
?? registry-middle.png
?? registry-normal-screen.png
?? registry-scrolled.png
?? registry-top.png
?? registry-wide.png
?? review_registry_dark.png
?? scripts/obsidian-write.sh
?? tools/install-processmap-agent-scripts.sh
?? tools/pm-agent-mirror-report.sh
?? tools/pm-agent-reset-stale.sh
?? tools/pm-agent-status.sh
?? tools/pm-agent1-planner.sh
?? tools/pm-agent2-executor-watch.sh
?? tools/pm-agent3-reviewer-watch.sh
?? tools/pm-agents-server-tmux.sh
?? tools/pm-gsd-status.sh
fix/lockfile-sync-test
a9a9d9c5f468d9da63415306da6d34dcd605aa0d
d805e1c64c1107b9e3fe6854e031694bf741b187
{"ok":true,"status":"ok","redis":{"mode":"ON","state":"healthy","configured":true,"required":true,"available":true,"degraded":false,"incident":false,"fallback_active":false,"reason":"","redis_url":"redis://redis:6379/0","client_error":"","ping_error":""}}```

## GSD wrapper command availability

```bash
cd /opt/processmap-test; export PATH="/opt/processmap-test/bin:$PATH"; command -v gsd; ls -la /opt/processmap-test/bin/gsd /opt/processmap-test/bin/gsd-sdk; test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo CODEX_GSD_TOOLS_FOUND
```

```text
/opt/processmap-test/bin/gsd
-rwxr-xr-x 1 root root 427 May 14 19:15 /opt/processmap-test/bin/gsd
-rwxr-xr-x 1 root root 437 May 14 19:15 /opt/processmap-test/bin/gsd-sdk
CODEX_GSD_TOOLS_FOUND
```

## GSD help version usage probes

```bash
cd /opt/processmap-test; export PATH="/opt/processmap-test/bin:$PATH"; gsd --help || true; gsd --version || true; echo "--- no args usage ---"; gsd || true
```

```text
Error: Unknown flag: --help
gsd-tools does not accept help or version flags. Run "gsd-tools" with no arguments for usage.
Error: Unknown flag: --version
gsd-tools does not accept help or version flags. Run "gsd-tools" with no arguments for usage.
--- no args usage ---
Error: Usage: gsd-tools <command> [args] [--raw] [--pick <field>] [--cwd <path>] [--ws <name>]
Commands: state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, config-new-project, init, workstream, docs-init
```

## Direct wrapper help probe

```bash
cd /opt/processmap-test; /opt/processmap-test/bin/gsd --help || true
```

```text
Error: Unknown flag: --help
gsd-tools does not accept help or version flags. Run "gsd-tools" with no arguments for usage.
```

## Agent script syntax

```bash
cd /opt/processmap-test; bash -n tools/pm-agent1-planner.sh; bash -n tools/pm-agent-status.sh; bash -n tools/pm-gsd-status.sh; echo SYNTAX_OK
```

```text
SYNTAX_OK
```

## pm-gsd-status

```bash
cd /opt/processmap-test; ./tools/pm-gsd-status.sh
```

```text
=== ProcessMap GSD Status ===
Root: /opt/processmap-test
PATH command gsd: /opt/processmap-test/bin/gsd
Expected wrapper: /opt/processmap-test/bin/gsd
Codex GSD tools: /root/.codex/get-shit-done/bin/gsd-tools.cjs
Node: /usr/bin/node
v18.19.1

=== Wrapper ===
-rwxr-xr-x 1 root root 427 May 14 19:15 /opt/processmap-test/bin/gsd
-rwxr-xr-x 1 root root 53082 Apr 26 20:56 /root/.codex/get-shit-done/bin/gsd-tools.cjs

=== GSD Usage Probe ===
gsd exit: 1
Error: Usage: gsd-tools <command> [args] [--raw] [--pick <field>] [--cwd <path>] [--ws <name>]
Commands: state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, config-new-project, init, workstream, docs-init

=== Skills ===
Skills dir: /root/.codex/skills
/root/.codex/skills/gsd-add-backlog
/root/.codex/skills/gsd-add-phase
/root/.codex/skills/gsd-add-tests
/root/.codex/skills/gsd-add-todo
/root/.codex/skills/gsd-ai-integration-phase
/root/.codex/skills/gsd-analyze-dependencies
/root/.codex/skills/gsd-audit-fix
/root/.codex/skills/gsd-audit-milestone
/root/.codex/skills/gsd-audit-uat
/root/.codex/skills/gsd-autonomous
/root/.codex/skills/gsd-check-todos
/root/.codex/skills/gsd-cleanup
/root/.codex/skills/gsd-code-review
/root/.codex/skills/gsd-code-review-fix
/root/.codex/skills/gsd-complete-milestone
/root/.codex/skills/gsd-debug
/root/.codex/skills/gsd-discuss-phase
/root/.codex/skills/gsd-do
/root/.codex/skills/gsd-docs-update
/root/.codex/skills/gsd-eval-review
/root/.codex/skills/gsd-execute-phase
/root/.codex/skills/gsd-explore
/root/.codex/skills/gsd-extract_learnings
/root/.codex/skills/gsd-fast
/root/.codex/skills/gsd-forensics
/root/.codex/skills/gsd-from-gsd2
/root/.codex/skills/gsd-graphify
/root/.codex/skills/gsd-health
/root/.codex/skills/gsd-help
/root/.codex/skills/gsd-import
/root/.codex/skills/gsd-inbox
/root/.codex/skills/gsd-ingest-docs
/root/.codex/skills/gsd-insert-phase
/root/.codex/skills/gsd-intel
/root/.codex/skills/gsd-join-discord
/root/.codex/skills/gsd-list-phase-assumptions
/root/.codex/skills/gsd-list-workspaces
/root/.codex/skills/gsd-manager
/root/.codex/skills/gsd-map-codebase
/root/.codex/skills/gsd-milestone-summary
/root/.codex/skills/gsd-new-milestone
/root/.codex/skills/gsd-new-project
/root/.codex/skills/gsd-new-workspace
/root/.codex/skills/gsd-next
/root/.codex/skills/gsd-note
/root/.codex/skills/gsd-pause-work
/root/.codex/skills/gsd-plan-milestone-gaps
/root/.codex/skills/gsd-plan-phase
/root/.codex/skills/gsd-plan-review-convergence
/root/.codex/skills/gsd-plant-seed
Skills count: 85

=== Agents ===
Agents dir: /root/.codex/agents
/root/.codex/agents/gsd-advisor-researcher.md
/root/.codex/agents/gsd-advisor-researcher.toml
/root/.codex/agents/gsd-ai-researcher.md
/root/.codex/agents/gsd-ai-researcher.toml
/root/.codex/agents/gsd-assumptions-analyzer.md
/root/.codex/agents/gsd-assumptions-analyzer.toml
/root/.codex/agents/gsd-code-fixer.md
/root/.codex/agents/gsd-code-fixer.toml
/root/.codex/agents/gsd-code-reviewer.md
/root/.codex/agents/gsd-code-reviewer.toml
/root/.codex/agents/gsd-codebase-mapper.md
/root/.codex/agents/gsd-codebase-mapper.toml
/root/.codex/agents/gsd-debug-session-manager.md
/root/.codex/agents/gsd-debug-session-manager.toml
/root/.codex/agents/gsd-debugger.md
/root/.codex/agents/gsd-debugger.toml
/root/.codex/agents/gsd-doc-classifier.md
/root/.codex/agents/gsd-doc-classifier.toml
/root/.codex/agents/gsd-doc-synthesizer.md
/root/.codex/agents/gsd-doc-synthesizer.toml
/root/.codex/agents/gsd-doc-verifier.md
/root/.codex/agents/gsd-doc-verifier.toml
/root/.codex/agents/gsd-doc-writer.md
/root/.codex/agents/gsd-doc-writer.toml
/root/.codex/agents/gsd-domain-researcher.md
/root/.codex/agents/gsd-domain-researcher.toml
/root/.codex/agents/gsd-eval-auditor.md
/root/.codex/agents/gsd-eval-auditor.toml
/root/.codex/agents/gsd-eval-planner.md
/root/.codex/agents/gsd-eval-planner.toml
/root/.codex/agents/gsd-executor.md
/root/.codex/agents/gsd-executor.toml
/root/.codex/agents/gsd-framework-selector.md
/root/.codex/agents/gsd-framework-selector.toml
/root/.codex/agents/gsd-integration-checker.md
/root/.codex/agents/gsd-integration-checker.toml
/root/.codex/agents/gsd-intel-updater.md
/root/.codex/agents/gsd-intel-updater.toml
/root/.codex/agents/gsd-nyquist-auditor.md
/root/.codex/agents/gsd-nyquist-auditor.toml
/root/.codex/agents/gsd-pattern-mapper.md
/root/.codex/agents/gsd-pattern-mapper.toml
/root/.codex/agents/gsd-phase-researcher.md
/root/.codex/agents/gsd-phase-researcher.toml
/root/.codex/agents/gsd-plan-checker.md
/root/.codex/agents/gsd-plan-checker.toml
/root/.codex/agents/gsd-planner.md
/root/.codex/agents/gsd-planner.toml
/root/.codex/agents/gsd-project-researcher.md
/root/.codex/agents/gsd-project-researcher.toml
Agent files count: 66

=== Known Global Symlink Warning ===
/usr/local/bin/gsd: missing
/usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk
  target missing
/usr/local/bin/get-shit-done-cc -> /root/.local/bin/get-shit-done-cc
  target missing
/root/.local/bin/gsd: missing
/root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js
  target missing
/root/.local/bin/get-shit-done-cc -> ../lib/node_modules/get-shit-done-cc/bin/install.js
  target missing
```

## Login bash GSD binding

```bash
cd /opt/processmap-test && export PATH="/opt/processmap-test/bin:$PATH"; command -v gsd; gsd >/tmp/pm-gsd-help.out 2>&1; echo EXIT:$?; head -40 /tmp/pm-gsd-help.out
```

```text
/opt/processmap-test/bin/gsd
EXIT:1
Error: Usage: gsd-tools <command> [args] [--raw] [--pick <field>] [--cwd <path>] [--ws <name>]
Commands: state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, config-new-project, init, workstream, docs-init
```

## Skills and agents visibility

```bash
find /root/.codex/skills -maxdepth 2 -type d -name "gsd-*" | sort | head -50; find /root/.codex/agents -maxdepth 2 \( -type f -o -type d \) -name "gsd-*" | sort | head -50
```

```text
/root/.codex/skills/gsd-add-backlog
/root/.codex/skills/gsd-add-phase
/root/.codex/skills/gsd-add-tests
/root/.codex/skills/gsd-add-todo
/root/.codex/skills/gsd-ai-integration-phase
/root/.codex/skills/gsd-analyze-dependencies
/root/.codex/skills/gsd-audit-fix
/root/.codex/skills/gsd-audit-milestone
/root/.codex/skills/gsd-audit-uat
/root/.codex/skills/gsd-autonomous
/root/.codex/skills/gsd-check-todos
/root/.codex/skills/gsd-cleanup
/root/.codex/skills/gsd-code-review
/root/.codex/skills/gsd-code-review-fix
/root/.codex/skills/gsd-complete-milestone
/root/.codex/skills/gsd-debug
/root/.codex/skills/gsd-discuss-phase
/root/.codex/skills/gsd-do
/root/.codex/skills/gsd-docs-update
/root/.codex/skills/gsd-eval-review
/root/.codex/skills/gsd-execute-phase
/root/.codex/skills/gsd-explore
/root/.codex/skills/gsd-extract_learnings
/root/.codex/skills/gsd-fast
/root/.codex/skills/gsd-forensics
/root/.codex/skills/gsd-from-gsd2
/root/.codex/skills/gsd-graphify
/root/.codex/skills/gsd-health
/root/.codex/skills/gsd-help
/root/.codex/skills/gsd-import
/root/.codex/skills/gsd-inbox
/root/.codex/skills/gsd-ingest-docs
/root/.codex/skills/gsd-insert-phase
/root/.codex/skills/gsd-intel
/root/.codex/skills/gsd-join-discord
/root/.codex/skills/gsd-list-phase-assumptions
/root/.codex/skills/gsd-list-workspaces
/root/.codex/skills/gsd-manager
/root/.codex/skills/gsd-map-codebase
/root/.codex/skills/gsd-milestone-summary
/root/.codex/skills/gsd-new-milestone
/root/.codex/skills/gsd-new-project
/root/.codex/skills/gsd-new-workspace
/root/.codex/skills/gsd-next
/root/.codex/skills/gsd-note
/root/.codex/skills/gsd-pause-work
/root/.codex/skills/gsd-plan-milestone-gaps
/root/.codex/skills/gsd-plan-phase
/root/.codex/skills/gsd-plan-review-convergence
/root/.codex/skills/gsd-plant-seed
/root/.codex/agents/gsd-advisor-researcher.md
/root/.codex/agents/gsd-advisor-researcher.toml
/root/.codex/agents/gsd-ai-researcher.md
/root/.codex/agents/gsd-ai-researcher.toml
/root/.codex/agents/gsd-assumptions-analyzer.md
/root/.codex/agents/gsd-assumptions-analyzer.toml
/root/.codex/agents/gsd-code-fixer.md
/root/.codex/agents/gsd-code-fixer.toml
/root/.codex/agents/gsd-code-reviewer.md
/root/.codex/agents/gsd-code-reviewer.toml
/root/.codex/agents/gsd-codebase-mapper.md
/root/.codex/agents/gsd-codebase-mapper.toml
/root/.codex/agents/gsd-debug-session-manager.md
/root/.codex/agents/gsd-debug-session-manager.toml
/root/.codex/agents/gsd-debugger.md
/root/.codex/agents/gsd-debugger.toml
/root/.codex/agents/gsd-doc-classifier.md
/root/.codex/agents/gsd-doc-classifier.toml
/root/.codex/agents/gsd-doc-synthesizer.md
/root/.codex/agents/gsd-doc-synthesizer.toml
/root/.codex/agents/gsd-doc-verifier.md
/root/.codex/agents/gsd-doc-verifier.toml
/root/.codex/agents/gsd-doc-writer.md
/root/.codex/agents/gsd-doc-writer.toml
/root/.codex/agents/gsd-domain-researcher.md
/root/.codex/agents/gsd-domain-researcher.toml
/root/.codex/agents/gsd-eval-auditor.md
/root/.codex/agents/gsd-eval-auditor.toml
/root/.codex/agents/gsd-eval-planner.md
/root/.codex/agents/gsd-eval-planner.toml
/root/.codex/agents/gsd-executor.md
/root/.codex/agents/gsd-executor.toml
/root/.codex/agents/gsd-framework-selector.md
/root/.codex/agents/gsd-framework-selector.toml
/root/.codex/agents/gsd-integration-checker.md
/root/.codex/agents/gsd-integration-checker.toml
/root/.codex/agents/gsd-intel-updater.md
/root/.codex/agents/gsd-intel-updater.toml
/root/.codex/agents/gsd-nyquist-auditor.md
/root/.codex/agents/gsd-nyquist-auditor.toml
/root/.codex/agents/gsd-pattern-mapper.md
/root/.codex/agents/gsd-pattern-mapper.toml
/root/.codex/agents/gsd-phase-researcher.md
/root/.codex/agents/gsd-phase-researcher.toml
/root/.codex/agents/gsd-plan-checker.md
/root/.codex/agents/gsd-plan-checker.toml
/root/.codex/agents/gsd-planner.md
/root/.codex/agents/gsd-planner.toml
/root/.codex/agents/gsd-project-researcher.md
/root/.codex/agents/gsd-project-researcher.toml
```

## Git touched files view

```bash
cd /opt/processmap-test; git status -sb; echo --- diff-name-only ---; git diff --name-only; echo --- untracked relevant ---; find bin tools .planning/contours/tooling/gsd-runner-repair-and-agent1-binding-v1 -maxdepth 3 -type f 2>/dev/null | sort
```

```text
## fix/lockfile-sync-test
 M .env
 M frontend/src/components/AppShell.jsx
 M frontend/src/components/TopBar.jsx
 M frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs
 M frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
 M frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
 M frontend/src/styles/tailwind.css
?? .agents/
?? .env.backup_20260514_095731
?? .planning/agent-logs/
?? .planning/contours/
?? .planning/templates/agent3-ui-runtime-proof-checklist.md
?? .planning/templates/agent3-ui-runtime-review-template.md
?? .playwright-mcp/
?? TEST_RUNTIME.md
?? bin/
?? registry-bottom.png
?? registry-fullpage.png
?? registry-initial.png
?? registry-light-attempt.png
?? registry-light-bottom.png
?? registry-light-middle.png
?? registry-light-top.png
?? registry-light.png
?? registry-middle.png
?? registry-normal-screen.png
?? registry-scrolled.png
?? registry-top.png
?? registry-wide.png
?? review_registry_dark.png
?? scripts/obsidian-write.sh
?? tools/install-processmap-agent-scripts.sh
?? tools/pm-agent-mirror-report.sh
?? tools/pm-agent-reset-stale.sh
?? tools/pm-agent-status.sh
?? tools/pm-agent1-planner.sh
?? tools/pm-agent2-executor-watch.sh
?? tools/pm-agent3-reviewer-watch.sh
?? tools/pm-agents-server-tmux.sh
?? tools/pm-gsd-status.sh
--- diff-name-only ---
.env
frontend/src/components/AppShell.jsx
frontend/src/components/TopBar.jsx
frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs
frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
frontend/src/styles/tailwind.css
--- untracked relevant ---
.planning/contours/tooling/gsd-runner-repair-and-agent1-binding-v1/VALIDATION_REPORT.md
bin/gsd
bin/gsd-sdk
bin/test-logs.sh
bin/test-redeploy.sh
bin/test-status.sh
tools/agent-create-contour.sh
tools/agent-run-executor.sh
tools/agent-run-reviewer.sh
tools/install-processmap-agent-scripts.sh
tools/pm-agent-mirror-report.sh
tools/pm-agent-reset-stale.sh
tools/pm-agent-status.sh
tools/pm-agent1-planner.sh
tools/pm-agent2-executor-watch.sh
tools/pm-agent3-reviewer-watch.sh
tools/pm-agents-server-tmux.sh
tools/pm-gsd-status.sh
tools/stage-auth-save-storage-state.mjs
tools/stage-open-session-proof.mjs
```
