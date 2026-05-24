# Command Outputs Sanitized

Generated: 2026-05-14T18:50:11+00:00
Contour: tooling/gsd-availability-root-cause-diagnostic-v1

## Source truth

```bash
cd /opt/processmap-test; pwd; whoami; id; hostname; date -Is; uname -a; git status -sb; git branch --show-current; git rev-parse HEAD; git rev-parse origin/main; curl -s http://clearvestnic.ru:8088/health || true
```

```text
/opt/processmap-test
root
uid=0(root) gid=0(root) groups=0(root)
clearvestnic.ru
2026-05-14T18:50:11+00:00
Linux clearvestnic.ru 6.8.0-111-generic #111-Ubuntu SMP PREEMPT_DYNAMIC Sat Apr 11 23:16:02 UTC 2026 x86_64 x86_64 x86_64 GNU/Linux
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
?? tools/pm-agent-reset-stale.sh
?? tools/pm-agent-status.sh
?? tools/pm-agent1-planner.sh
?? tools/pm-agent2-executor-watch.sh
?? tools/pm-agent3-reviewer-watch.sh
?? tools/pm-agents-server-tmux.sh
fix/lockfile-sync-test
a9a9d9c5f468d9da63415306da6d34dcd605aa0d
d805e1c64c1107b9e3fe6854e031694bf741b187
{"ok":true,"status":"ok","redis":{"mode":"ON","state":"healthy","configured":true,"required":true,"available":true,"degraded":false,"incident":false,"fallback_active":false,"reason":"","redis_url":"redis://<redacted>
```

## Shell PATH environment sanitized

```bash
echo SHELL=$SHELL; echo PATH=$PATH; printf '%s\n' "$PATH" | tr ':' '\n'; env | sort | awk -F= '/^(PATH|SHELL|HOME|USER|LOGNAME|NPM|NODE|PNPM|YARN|CLAUDE|KIMI|MCP|GSD)=/ { if ($1 ~ /(TOKEN|SECRET|KEY|PASSWORD|PASS|AUTH|COOKIE)/) print $1"=<redacted>"; else print }'
```

```text
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin
/usr/local/sbin
/usr/local/bin
/usr/sbin
/usr/bin
/sbin
/bin
/usr/games
/usr/local/games
/snap/bin
HOME=/root
LOGNAME=root
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin
SHELL=/bin/bash
USER=root

```

## Login bash PATH and GSD commands

```bash
bash -lc 'echo LOGIN_BASH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true'
```

```text
LOGIN_BASH_PATH=/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin

```

## Interactive bash PATH and GSD commands

```bash
bash -ic 'echo INTERACTIVE_BASH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true' || true
```

```text
bash: cannot set terminal process group (541297): Inappropriate ioctl for device
bash: no job control in this shell
duplicate session: main
INTERACTIVE_BASH_PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin

```

## Login zsh PATH and GSD commands

```bash
command -v zsh >/dev/null && zsh -lc 'echo LOGIN_ZSH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true' || true
```

```text

```

## Interactive zsh PATH and GSD commands

```bash
command -v zsh >/dev/null && zsh -ic 'echo INTERACTIVE_ZSH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true' || true
```

```text

```

## Command availability

```bash
command -v gsd || true; command -v gsd-sdk || true; which gsd || true; which gsd-sdk || true; type -a gsd || true; type -a gsd-sdk || true
```

```text
bash: line 1: type: gsd: not found
bash: line 1: type: gsd-sdk: not found

```

## Common bin locations

```bash
ls -la /usr/local/bin | grep -Ei 'gsd|get-shit|shit-done' || true; ls -la /usr/bin | grep -Ei 'gsd|get-shit|shit-done' || true; ls -la /bin | grep -Ei 'gsd|get-shit|shit-done' || true; ls -la /root/.local/bin 2>/dev/null | grep -Ei 'gsd|get-shit|shit-done' || true; ls -la /root/.npm-global/bin 2>/dev/null | grep -Ei 'gsd|get-shit|shit-done' || true; ls -la /opt/processmap-test/bin 2>/dev/null | grep -Ei 'gsd|get-shit|shit-done' || true; ls -la /opt/processmap-test/tools 2>/dev/null | grep -Ei 'gsd|get-shit|shit-done' || true
```

```text
lrwxrwxrwx  1 root root       33 Apr 26 20:58 get-shit-done-cc -> /root/.local/bin/get-shit-done-cc
lrwxrwxrwx  1 root root       24 Apr 26 20:58 gsd-sdk -> /root/.local/bin/gsd-sdk
lrwxrwxrwx 1 root root       51 Apr 26 20:57 get-shit-done-cc -> ../lib/node_modules/get-shit-done-cc/bin/install.js
lrwxrwxrwx 1 root root       51 Apr 26 20:57 gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js

```

## Potential GSD symlinks

```bash
find /usr/local/bin /usr/bin /root/.local/bin /root/.npm-global/bin /opt/processmap-test/bin /opt/processmap-test/tools -maxdepth 1 \( -iname '*gsd*' -o -iname '*get-shit*' -o -iname '*shit-done*' \) -exec ls -la {} \; 2>/dev/null || true
```

```text
lrwxrwxrwx 1 root root 33 Apr 26 20:58 /usr/local/bin/get-shit-done-cc -> /root/.local/bin/get-shit-done-cc
lrwxrwxrwx 1 root root 24 Apr 26 20:58 /usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk
lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/get-shit-done-cc -> ../lib/node_modules/get-shit-done-cc/bin/install.js
lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js

```

## Broken GSD symlinks

```bash
find /usr/local/bin /usr/bin /root/.local/bin /root/.npm-global/bin /opt/processmap-test/bin /opt/processmap-test/tools -maxdepth 1 -xtype l -exec ls -la {} \; 2>/dev/null | grep -Ei 'gsd|get-shit|shit-done' || true
```

```text
lrwxrwxrwx 1 root root 33 Apr 26 20:58 /usr/local/bin/get-shit-done-cc -> /root/.local/bin/get-shit-done-cc
lrwxrwxrwx 1 root root 24 Apr 26 20:58 /usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk
lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/get-shit-done-cc -> ../lib/node_modules/get-shit-done-cc/bin/install.js
lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js

```

## Node npm pnpm package state

```bash
node -v || true; npm -v || true; pnpm -v || true; yarn -v || true; corepack --version || true; npm config get prefix || true; npm root -g || true; npm bin -g || true; npm list -g --depth=0 2>/dev/null | grep -Ei 'gsd|get-shit|shit-done|claude|kimi' || true
```

```text
v18.19.1
9.2.0
bash: line 1: pnpm: command not found
bash: line 1: yarn: command not found
bash: line 1: corepack: command not found
/usr/local
/usr/local/lib/node_modules
Unknown command: "bin"

To see a list of supported npm commands, run:
  npm help

```

## Global package dirs GSD search

```bash
NROOT=$(npm root -g 2>/dev/null || true); if [ -n "$NROOT" ]; then ls -la "$NROOT" 2>/dev/null | grep -Ei 'gsd|get-shit|shit-done' || true; find "$NROOT" -maxdepth 3 \( -iname '*gsd*' -o -iname '*get-shit*' -o -iname '*shit-done*' \) 2>/dev/null | head -100 || true; fi
```

```text

```

## npx no-install GSD checks

```bash
timeout 10 npx --no-install gsd --version || true; timeout 10 npx --no-install gsd-sdk --version || true; timeout 10 npx --no-install get-shit-done-cc --version || true
```

```text
npm ERR! canceled

npm ERR! A complete log of this run can be found in:
npm ERR!     /root/.npm/_logs/2026-05-14T18_50_17_286Z-debug-0.log
npm ERR! code E404
npm ERR! 404 Not Found - GET https://registry.npmjs.org/gsd-sdk - Not found
npm ERR! 404 
npm ERR! 404  'gsd-sdk@*' is not in this registry.
npm ERR! 404 
npm ERR! 404 Note that you can also install from a
npm ERR! 404 tarball, folder, http url, or git url.

npm ERR! A complete log of this run can be found in:
npm ERR!     /root/.npm/_logs/2026-05-14T18_50_18_691Z-debug-0.log
npm ERR! canceled

npm ERR! A complete log of this run can be found in:
npm ERR!     /root/.npm/_logs/2026-05-14T18_50_19_943Z-debug-0.log

```

## Repo-local GSD tooling search

```bash
find /opt/processmap-test -maxdepth 6 \( -iname '*gsd*' -o -iname '*get-shit*' -o -iname '*shit-done*' \) -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' 2>/dev/null | sort | head -300
```

```text
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1
/opt/processmap-test/docs/gsd
/opt/processmap-test/frontend/src/features/admin/hooks/useAdminOrgsData.js

```

## Repo-local gsd scripts docs search

```bash
find /opt/processmap-test -maxdepth 8 -iname 'gsd-tools.cjs' 2>/dev/null || true; find /opt/processmap-test -maxdepth 8 -iname '*gsd*.cjs' 2>/dev/null || true; find /opt/processmap-test -maxdepth 8 -iname '*gsd*.js' 2>/dev/null || true; find /opt/processmap-test -maxdepth 8 -iname '*gsd*.md' 2>/dev/null || true
```

```text
/opt/processmap-test/frontend/src/features/admin/hooks/useAdminOrgsData.js

```

## gsd-tools help version if present

```bash
for p in $(find /opt/processmap-test -maxdepth 8 -iname 'gsd-tools.cjs' 2>/dev/null); do echo == $p ==; node "$p" --help || true; node "$p" --version || true; done
```

```text

```

## Kimi Claude config directories listing only

```bash
ls -la ~/.kimi 2>/dev/null || true; ls -la ~/.claude 2>/dev/null || true; ls -la ~/.config 2>/dev/null | head -100 || true
```

```text
total 52
drwxr-xr-x  8 root root 4096 May 14 17:58 .
drwx------ 25 root root 4096 May 14 17:10 ..
drwxr-xr-x  2 root root 4096 May 14 15:08 bin
-rw-r--r--  1 root root 1577 May 14 07:32 config.toml
drwxr-xr-x  2 root root 4096 May 14 18:47 credentials
-rw-------  1 root root   32 May 14 07:32 device_id
-rw-------  1 root root  284 May 14 17:58 kimi.json
-rw-r--r--  1 root root    6 May 14 17:58 latest_version.txt
drwxr-xr-x  2 root root 4096 May 14 07:32 logs
-rw-r--r--  1 root root  295 May 14 07:48 mcp.json
drwxr-xr-x  4 root root 4096 May 14 11:42 sessions
drwx------  2 root root 4096 May 14 17:58 telemetry
drwxr-xr-x  2 root root 4096 May 14 11:42 user-history
total 24
drwxr-xr-x  6 root root 4096 May  2 19:33 .
drwx------ 25 root root 4096 May 14 17:10 ..
drwxr-xr-x  2 root root 4096 May  2 19:33 backups
drwx------  3 root root 4096 May  2 19:33 projects
drwx------  2 root root 4096 May  2 19:33 sessions
drwxr-xr-x  2 root root 4096 May  2 19:33 telemetry
total 24
drwx------  6 root root 4096 May 14 16:43 .
drwx------ 25 root root 4096 May 14 17:10 ..
drwx------  3 root root 4096 May 14 16:43 google-chrome
drwx------  3 root root 4096 Apr  7 07:32 google-chrome-for-testing
drwxr-xr-x  3 root root 4096 May 14 11:10 systemd
drwxr-xr-x  2 root root 4096 May 14 07:31 uv

```

## GSD skills path search

```bash
find ~/.kimi ~/.claude ~/.config /opt/processmap-test -maxdepth 6 \( -iname '*gsd*' -o -iname '*get-shit*' -o -iname '*shit-done*' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | sort | head -300
```

```text
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1
/opt/processmap-test/docs/gsd
/opt/processmap-test/frontend/src/features/admin/hooks/useAdminOrgsData.js

```

## Skill directory search

```bash
find ~/.claude ~/.kimi ~/.config /opt/processmap-test -maxdepth 5 -type d \( -iname 'skills' -o -iname '*skill*' \) 2>/dev/null | sort | head -100
```

```text
/opt/processmap-test/.planning/contours/tooling/processmap-agent3-ui-review-skill-binding-v1

```

## Fallback source grep

```bash
grep -R 'GSD_FALLBACK_MANUAL_PLANNING_ONLY\|gsd-sdk\|which gsd\|GSD Discipline' .planning tools bin PROCESSMAP docs 2>/dev/null | head -200 || true
```

```text
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:bash -lc 'echo LOGIN_BASH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true'
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:bash -ic 'echo INTERACTIVE_BASH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true' || true
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:command -v zsh >/dev/null && zsh -lc 'echo LOGIN_ZSH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true' || true
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:command -v zsh >/dev/null && zsh -ic 'echo INTERACTIVE_ZSH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true' || true
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:command -v gsd || true; command -v gsd-sdk || true; which gsd || true; which gsd-sdk || true; type -a gsd || true; type -a gsd-sdk || true
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:bash: line 1: type: gsd-sdk: not found
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx  1 root root       24 Apr 26 20:58 gsd-sdk -> /root/.local/bin/gsd-sdk
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root       51 Apr 26 20:57 gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 24 Apr 26 20:58 /usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 24 Apr 26 20:58 /usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:timeout 10 npx --no-install gsd --version || true; timeout 10 npx --no-install gsd-sdk --version || true; timeout 10 npx --no-install get-shit-done-cc --version || true
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:npm ERR! 404 Not Found - GET https://registry.npmjs.org/gsd-sdk - Not found
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:npm ERR! 404  'gsd-sdk@*' is not in this registry.
.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:grep -R 'GSD_FALLBACK_MANUAL_PLANNING_ONLY\|gsd-sdk\|which gsd\|GSD Discipline' .planning tools bin PROCESSMAP docs 2>/dev/null | head -200 || true
.planning/contours/tooling/mcp-servers-inventory-and-repair-v1/EXECUTOR_PROMPT.md:- `gsd --help` or `gsd-sdk --help`
.planning/contours/tooling/mcp-servers-inventory-and-repair-v1/MCP_HEALTH_MATRIX.md:| **GSD Runner** | `get-shit-done-cc` (expected global) | `~/.codex/get-shit-done/` (local only) | **BROKEN** | HIGH | `gsd-tools.cjs` works via `node` directly (v1.38.5), but `gsd`/`gsd-sdk` symlinks in `/usr/local/bin` and `/root/.local/bin` point to missing `get-shit-done-cc` global npm package. Global CLI is unavailable. |
.planning/contours/tooling/mcp-servers-inventory-and-repair-v1/MCP_HEALTH_MATRIX.md:  - `/usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk`
.planning/contours/tooling/mcp-servers-inventory-and-repair-v1/MCP_HEALTH_MATRIX.md:  - `/root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js` (target missing)
.planning/contours/tooling/mcp-servers-inventory-and-repair-v1/PLAN.md:- Verify: `gsd --help` or `gsd-sdk --help` returns usage.
.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/STATE.json:  "gsd_mode": "GSD_FALLBACK_MANUAL_PLANNING_ONLY",
.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/PLAN.md:## GSD Discipline
.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/PLAN.md:- `which gsd`: not found
.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/PLAN.md:- `which gsd-sdk`: not found
.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/PLAN.md:**GSD_FALLBACK_MANUAL_PLANNING_ONLY**
.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/STATE.json:  "gsd_mode": "GSD_FALLBACK_MANUAL_PLANNING_ONLY",
.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/READY_FOR_EXECUTION:GSD mode: GSD_FALLBACK_MANUAL_PLANNING_ONLY
.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md:## GSD Discipline
.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md:- `which gsd` → not found
.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md:- `which gsd-sdk` → not found
.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md:- GSD CLI (`gsd`, `gsd-sdk`) is **not available** in PATH.
.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md:- **Mode used:** `GSD_FALLBACK_MANUAL_PLANNING_ONLY`
PROCESSMAP/HANDOFF/2026-05-07 - fix admin ai modules archive and session open regressions v1.md:| `which gsd` | `gsd not found` |
PROCESSMAP/HANDOFF/2026-05-07 - fix admin ai modules archive and session open regressions v1.md:| `which gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk` |
PROCESSMAP/HANDOFF/2026-05-07 - fix admin ai modules archive and session open regressions v1.md:| `gsd-sdk --version` | `gsd-sdk v0.1.0` |
PROCESSMAP/HANDOFF/2026-05-07 - fix admin ai modules archive and session open regressions v1.md:| `gsd-sdk query route.next-action fix/admin-ai-modules-archive-and-session-open-regressions-v1` | unsupported/unknown command |
PROCESSMAP/HANDOFF/2026-05-07 - fix admin ai modules archive and session open regressions v1.md:| `gsd-sdk query check.phase-ready ...` | unsupported/unknown command |
PROCESSMAP/HANDOFF/2026-05-07 - fix product actions ai response parse error v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
PROCESSMAP/HANDOFF/2026-05-08 - fix session open routes from registry and explorer v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
PROCESSMAP/HANDOFF/2026-05-07 - feature product actions registry bulk ai suggestions v1.md:| `gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
PROCESSMAP/HANDOFF/2026-05-07 - feature product actions registry bulk ai suggestions v1.md:| `gsd-sdk query route.next-action ...` | unsupported / unknown command |
PROCESSMAP/HANDOFF/2026-05-07 - feature product actions registry bulk ai suggestions v1.md:| `gsd-sdk query check.phase-ready ...` | unsupported / unknown command |
PROCESSMAP/HANDOFF/2026-05-07 - fix product actions ai suggest session review v1.md:| `gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
PROCESSMAP/HANDOFF/2026-05-07 - fix product actions ai suggest session review v1.md:| `gsd-sdk query route.next-action ...` | unsupported / unknown command |
PROCESSMAP/HANDOFF/2026-05-07 - fix product actions ai suggest session review v1.md:| `gsd-sdk query check.phase-ready ...` | unsupported / unknown command |
PROCESSMAP/HANDOFF/2026-05-07 - fix product actions ai and export pr312 stabilization v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
PROCESSMAP/HANDOFF/2026-05-07 - feature admin ai provider settings and product actions prompt v1.md:| `which gsd` | `gsd not found` |
PROCESSMAP/HANDOFF/2026-05-07 - feature admin ai provider settings and product actions prompt v1.md:| `which gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk` |
PROCESSMAP/HANDOFF/2026-05-07 - feature admin ai provider settings and product actions prompt v1.md:| `gsd-sdk --version` | `gsd-sdk v0.1.0` |
PROCESSMAP/HANDOFF/2026-05-07 - feature admin ai provider settings and product actions prompt v1.md:| `gsd-sdk query route.next-action feature/admin-ai-provider-settings-and-product-actions-prompt-v1` | unsupported/unknown command |
PROCESSMAP/HANDOFF/2026-05-07 - feature admin ai provider settings and product actions prompt v1.md:| `gsd-sdk query check.phase-ready ...` | unsupported/unknown command |
PROCESSMAP/HANDOFF/2026-05-07 - feature product actions export csv xlsx v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
docs/gsd/discussions-create-flow-entity-form-v1.md:- Formal GSD SDK phase artifacts are unavailable: `.planning/ROADMAP.md` is absent and `gsd-sdk query init.phase-op`, `init.plan-phase`, and `init.execute-phase` all returned `phase_found=false`, `planning_exists=false`.
docs/gsd/discussions-personal-notification-semantics-and-session-badge-v1.md:- Formal GSD SDK phase artifacts are unavailable: `.planning/ROADMAP.md` is absent and `gsd-sdk query init.phase-op`, `init.plan-phase`, and `init.execute-phase` all returned `phase_found=false`, `planning_exists=false`.
docs/specs/product-actions-registry-and-export-mvp-spec-v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0`; route query unsupported |

```

## Agent scripts listing and safe snippets

```bash
ls -la tools/pm-agent*.sh 2>/dev/null || true; sed -n '1,220p' tools/pm-agent1-planner.sh 2>/dev/null || true; sed -n '1,220p' tools/pm-agent-status.sh 2>/dev/null || true
```

```text
-rwxr-xr-x 1 root root 1322 May 14 13:01 tools/pm-agent-reset-stale.sh
-rwxr-xr-x 1 root root 1529 May 14 12:01 tools/pm-agent-status.sh
-rwxr-xr-x 1 root root 1946 May 14 12:01 tools/pm-agent1-planner.sh
-rwxr-xr-x 1 root root 2283 May 14 12:01 tools/pm-agent2-executor-watch.sh
-rwxr-xr-x 1 root root 2414 May 14 12:01 tools/pm-agent3-reviewer-watch.sh
-rwxr-xr-x 1 root root 2302 May 14 13:12 tools/pm-agents-server-tmux.sh
#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/processmap-test"
CID="${1:?Usage: pm-agent1-planner.sh <contour-id>}"

DIR="$ROOT/.planning/contours/$CID"
PROMPT="$ROOT/.agents/agent1-planner/prompts/${CID//\//__}-planner-start.md"

mkdir -p "$DIR"
mkdir -p "$(dirname "$PROMPT")"

cat > "$PROMPT" <<PROMPT_EOF
Ты Agent 1 / Planner для ProcessMap.

Рабочая директория:
cd /opt/processmap-test

Contour id:
$CID

Роль:
Подготовить GSD-план и handoff для Agent 2.

Обязательная модель:
1. GSD всегда:
   source/runtime truth → source map → bounded plan → executor handoff.
2. Использовать Project Atlas как knowledge source:
   /srv/obsidian/project-atlas/ProcessMap
3. Если RAG server ещё не поднят — использовать filesystem search по Project Atlas.
4. Не писать product code как Planner.
5. Не делать merge/deploy/PR.
6. Не печатать secrets.
7. Создать contour artifacts.

Создать в:
.planning/contours/$CID/

Минимум:
- PLAN.md
- EXECUTOR_PROMPT.md
- REVIEWER_PROMPT.md
- STATE.json
- READY_FOR_EXECUTION

Если UI/runtime задача:
- RUNTIME_NAVIGATION.md
- RUNTIME_PROOF_CHECKLIST.md

STATE.json:
{
  "contour_id": "$CID",
  "phase": "ready_for_execution",
  "planner_status": "complete",
  "executor_status": "pending",
  "reviewer_status": "pending"
}

Финальный ответ:
1. Verdict
2. GSD status
3. Source/runtime truth
4. Files created
5. READY_FOR_EXECUTION status
6. Exact marker Agent 2 waits for
PROMPT_EOF

cd "$ROOT"

clear || true
echo "=== Agent 1 / Planner ==="
echo "Contour: $CID"
echo "Prompt file: $PROMPT"
echo
echo "Kimi будет запущен интерактивно."
echo "Внутри Kimi вставь короткую команду:"
echo
echo "Прочитай и выполни prompt file:"
echo "$PROMPT"
echo

kimi
#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/processmap-test"
CID="${1:-}"

cd "$ROOT"

echo "=== PROCESSMAP TEST RUNTIME ==="
hostname
whoami
date
echo

echo "=== GIT ==="
git branch --show-current 2>/dev/null || true
git rev-parse --short HEAD 2>/dev/null || true
git status -sb 2>/dev/null || true
echo

echo "=== DOCKER ==="
docker compose -p processmap_test ps 2>/dev/null || true
echo

if [ -n "$CID" ]; then
  DIR="$ROOT/.planning/contours/$CID"

  echo "=== CONTOUR ==="
  echo "$CID"
  echo "$DIR"
  echo

  if [ ! -d "$DIR" ]; then
    echo "Contour dir missing"
    exit 0
  fi

  for f in \
    PLAN.md \
    EXECUTOR_PROMPT.md \
    REVIEWER_PROMPT.md \
    RUNTIME_PROOF_CHECKLIST.md \
    STATE.json \
    READY_FOR_EXECUTION \
    EXECUTION_STARTED \
    EXEC_REPORT.md \
    READY_FOR_REVIEW \
    REVIEW_STARTED \
    REVIEW_REPORT.md \
    REVIEW_PASS \
    CHANGES_REQUESTED \
    REWORK_REQUEST.md \
    EXEC_BLOCKED.md \
    REVIEW_BLOCKED.md
  do
    if [ -e "$DIR/$f" ]; then
      printf "✅ %s\n" "$f"
    else
      printf "·  %s\n" "$f"
    fi
  done

  echo
  echo "=== RECENT CONTOUR FILES ==="
  find "$DIR" -maxdepth 1 -type f -printf "%TY-%Tm-%Td %TH:%TM %f\n" 2>/dev/null | sort | tail -30
else
  echo "=== ACTIVE CONTOUR MARKERS ==="
  find "$ROOT/.planning/contours" -maxdepth 4 -type f \
    \( -name READY_FOR_EXECUTION -o -name READY_FOR_REVIEW -o -name REVIEW_PASS -o -name CHANGES_REQUESTED -o -name EXEC_BLOCKED.md -o -name REVIEW_BLOCKED.md \) \
    -print 2>/dev/null | sort
fi

```

## Cross-user homes and GSD paths

```bash
ls -la /home 2>/dev/null || true; getent passwd | cut -d: -f1,6 | grep -E '/home|/root' || true; for d in /home/* /root; do [ -d "$d" ] || continue; echo == $d ==; find "$d" -maxdepth 5 \( -iname '*gsd*' -o -iname '*get-shit*' -o -iname '*shit-done*' \) -not -path '*/node_modules/*' 2>/dev/null | head -50; done
```

```text
total 8
drwxr-xr-x  2 root root 4096 Jun 26  2024 .
drwxr-xr-x 23 root root 4096 Jun 16  2025 ..
root:/root
== /root ==
/root/processmap-agent/imports/bpmn123-local-stack-20260502-113641/docs/gsd
/root/processmap_admin_access_navigation_and_users_table_v1/docs/gsd
/root/.local/bin/get-shit-done-cc
/root/.local/bin/gsd-sdk
/root/.gsd
/root/.codex/skills/gsd-new-project
/root/.codex/skills/gsd-workstreams
/root/.codex/skills/gsd-sketch
/root/.codex/skills/gsd-ui-review
/root/.codex/skills/gsd-health
/root/.codex/skills/gsd-analyze-dependencies
/root/.codex/skills/gsd-list-workspaces
/root/.codex/skills/gsd-eval-review
/root/.codex/skills/gsd-reapply-patches
/root/.codex/skills/gsd-settings-advanced
/root/.codex/skills/gsd-pause-work
/root/.codex/skills/gsd-code-review
/root/.codex/skills/gsd-sync-skills
/root/.codex/skills/gsd-explore
/root/.codex/skills/gsd-validate-phase
/root/.codex/skills/gsd-extract_learnings
/root/.codex/skills/gsd-debug
/root/.codex/skills/gsd-secure-phase
/root/.codex/skills/gsd-plan-phase
/root/.codex/skills/gsd-settings-integrations
/root/.codex/skills/gsd-ingest-docs
/root/.codex/skills/gsd-import
/root/.codex/skills/gsd-inbox
/root/.codex/skills/gsd-spec-phase
/root/.codex/skills/gsd-list-phase-assumptions
/root/.codex/skills/gsd-note
/root/.codex/skills/gsd-sketch-wrap-up
/root/.codex/skills/gsd-scan
/root/.codex/skills/gsd-new-workspace
/root/.codex/skills/gsd-autonomous
/root/.codex/skills/gsd-discuss-phase
/root/.codex/skills/gsd-settings
/root/.codex/skills/gsd-insert-phase
/root/.codex/skills/gsd-do
/root/.codex/skills/gsd-undo
/root/.codex/skills/gsd-new-milestone
/root/.codex/skills/gsd-milestone-summary
/root/.codex/skills/gsd-remove-phase
/root/.codex/skills/gsd-set-profile
/root/.codex/skills/gsd-from-gsd2
/root/.codex/skills/gsd-intel
/root/.codex/skills/gsd-progress
/root/.codex/skills/gsd-code-review-fix
/root/.codex/skills/gsd-audit-milestone
/root/.codex/skills/gsd-research-phase

```

## Historical evidence grep

```bash
grep -R 'GSD Runner\|gsd-tools.cjs\|get-shit-done-cc\|gsd-sdk\|GSD_FALLBACK' /srv/obsidian/project-atlas/ProcessMap /opt/processmap-test/.planning/contours /opt/processmap-test/docs /opt/processmap-test/PROCESSMAP 2>/dev/null | head -300 || true
```

```text
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/AUDITS/2026-04-30 - audit-fix sequence path classification object object v1.md:- `gsd-sdk`: `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, version `0.1.0`.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/AUDITS/2026-04-30 - audit-fix sequence path classification object object v1.md:- `gsd-sdk query init.phase-op audit-fix/sequence-path-classification-and-object-object-v1`: `.planning` not present in fresh worktree; agents not installed. Continue by GSD discipline manually.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-04-26 - uiux profile notification menu overflow polish v1.md:- Exact GSD phases/functions: `gsd-discuss-phase` discipline from frozen Obsidian/user contour; `gsd-plan-phase` discipline after exact source map and frozen boundary; bounded inline `gsd-execute-phase` equivalent after freeze; `gsd-sdk query init.phase-op uiux/profile-notification-menu-overflow-polish-v1` used for availability probe.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - delivery explorer session open affordance pr and stage proof v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - delivery explorer session open affordance pr and stage proof v1.md:| fallback | `GSD_FALLBACK_MANUAL_DELIVERY_PROOF` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - uiux remove top header ai button and contextualize ai actions v1.md:| `gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0 |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix session open default diagram tab v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix session open default diagram tab v1.md:| route | `GSD_FALLBACK_MANUAL_BUGFIX_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - feature interview analysis namespace guard v1.md:| `gsd-sdk` | available |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - feature interview analysis namespace guard v1.md:| Route | `GSD_FALLBACK_MANUAL_IMPLEMENTATION_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - uiux product actions registry navigation and page shell v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - uiux product actions registry navigation and page shell v1.md:| Route | `GSD_FALLBACK_MANUAL_UIUX_IMPLEMENTATION_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-04-26 - uiux profile notification menu clamp and theme toggle v1.md:- `gsd-sdk query init.phase-op uiux/profile-notification-menu-clamp-and-theme-toggle-v1` and `init.execute-phase` reported no `.planning`, no roadmap, no installed agents, so no formal GSD artifact files were generated.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix-ui analysis product actions crash all actions editor scroll and changelog v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix-ui analysis product actions crash all actions editor scroll and changelog v1.md:| planning state | `.planning` отсутствует, `gsd-sdk query` unsupported |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix-ui analysis product actions crash all actions editor scroll and changelog v1.md:| fallback | `GSD_FALLBACK_MANUAL_IMPLEMENTATION_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - product actions registry workspace scope and navigation v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - product actions registry workspace scope and navigation v1.md:| Route | `GSD_FALLBACK_MANUAL_PRODUCT_ARCHITECTURE_DECISION` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-09 - uiux analysis step table compact row polish v1.md:**GSD:** GSD_SKILL_INVOCATION_BLOCKED_FOR_ALL → GSD_FALLBACK_MANUAL_UIUX_BOUNDED
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - audit ai layer source map and admin module readiness v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - audit ai layer source map and admin module readiness v1.md:| Route | `GSD_FALLBACK_MANUAL_AI_AUDIT_ONLY` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - uiux admin ai modules and prompts surface v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - uiux admin ai modules and prompts surface v1.md:| Route | `GSD_FALLBACK_MANUAL_UI_IMPLEMENTATION_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-04-26 - uiux session discussions badge column semantics v1.md:- Exact GSD phases/functions: `gsd-discuss-phase` discipline from frozen Obsidian/user contour; `gsd-plan-phase` discipline after exact source map and frozen boundary; bounded inline `gsd-execute-phase` equivalent after freeze; `gsd-sdk query init.phase-op uiux/session-discussions-badge-column-semantics-v1` used for availability probe.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend ai module registry readonly config v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend ai module registry readonly config v1.md:| Route | `GSD_FALLBACK_MANUAL_BACKEND_IMPLEMENTATION_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend ai execution log and rate limit foundation v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend ai execution log and rate limit foundation v1.md:| Route | `GSD_FALLBACK_MANUAL_BACKEND_IMPLEMENTATION_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-11 - tooling gsd codex skill install v1.md:- Official package metadata checked with `npm view get-shit-done-cc@latest version repository dist.tarball`.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-11 - tooling gsd codex skill install v1.md:- Latest package at install time: `get-shit-done-cc@1.41.1`.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-11 - tooling gsd codex skill install v1.md:- Install command: `npx -y get-shit-done-cc@latest --codex --global`.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-11 - tooling gsd codex skill install v1.md:- Installed/updated SDK: `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `gsd-sdk v1.41.1`.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - product ai module architecture and admin prompt registry v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - product ai module architecture and admin prompt registry v1.md:| Route | `GSD_FALLBACK_MANUAL_AI_ARCHITECTURE_DECISION` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step table row and step product panel polish v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step table row and step product panel polish v1.md:| fallback | `GSD_FALLBACK_MANUAL_UIUX_CORRECTION` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend ai prompt registry schema v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend ai prompt registry schema v1.md:| Route | `GSD_FALLBACK_MANUAL_BACKEND_IMPLEMENTATION_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend product actions registry readonly aggregation v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend product actions registry readonly aggregation v1.md:| Route | `GSD_FALLBACK_MANUAL_BACKEND_IMPLEMENTATION_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis product actions capture surface light theme and sticky panel v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis product actions capture surface light theme and sticky panel v1.md:| fallback | `GSD_FALLBACK_MANUAL_UIUX_CORRECTION` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - feature product actions registry and export mvp spec v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0`; route query unsupported |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - feature product actions registry and export mvp spec v1.md:| Route | `GSD_FALLBACK_MANUAL_SPEC_AND_SOURCE_MAP` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix analysis selected step sync for product panel v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix analysis selected step sync for product panel v1.md:| fallback | `GSD_FALLBACK_MANUAL_BUGFIX_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-09 - uiux analysis step table compact metadata rescue and primary meta fix v1.md:**GSD:** GSD_SKILL_INVOCATION_BLOCKED → GSD_FALLBACK_MANUAL_UIUX_BOUNDED
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-09 - uiux analysis step table details and timing nonexpanding v1.md:**GSD:** GSD_SKILL_INVOCATION_BLOCKED_FOR_ALL → GSD_FALLBACK_MANUAL_UIUX_BOUNDED
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - audit processmap director presentation source pack v1.md:- `gsd-sdk`: доступен (`/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`).
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - audit processmap director presentation source pack v1.md:- `gsd-sdk query init.phase-op audit/interview-system-chaos-map-and-product-actions-export-readiness-v1`: `phase_found=false`, `planning_exists=false`, `roadmap_exists=false`, `agents_installed=false`.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - audit processmap director presentation source pack v1.md:- Route: `GSD_FALLBACK_MANUAL_AUDIT_ONLY`.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - audit analysis surface navigation and product actions ux map v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - audit analysis surface navigation and product actions ux map v1.md:| route | `GSD_FALLBACK_MANUAL_AUDIT_ONLY` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-13 - analysis process steps strict table planner.md:- Created `PLAN.md`, `EXECUTOR_PROMPT.md`, `REVIEWER_PROMPT.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`, `GSD_FALLBACK_MANUAL_PLANNING`, `READY_FOR_EXECUTION`.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-13 - analysis process steps strict table planner.md:- GSD status: `GSD_FALLBACK_MANUAL_PLANNING` because `gsd` CLI was not found, but local skill discipline was used.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-09 - uiux analysis step table browser proof v1.md:**GSD:** GSD_SKILL_INVOCATION_BLOCKED → GSD_FALLBACK_MANUAL_UI_REVIEW
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - delivery product action properties pr and stage proof v1.md:| `gsd-sdk` | available |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - delivery product action properties pr and stage proof v1.md:| Route | `GSD_FALLBACK_MANUAL_DELIVERY_PROOF` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - feature product actions registry surface v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0`; route query unsupported |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - feature product actions registry surface v1.md:| Fallback | `GSD_FALLBACK_MANUAL_IMPLEMENTATION_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - feature interview analysis patch helper v1.md:| GSD route | `GSD_FALLBACK_MANUAL_IMPLEMENTATION_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-08 - tooling processmap agent operating contract v2.md:- Fallback: `GSD_FALLBACK_MANUAL_DOCS_BOUNDED`.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - uiux product actions registry workspace sessions and drilldown v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0 |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend migrate ai questions to ai runtime v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend migrate ai questions to ai runtime v1.md:| Route | `GSD_FALLBACK_MANUAL_BACKEND_IMPLEMENTATION_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - fix product actions registry workspace session summary consistency v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0 |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-12 - product actions ai rag agent batch ux stabilization planner v1.md:GSD CLI was unavailable, so the plan records `GSD_FALLBACK_MANUAL_PLANNING` while following local GSD discipline.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend migrate path reports to ai runtime v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-04-26 - feature discussions notification inbox and history v1 conflict resolution.md:- Used GSD workflow discipline and attempted `gsd-sdk query init.phase-op feature/discussions-notification-inbox-and-history-v1-conflict-resolution`.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step table discussion style redesign v2 correction.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step table discussion style redesign v2 correction.md:| fallback | `GSD_FALLBACK_MANUAL_UIUX_CORRECTION` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux product actions panel list and editor v1.md:| route | `GSD_FALLBACK_MANUAL_UIUX_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-04-26 - feature discussions notification inbox and history v1.md:- `gsd-sdk query init.phase-op feature/discussions-notification-inbox-and-history-v1` was run in the clean worktree and reported `planning_exists: false`, `roadmap_exists: false`, `phase_found: false`; normal GSD phase artifacts could not be generated without bootstrapping `.planning`.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - feature bpmn product action properties v1.md:| GSD route | `GSD_FALLBACK_MANUAL_IMPLEMENTATION_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step row density and focus v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step row density and focus v1.md:| fallback | `GSD_FALLBACK_MANUAL_UIUX_CORRECTION` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - runtime product action properties stage save reload proof v1.md:| GSD route | `GSD_FALLBACK_MANUAL_RUNTIME_PROOF` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step table and product actions discussion style redesign v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step table and product actions discussion style redesign v1.md:| fallback | `GSD_FALLBACK_MANUAL_UIUX_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-04-26 - uiux discussions notification surface clarity and consolidation v1.md:- GSD availability probe: `gsd-sdk query init.phase-op uiux/discussions-notification-surface-clarity-and-consolidation-v1` returned no `.planning`, no roadmap, no installed GSD agents; GSD skills were read and the phase gates are being followed manually.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix explorer session open double click v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix explorer session open double click v1.md:| route | `GSD_FALLBACK_MANUAL_BUGFIX_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/14_Canvas_first_UI_composition.md:## GSD_FALLBACK_MANUAL
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/14_Canvas_first_UI_composition.md:| Command availability | `gsd` недоступен; `gsd-sdk v0.1.0` доступен |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/14_Canvas_first_UI_composition.md:| Почему fallback | `gsd-sdk` CLI содержит только `run/auto/init/query`; безопасных точечных `discuss/plan/execute` команд нет, а `run/auto` шире bounded-контура |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/14_Canvas_first_UI_composition.md:| Fallback | `GSD_FALLBACK_MANUAL` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/15_Branching_scene_visual_feedback.md:## GSD_FALLBACK_MANUAL
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/15_Branching_scene_visual_feedback.md:| Command availability | `gsd` недоступен; `gsd-sdk v0.1.0` доступен |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/15_Branching_scene_visual_feedback.md:| Почему fallback | `gsd-sdk` CLI содержит `run/auto/init/query`, но не безопасные точечные `discuss/plan/execute`; широкие команды не подходят bounded local-only contour |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/15_Branching_scene_visual_feedback.md:| Fallback | `GSD_FALLBACK_MANUAL` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD route | `GSD_FALLBACK_MANUAL_BUGFIX_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD route | `GSD_FALLBACK_MANUAL_BUGFIX_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0; route/check queries unsupported |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0; route/check queries unsupported |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0`; route/phase-ready queries unsupported |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0`; route/phase-ready queries unsupported |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:- GSD CLI unavailable; `gsd-sdk v0.1.0`; route/phase-ready queries unsupported.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0`; route/phase-ready queries unsupported |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0; route/phase-ready queries unsupported |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0; route/phase-ready queries unsupported |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD CLI | `gsd` unavailable → fallback marker `GSD_FALLBACK_MANUAL_RUNTIME_BOUNDED` |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD status | `GSD_FALLBACK_MANUAL_RUNTIME_FORENSIC` (no `.planning/` phase files) |
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-10 - plan product actions ai suggest reliability ui and batch v1.md:- Fallback marker: `GSD_FALLBACK_MANUAL_PLANNING_BOUNDED`.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-10 - audit processmap rag current state and next contours v1.md:- Fallback marker: GSD_FALLBACK_MANUAL_BOUNDED.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-10 - audit processmap rag current state and next contours v1.md:GSD: slash commands unavailable in this API surface; MCP runner unavailable; consulted local gsd-forensics and gsd-plan-phase contracts; gsd-session-report not installed; fallback recorded as GSD_FALLBACK_MANUAL_BOUNDED.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-09 - feat rag search api v1.md:GSD_FALLBACK_MANUAL_BOUNDED
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-10 - uiux rag search result humanization v1.md:- GSD: `GSD_FALLBACK_MANUAL_BOUNDED`
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-09 - feat rag db schema and index pipeline v1.md:GSD_FALLBACK_MANUAL_BOUNDED (GSD skills located at `~/.claude/skills/gsd-*/` but not invoked)
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-11 - plan product actions ai suggest runtime state and error handling v1.md:- `gsd-sdk v1.41.1` available.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-11 - tooling processmap multi agent gsd file queue v1.md:Discovery found local GSD skill files under `~/.claude/skills/gsd-*`, workflow files under `~/.claude/get-shit-done/workflows`, repo-local `.codex/get-shit-done`, and `gsd-sdk v1.41.1`. The contour used local skill/workflow text for forensics, plan, execution, review, and session-report discipline.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-11 - tooling processmap stage runtime navigation pack v1.md:Used local GSD skill/workflow text for forensics/discovery, plan, execution, code review, and session report discipline. Found `~/.claude/skills/gsd-*`, `~/.claude/get-shit-done/workflows`, repo-local `.codex/get-shit-done`, and `gsd-sdk v1.41.1`.
/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-10 - feat admin rag server settings v1.md:- GSD: `GSD_FALLBACK_MANUAL_BOUNDED`
/srv/obsidian/project-atlas/ProcessMap/Architecture/Processmap flow.md:        `gsd-sdk v1.41.1`.\n\n## What remains\n\nPopulate 
/srv/obsidian/project-atlas/ProcessMap/Architecture/Processmap flow.md:  - repo-local .codex/get-shit-done/bin/gsd-tools.cjs 
/srv/obsidian/project-atlas/ProcessMap/Architecture/Processmap flow.md:  - gsd-sdk v1.41.1 
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:bash -lc 'echo LOGIN_BASH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true'
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:bash -ic 'echo INTERACTIVE_BASH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true' || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:command -v zsh >/dev/null && zsh -lc 'echo LOGIN_ZSH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true' || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:command -v zsh >/dev/null && zsh -ic 'echo INTERACTIVE_ZSH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true' || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:command -v gsd || true; command -v gsd-sdk || true; which gsd || true; which gsd-sdk || true; type -a gsd || true; type -a gsd-sdk || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:bash: line 1: type: gsd-sdk: not found
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx  1 root root       33 Apr 26 20:58 get-shit-done-cc -> /root/.local/bin/get-shit-done-cc
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx  1 root root       24 Apr 26 20:58 gsd-sdk -> /root/.local/bin/gsd-sdk
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root       51 Apr 26 20:57 get-shit-done-cc -> ../lib/node_modules/get-shit-done-cc/bin/install.js
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root       51 Apr 26 20:57 gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 33 Apr 26 20:58 /usr/local/bin/get-shit-done-cc -> /root/.local/bin/get-shit-done-cc
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 24 Apr 26 20:58 /usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/get-shit-done-cc -> ../lib/node_modules/get-shit-done-cc/bin/install.js
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 33 Apr 26 20:58 /usr/local/bin/get-shit-done-cc -> /root/.local/bin/get-shit-done-cc
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 24 Apr 26 20:58 /usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/get-shit-done-cc -> ../lib/node_modules/get-shit-done-cc/bin/install.js
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:timeout 10 npx --no-install gsd --version || true; timeout 10 npx --no-install gsd-sdk --version || true; timeout 10 npx --no-install get-shit-done-cc --version || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:npm ERR! 404 Not Found - GET https://registry.npmjs.org/gsd-sdk - Not found
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:npm ERR! 404  'gsd-sdk@*' is not in this registry.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:find /opt/processmap-test -maxdepth 8 -iname 'gsd-tools.cjs' 2>/dev/null || true; find /opt/processmap-test -maxdepth 8 -iname '*gsd*.cjs' 2>/dev/null || true; find /opt/processmap-test -maxdepth 8 -iname '*gsd*.js' 2>/dev/null || true; find /opt/processmap-test -maxdepth 8 -iname '*gsd*.md' 2>/dev/null || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:for p in $(find /opt/processmap-test -maxdepth 8 -iname 'gsd-tools.cjs' 2>/dev/null); do echo == $p ==; node "$p" --help || true; node "$p" --version || true; done
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:grep -R 'GSD_FALLBACK_MANUAL_PLANNING_ONLY\|gsd-sdk\|which gsd\|GSD Discipline' .planning tools bin PROCESSMAP docs 2>/dev/null | head -200 || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:bash -lc 'echo LOGIN_BASH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true'
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:bash -ic 'echo INTERACTIVE_BASH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true' || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:command -v zsh >/dev/null && zsh -lc 'echo LOGIN_ZSH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true' || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:command -v zsh >/dev/null && zsh -ic 'echo INTERACTIVE_ZSH_PATH=$PATH; command -v gsd || true; command -v gsd-sdk || true' || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:command -v gsd || true; command -v gsd-sdk || true; which gsd || true; which gsd-sdk || true; type -a gsd || true; type -a gsd-sdk || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:bash: line 1: type: gsd-sdk: not found
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx  1 root root       24 Apr 26 20:58 gsd-sdk -> /root/.local/bin/gsd-sdk
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root       51 Apr 26 20:57 gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 24 Apr 26 20:58 /usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 24 Apr 26 20:58 /usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:timeout 10 npx --no-install gsd --version || true; timeout 10 npx --no-install gsd-sdk --version || true; timeout 10 npx --no-install get-shit-done-cc --version || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:npm ERR! 404 Not Found - GET https://registry.npmjs.org/gsd-sdk - Not found
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:npm ERR! 404  'gsd-sdk@*' is not in this registry.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:grep -R 'GSD_FALLBACK_MANUAL_PLANNING_ONLY\|gsd-sdk\|which gsd\|GSD Discipline' .planning tools bin PROCESSMAP docs 2>/dev/null | head -200 || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/mcp-servers-inventory-and-repair-v1/EXECUTOR_PROMPT.md:- `gsd --help` or `gsd-sdk --help`
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/mcp-servers-inventory-and-repair-v1/MCP_HEALTH_MATRIX.md:| **GSD Runner** | `get-shit-done-cc` (expected global) | `~/.codex/get-shit-done/` (local only) | **BROKEN** | HIGH | `gsd-tools.cjs` works via `node` directly (v1.38.5), but `gsd`/`gsd-sdk` symlinks in `/usr/local/bin` and `/root/.local/bin` point to missing `get-shit-done-cc` global npm package. Global CLI is unavailable. |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/mcp-servers-inventory-and-repair-v1/MCP_HEALTH_MATRIX.md:  - `/usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk`
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/mcp-servers-inventory-and-repair-v1/MCP_HEALTH_MATRIX.md:  - `/root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js` (target missing)
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/tooling/mcp-servers-inventory-and-repair-v1/PLAN.md:- Verify: `gsd --help` or `gsd-sdk --help` returns usage.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/STATE.json:  "gsd_mode": "GSD_FALLBACK_MANUAL_PLANNING_ONLY",
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/PLAN.md:- `which gsd-sdk`: not found
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/PLAN.md:**GSD_FALLBACK_MANUAL_PLANNING_ONLY**
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/STATE.json:  "gsd_mode": "GSD_FALLBACK_MANUAL_PLANNING_ONLY",
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/READY_FOR_EXECUTION:GSD mode: GSD_FALLBACK_MANUAL_PLANNING_ONLY
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md:- `which gsd-sdk` → not found
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md:- GSD CLI (`gsd`, `gsd-sdk`) is **not available** in PATH.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md:- **Mode used:** `GSD_FALLBACK_MANUAL_PLANNING_ONLY`
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - fix admin ai modules archive and session open regressions v1.md:| `which gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - fix admin ai modules archive and session open regressions v1.md:| `gsd-sdk --version` | `gsd-sdk v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - fix admin ai modules archive and session open regressions v1.md:| `gsd-sdk query route.next-action fix/admin-ai-modules-archive-and-session-open-regressions-v1` | unsupported/unknown command |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - fix admin ai modules archive and session open regressions v1.md:| `gsd-sdk query check.phase-ready ...` | unsupported/unknown command |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - fix product actions ai response parse error v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-08 - fix session open routes from registry and explorer v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - feature product actions registry bulk ai suggestions v1.md:| `gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - feature product actions registry bulk ai suggestions v1.md:| `gsd-sdk query route.next-action ...` | unsupported / unknown command |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - feature product actions registry bulk ai suggestions v1.md:| `gsd-sdk query check.phase-ready ...` | unsupported / unknown command |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - fix product actions ai suggest session review v1.md:| `gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - fix product actions ai suggest session review v1.md:| `gsd-sdk query route.next-action ...` | unsupported / unknown command |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - fix product actions ai suggest session review v1.md:| `gsd-sdk query check.phase-ready ...` | unsupported / unknown command |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - fix product actions ai and export pr312 stabilization v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - feature admin ai provider settings and product actions prompt v1.md:| `which gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - feature admin ai provider settings and product actions prompt v1.md:| `gsd-sdk --version` | `gsd-sdk v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - feature admin ai provider settings and product actions prompt v1.md:| `gsd-sdk query route.next-action feature/admin-ai-provider-settings-and-product-actions-prompt-v1` | unsupported/unknown command |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - feature admin ai provider settings and product actions prompt v1.md:| `gsd-sdk query check.phase-ready ...` | unsupported/unknown command |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:PROCESSMAP/HANDOFF/2026-05-07 - feature product actions export csv xlsx v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:docs/gsd/discussions-create-flow-entity-form-v1.md:- Formal GSD SDK phase artifacts are unavailable: `.planning/ROADMAP.md` is absent and `gsd-sdk query init.phase-op`, `init.plan-phase`, and `init.execute-phase` all returned `phase_found=false`, `planning_exists=false`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:docs/gsd/discussions-personal-notification-semantics-and-session-badge-v1.md:- Formal GSD SDK phase artifacts are unavailable: `.planning/ROADMAP.md` is absent and `gsd-sdk query init.phase-op`, `init.plan-phase`, and `init.execute-phase` all returned `phase_found=false`, `planning_exists=false`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:docs/specs/product-actions-registry-and-export-mvp-spec-v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0`; route query unsupported |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/root/.local/bin/get-shit-done-cc
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/root/.local/bin/gsd-sdk
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:grep -R 'GSD Runner\|gsd-tools.cjs\|get-shit-done-cc\|gsd-sdk\|GSD_FALLBACK' /srv/obsidian/project-atlas/ProcessMap /opt/processmap-test/.planning/contours /opt/processmap-test/docs /opt/processmap-test/PROCESSMAP 2>/dev/null | head -300 || true
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/AUDITS/2026-04-30 - audit-fix sequence path classification object object v1.md:- `gsd-sdk`: `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, version `0.1.0`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/AUDITS/2026-04-30 - audit-fix sequence path classification object object v1.md:- `gsd-sdk query init.phase-op audit-fix/sequence-path-classification-and-object-object-v1`: `.planning` not present in fresh worktree; agents not installed. Continue by GSD discipline manually.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-04-26 - uiux profile notification menu overflow polish v1.md:- Exact GSD phases/functions: `gsd-discuss-phase` discipline from frozen Obsidian/user contour; `gsd-plan-phase` discipline after exact source map and frozen boundary; bounded inline `gsd-execute-phase` equivalent after freeze; `gsd-sdk query init.phase-op uiux/profile-notification-menu-overflow-polish-v1` used for availability probe.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - delivery explorer session open affordance pr and stage proof v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - delivery explorer session open affordance pr and stage proof v1.md:| fallback | `GSD_FALLBACK_MANUAL_DELIVERY_PROOF` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - uiux remove top header ai button and contextualize ai actions v1.md:| `gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0 |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix session open default diagram tab v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix session open default diagram tab v1.md:| route | `GSD_FALLBACK_MANUAL_BUGFIX_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - feature interview analysis namespace guard v1.md:| `gsd-sdk` | available |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - feature interview analysis namespace guard v1.md:| Route | `GSD_FALLBACK_MANUAL_IMPLEMENTATION_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - uiux product actions registry navigation and page shell v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - uiux product actions registry navigation and page shell v1.md:| Route | `GSD_FALLBACK_MANUAL_UIUX_IMPLEMENTATION_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-04-26 - uiux profile notification menu clamp and theme toggle v1.md:- `gsd-sdk query init.phase-op uiux/profile-notification-menu-clamp-and-theme-toggle-v1` and `init.execute-phase` reported no `.planning`, no roadmap, no installed agents, so no formal GSD artifact files were generated.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix-ui analysis product actions crash all actions editor scroll and changelog v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix-ui analysis product actions crash all actions editor scroll and changelog v1.md:| planning state | `.planning` отсутствует, `gsd-sdk query` unsupported |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix-ui analysis product actions crash all actions editor scroll and changelog v1.md:| fallback | `GSD_FALLBACK_MANUAL_IMPLEMENTATION_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - product actions registry workspace scope and navigation v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - product actions registry workspace scope and navigation v1.md:| Route | `GSD_FALLBACK_MANUAL_PRODUCT_ARCHITECTURE_DECISION` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-09 - uiux analysis step table compact row polish v1.md:**GSD:** GSD_SKILL_INVOCATION_BLOCKED_FOR_ALL → GSD_FALLBACK_MANUAL_UIUX_BOUNDED
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - audit ai layer source map and admin module readiness v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - audit ai layer source map and admin module readiness v1.md:| Route | `GSD_FALLBACK_MANUAL_AI_AUDIT_ONLY` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - uiux admin ai modules and prompts surface v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - uiux admin ai modules and prompts surface v1.md:| Route | `GSD_FALLBACK_MANUAL_UI_IMPLEMENTATION_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-04-26 - uiux session discussions badge column semantics v1.md:- Exact GSD phases/functions: `gsd-discuss-phase` discipline from frozen Obsidian/user contour; `gsd-plan-phase` discipline after exact source map and frozen boundary; bounded inline `gsd-execute-phase` equivalent after freeze; `gsd-sdk query init.phase-op uiux/session-discussions-badge-column-semantics-v1` used for availability probe.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend ai module registry readonly config v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend ai module registry readonly config v1.md:| Route | `GSD_FALLBACK_MANUAL_BACKEND_IMPLEMENTATION_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend ai execution log and rate limit foundation v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend ai execution log and rate limit foundation v1.md:| Route | `GSD_FALLBACK_MANUAL_BACKEND_IMPLEMENTATION_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-11 - tooling gsd codex skill install v1.md:- Official package metadata checked with `npm view get-shit-done-cc@latest version repository dist.tarball`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-11 - tooling gsd codex skill install v1.md:- Latest package at install time: `get-shit-done-cc@1.41.1`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-11 - tooling gsd codex skill install v1.md:- Install command: `npx -y get-shit-done-cc@latest --codex --global`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-11 - tooling gsd codex skill install v1.md:- Installed/updated SDK: `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `gsd-sdk v1.41.1`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - product ai module architecture and admin prompt registry v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - product ai module architecture and admin prompt registry v1.md:| Route | `GSD_FALLBACK_MANUAL_AI_ARCHITECTURE_DECISION` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step table row and step product panel polish v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step table row and step product panel polish v1.md:| fallback | `GSD_FALLBACK_MANUAL_UIUX_CORRECTION` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend ai prompt registry schema v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend ai prompt registry schema v1.md:| Route | `GSD_FALLBACK_MANUAL_BACKEND_IMPLEMENTATION_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend product actions registry readonly aggregation v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend product actions registry readonly aggregation v1.md:| Route | `GSD_FALLBACK_MANUAL_BACKEND_IMPLEMENTATION_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis product actions capture surface light theme and sticky panel v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis product actions capture surface light theme and sticky panel v1.md:| fallback | `GSD_FALLBACK_MANUAL_UIUX_CORRECTION` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - feature product actions registry and export mvp spec v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0`; route query unsupported |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - feature product actions registry and export mvp spec v1.md:| Route | `GSD_FALLBACK_MANUAL_SPEC_AND_SOURCE_MAP` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix analysis selected step sync for product panel v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix analysis selected step sync for product panel v1.md:| fallback | `GSD_FALLBACK_MANUAL_BUGFIX_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-09 - uiux analysis step table compact metadata rescue and primary meta fix v1.md:**GSD:** GSD_SKILL_INVOCATION_BLOCKED → GSD_FALLBACK_MANUAL_UIUX_BOUNDED
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-09 - uiux analysis step table details and timing nonexpanding v1.md:**GSD:** GSD_SKILL_INVOCATION_BLOCKED_FOR_ALL → GSD_FALLBACK_MANUAL_UIUX_BOUNDED
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - audit processmap director presentation source pack v1.md:- `gsd-sdk`: доступен (`/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`).
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - audit processmap director presentation source pack v1.md:- `gsd-sdk query init.phase-op audit/interview-system-chaos-map-and-product-actions-export-readiness-v1`: `phase_found=false`, `planning_exists=false`, `roadmap_exists=false`, `agents_installed=false`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - audit processmap director presentation source pack v1.md:- Route: `GSD_FALLBACK_MANUAL_AUDIT_ONLY`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - audit analysis surface navigation and product actions ux map v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - audit analysis surface navigation and product actions ux map v1.md:| route | `GSD_FALLBACK_MANUAL_AUDIT_ONLY` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-13 - analysis process steps strict table planner.md:- Created `PLAN.md`, `EXECUTOR_PROMPT.md`, `REVIEWER_PROMPT.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`, `GSD_FALLBACK_MANUAL_PLANNING`, `READY_FOR_EXECUTION`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-13 - analysis process steps strict table planner.md:- GSD status: `GSD_FALLBACK_MANUAL_PLANNING` because `gsd` CLI was not found, but local skill discipline was used.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-09 - uiux analysis step table browser proof v1.md:**GSD:** GSD_SKILL_INVOCATION_BLOCKED → GSD_FALLBACK_MANUAL_UI_REVIEW
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - delivery product action properties pr and stage proof v1.md:| `gsd-sdk` | available |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - delivery product action properties pr and stage proof v1.md:| Route | `GSD_FALLBACK_MANUAL_DELIVERY_PROOF` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - feature product actions registry surface v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0`; route query unsupported |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - feature product actions registry surface v1.md:| Fallback | `GSD_FALLBACK_MANUAL_IMPLEMENTATION_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - feature interview analysis patch helper v1.md:| GSD route | `GSD_FALLBACK_MANUAL_IMPLEMENTATION_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-08 - tooling processmap agent operating contract v2.md:- Fallback: `GSD_FALLBACK_MANUAL_DOCS_BOUNDED`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - uiux product actions registry workspace sessions and drilldown v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0 |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend migrate ai questions to ai runtime v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend migrate ai questions to ai runtime v1.md:| Route | `GSD_FALLBACK_MANUAL_BACKEND_IMPLEMENTATION_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - fix product actions registry workspace session summary consistency v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0 |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-12 - product actions ai rag agent batch ux stabilization planner v1.md:GSD CLI was unavailable, so the plan records `GSD_FALLBACK_MANUAL_PLANNING` while following local GSD discipline.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-07 - backend migrate path reports to ai runtime v1.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-04-26 - feature discussions notification inbox and history v1 conflict resolution.md:- Used GSD workflow discipline and attempted `gsd-sdk query init.phase-op feature/discussions-notification-inbox-and-history-v1-conflict-resolution`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step table discussion style redesign v2 correction.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step table discussion style redesign v2 correction.md:| fallback | `GSD_FALLBACK_MANUAL_UIUX_CORRECTION` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux product actions panel list and editor v1.md:| route | `GSD_FALLBACK_MANUAL_UIUX_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-04-26 - feature discussions notification inbox and history v1.md:- `gsd-sdk query init.phase-op feature/discussions-notification-inbox-and-history-v1` was run in the clean worktree and reported `planning_exists: false`, `roadmap_exists: false`, `phase_found: false`; normal GSD phase artifacts could not be generated without bootstrapping `.planning`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - feature bpmn product action properties v1.md:| GSD route | `GSD_FALLBACK_MANUAL_IMPLEMENTATION_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step row density and focus v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step row density and focus v1.md:| fallback | `GSD_FALLBACK_MANUAL_UIUX_CORRECTION` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-05 - runtime product action properties stage save reload proof v1.md:| GSD route | `GSD_FALLBACK_MANUAL_RUNTIME_PROOF` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step table and product actions discussion style redesign v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - uiux analysis step table and product actions discussion style redesign v1.md:| fallback | `GSD_FALLBACK_MANUAL_UIUX_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-04-26 - uiux discussions notification surface clarity and consolidation v1.md:- GSD availability probe: `gsd-sdk query init.phase-op uiux/discussions-notification-surface-clarity-and-consolidation-v1` returned no `.planning`, no roadmap, no installed GSD agents; GSD skills were read and the phase gates are being followed manually.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix explorer session open double click v1.md:| gsd-sdk | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/HANDOFF/2026-05-06 - fix explorer session open double click v1.md:| route | `GSD_FALLBACK_MANUAL_BUGFIX_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/14_Canvas_first_UI_composition.md:## GSD_FALLBACK_MANUAL
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/14_Canvas_first_UI_composition.md:| Command availability | `gsd` недоступен; `gsd-sdk v0.1.0` доступен |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/14_Canvas_first_UI_composition.md:| Почему fallback | `gsd-sdk` CLI содержит только `run/auto/init/query`; безопасных точечных `discuss/plan/execute` команд нет, а `run/auto` шире bounded-контура |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/14_Canvas_first_UI_composition.md:| Fallback | `GSD_FALLBACK_MANUAL` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/15_Branching_scene_visual_feedback.md:## GSD_FALLBACK_MANUAL
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/15_Branching_scene_visual_feedback.md:| Command availability | `gsd` недоступен; `gsd-sdk v0.1.0` доступен |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/15_Branching_scene_visual_feedback.md:| Почему fallback | `gsd-sdk` CLI содержит `run/auto/init/query`, но не безопасные точечные `discuss/plan/execute`; широкие команды не подходят bounded local-only contour |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/BPMN 123/15_Branching_scene_visual_feedback.md:| Fallback | `GSD_FALLBACK_MANUAL` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD route | `GSD_FALLBACK_MANUAL_BUGFIX_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD route | `GSD_FALLBACK_MANUAL_BUGFIX_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0; route/check queries unsupported |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0; route/check queries unsupported |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0`; route/phase-ready queries unsupported |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0`; route/phase-ready queries unsupported |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:- GSD CLI unavailable; `gsd-sdk v0.1.0`; route/phase-ready queries unsupported.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0`; route/phase-ready queries unsupported |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0; route/phase-ready queries unsupported |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, v0.1.0; route/phase-ready queries unsupported |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD CLI | `gsd` unavailable → fallback marker `GSD_FALLBACK_MANUAL_RUNTIME_BOUNDED` |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md:| GSD status | `GSD_FALLBACK_MANUAL_RUNTIME_FORENSIC` (no `.planning/` phase files) |
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-10 - plan product actions ai suggest reliability ui and batch v1.md:- Fallback marker: `GSD_FALLBACK_MANUAL_PLANNING_BOUNDED`.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-10 - audit processmap rag current state and next contours v1.md:- Fallback marker: GSD_FALLBACK_MANUAL_BOUNDED.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-10 - audit processmap rag current state and next contours v1.md:GSD: slash commands unavailable in this API surface; MCP runner unavailable; consulted local gsd-forensics and gsd-plan-phase contracts; gsd-session-report not installed; fallback recorded as GSD_FALLBACK_MANUAL_BOUNDED.
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-09 - feat rag search api v1.md:GSD_FALLBACK_MANUAL_BOUNDED
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-10 - uiux rag search result humanization v1.md:- GSD: `GSD_FALLBACK_MANUAL_BOUNDED`
/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/COMMAND_OUTPUTS_SANITIZED.md:/srv/obsidian/project-atlas/ProcessMap/_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/PROJECT ATLAS/HANDOFF/2026-05-09 - feat rag db schema and index pipeline v1.md:GSD_FALLBACK_MANUAL_BOUNDED (GSD skills located at `~/.claude/skills/gsd-*/` but not invoked)

```

## Additional read-only symlink target checks

```bash
for p in /usr/local/bin/gsd /usr/local/bin/gsd-sdk /usr/local/bin/get-shit-done-cc /root/.local/bin/gsd /root/.local/bin/gsd-sdk /root/.local/bin/get-shit-done-cc; do ...; done
```

```text
== /usr/local/bin/gsd ==
MISSING
== /usr/local/bin/gsd-sdk ==
lrwxrwxrwx 1 root root 24 Apr 26 20:58 /usr/local/bin/gsd-sdk -> /root/.local/bin/gsd-sdk
readlink: /root/.local/bin/gsd-sdk
readlink -f: 
TARGET_MISSING
== /usr/local/bin/get-shit-done-cc ==
lrwxrwxrwx 1 root root 33 Apr 26 20:58 /usr/local/bin/get-shit-done-cc -> /root/.local/bin/get-shit-done-cc
readlink: /root/.local/bin/get-shit-done-cc
readlink -f: 
TARGET_MISSING
== /root/.local/bin/gsd ==
MISSING
== /root/.local/bin/gsd-sdk ==
lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/gsd-sdk -> ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js
readlink: ../lib/node_modules/get-shit-done-cc/bin/gsd-sdk.js
readlink -f: 
TARGET_MISSING
== /root/.local/bin/get-shit-done-cc ==
lrwxrwxrwx 1 root root 51 Apr 26 20:57 /root/.local/bin/get-shit-done-cc -> ../lib/node_modules/get-shit-done-cc/bin/install.js
readlink: ../lib/node_modules/get-shit-done-cc/bin/install.js
readlink -f: 
TARGET_MISSING
```

## Additional read-only Codex GSD checks

```bash
ls/find /root/.codex GSD paths, filenames only
```

```text
total 33832
drwxr-xr-x 15 root root     4096 May  6 23:59 .
drwx------ 25 root root     4096 May 14 17:10 ..
-rw-r--r--  1 root root        3 Feb 23 10:09 .personality_migration
drwxr-xr-x  3 root root     4096 May  5 07:19 .tmp
drwxr-xr-x  2 root root     4096 Apr 26 20:56 agents
-rw-------  1 root root     4257 May  4 14:44 auth.json
drwxr-xr-x  3 root root     4096 Apr 26 20:34 cache
-rw-------  1 root root      501 May  4 09:44 config.toml
-rw-------  1 root root    10443 May  2 10:20 config.toml.bak.20260502-102055
-rw-------  1 root root      588 May  2 10:23 config.toml.bak.no-hooks.20260502-102305
drwxr-xr-x  7 root root     4096 Apr 26 20:56 get-shit-done
-rw-r--r--  1 root root    39397 Apr 26 20:56 gsd-file-manifest.json
-rw-------  1 root root  1856153 May  4 16:04 history.jsonl
drwxr-xr-x  2 root root     4096 Apr 26 20:56 hooks
-rw-r--r--  1 root root       36 Apr 26 20:34 installation_id
drwxr-xr-x  2 root root     4096 Feb 23 10:09 log
-rw-r--r--  1 root root 27836416 May  7 00:12 logs_2.sqlite
-rw-r--r--  1 root root    32768 May  7 00:14 logs_2.sqlite-shm
-rw-r--r--  1 root root  4194192 May  7 00:15 logs_2.sqlite-wal
drwxr-xr-x  2 root root     4096 Mar 23 12:52 memories
-rw-r--r--  1 root root   199863 May  5 07:19 models_cache.json
drwxr-xr-x  3 root root     4096 Apr 26 20:34 plugins
drwxr-xr-x  2 root root     4096 Feb 23 10:12 rules
drwxr-xr-x  3 root root     4096 Feb 23 10:11 sessions
drwxr-xr-x  2 root root     4096 May  5 07:19 shell_snapshots
drwxr-xr-x 88 root root     4096 May  2 12:47 skills
-rw-r--r--  1 root root   364544 May  5 07:39 state_5.sqlite
drwxr-xr-x  3 root root     4096 Feb 23 10:03 tmp
-rw-r--r--  1 root root      105 May  5 07:19 version.json
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
/root/.codex/agents/gsd-research-synthesizer.md
/root/.codex/agents/gsd-research-synthesizer.toml
/root/.codex/agents/gsd-roadmapper.md
/root/.codex/agents/gsd-roadmapper.toml
/root/.codex/agents/gsd-security-auditor.md
/root/.codex/agents/gsd-security-auditor.toml
/root/.codex/agents/gsd-ui-auditor.md
/root/.codex/agents/gsd-ui-auditor.toml
/root/.codex/agents/gsd-ui-checker.md
/root/.codex/agents/gsd-ui-checker.toml
/root/.codex/agents/gsd-ui-researcher.md
/root/.codex/agents/gsd-ui-researcher.toml
/root/.codex/agents/gsd-user-profiler.md
/root/.codex/agents/gsd-user-profiler.toml
/root/.codex/agents/gsd-verifier.md
/root/.codex/agents/gsd-verifier.toml
/root/.codex/get-shit-done
/root/.codex/get-shit-done/bin/gsd-tools.cjs
/root/.codex/get-shit-done/bin/lib/gsd2-import.cjs
/root/.codex/gsd-file-manifest.json
/root/.codex/hooks/gsd-check-update-worker.js
/root/.codex/hooks/gsd-check-update.js
/root/.codex/hooks/gsd-context-monitor.js
/root/.codex/hooks/gsd-phase-boundary.sh
/root/.codex/hooks/gsd-prompt-guard.js
/root/.codex/hooks/gsd-read-guard.js
/root/.codex/hooks/gsd-read-injection-scanner.js
/root/.codex/hooks/gsd-session-state.sh
/root/.codex/hooks/gsd-statusline.js
/root/.codex/hooks/gsd-validate-commit.sh
/root/.codex/hooks/gsd-workflow-guard.js
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
/root/.codex/skills/gsd-pr-branch
/root/.codex/skills/gsd-profile-user
/root/.codex/skills/gsd-progress
/root/.codex/skills/gsd-quick
/root/.codex/skills/gsd-reapply-patches
/root/.codex/skills/gsd-remove-phase
/root/.codex/skills/gsd-remove-workspace
/root/.codex/skills/gsd-research-phase
/root/.codex/skills/gsd-resume-work
/root/.codex/skills/gsd-review
/root/.codex/skills/gsd-review-backlog
/root/.codex/skills/gsd-scan
/root/.codex/skills/gsd-secure-phase
/root/.codex/skills/gsd-session-report
/root/.codex/skills/gsd-set-profile
/root/.codex/skills/gsd-settings
/root/.codex/skills/gsd-settings-advanced
/root/.codex/skills/gsd-settings-integrations
/root/.codex/skills/gsd-ship
/root/.codex/skills/gsd-sketch
/root/.codex/skills/gsd-sketch-wrap-up
/root/.codex/skills/gsd-spec-phase
/root/.codex/skills/gsd-spike
/root/.codex/skills/gsd-spike-wrap-up
/root/.codex/skills/gsd-stats
/root/.codex/skills/gsd-sync-skills
/root/.codex/skills/gsd-thread
/root/.codex/skills/gsd-ui-phase
/root/.codex/skills/gsd-ui-review
/root/.codex/skills/gsd-ultraplan-phase
/root/.codex/skills/gsd-undo
/root/.codex/skills/gsd-update
/root/.codex/skills/gsd-validate-phase
/root/.codex/skills/gsd-verify-work
/root/.codex/skills/gsd-workstreams
```

## Additional read-only gsd-tools.cjs help/version

```bash
node /root/.codex/get-shit-done/bin/gsd-tools.cjs --help || true; node /root/.codex/get-shit-done/bin/gsd-tools.cjs --version || true
```

```text
Error: Unknown flag: --help
gsd-tools does not accept help or version flags. Run "gsd-tools" with no arguments for usage.
Error: Unknown flag: --version
gsd-tools does not accept help or version flags. Run "gsd-tools" with no arguments for usage.
```

## Additional read-only gsd-tools.cjs usage

```bash
node /root/.codex/get-shit-done/bin/gsd-tools.cjs || true
```

```text
Error: Usage: gsd-tools <command> [args] [--raw] [--pick <field>] [--cwd <path>] [--ws <name>]
Commands: state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, config-new-project, init, workstream, docs-init
```
