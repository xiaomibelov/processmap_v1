# Server Sync Executor Prompt

## Objective
Prepare the server-side Project Atlas vault for sync with the local Mac via Syncthing.

## Target Path
```
/srv/obsidian/project-atlas
```

## Step 1: Verify Target Directory

Ensure `/srv/obsidian/project-atlas` exists and is writable.

```bash
ls -la /srv/obsidian/
mkdir -p /srv/obsidian/project-atlas
chown -R $(whoami):$(whoami) /srv/obsidian/project-atlas
```

## Step 2: Create Canonical Structure

```bash
VAULT="/srv/obsidian/project-atlas"
mkdir -p "$VAULT/ProcessMap"/{HANDOFF,Evidence,Decisions,Runtime,Prompts,Contours,Architecture,Audits,Backlog,RAG}
mkdir -p "$VAULT/_Inbox"
mkdir -p "$VAULT/_Templates"
```

## Step 3: Create .stignore

Create `/srv/obsidian/project-atlas/.stignore` with the following content:

```
.DS_Store
Thumbs.db
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/cache
.trash
*.tmp
*.swp
*~
.git
.env
.env.*
*.pem
*.key
id_rsa
id_ed25519
secrets
secrets/**
.local
.local/**
node_modules
node_modules/**
.venv
.venv/**
venv
venv/**
logs
logs/**
```

## Step 4: Seed README

Create `/srv/obsidian/project-atlas/README.md`:

```markdown
# Project Atlas

Server-side Obsidian vault for ProcessMap documentation.

## Sync
This vault is synced with the local Mac via Syncthing.
Do not manually edit files here unless the sync is paused.

## Structure
See `PROJECT_ATLAS_STRUCTURE.md` in the contour plan.

## Rules
- No secrets
- No raw logs >1MB
- No temporary files
```

## Step 5: Syncthing Preparation

### Option A: Syncthing Already Installed
Verify the service is running:
```bash
systemctl status syncthing@$(whoami).service || true
```

### Option B: Install Syncthing
If Syncthing is not installed:
```bash
# Ubuntu/Debian
curl -s https://syncthing.net/release-key.txt | sudo apt-key add -
echo "deb https://apt.syncthing.net/ syncthing stable" | sudo tee /etc/apt/sources.list.d/syncthing.list
sudo apt update && sudo apt install syncthing

# Enable and start
sudo systemctl enable syncthing@$(whoami).service
sudo systemctl start syncthing@$(whoami).service
```

### Add Folder to Syncthing
- Open Syncthing Web UI (usually http://localhost:8384 or via SSH tunnel)
- Add folder `/srv/obsidian/project-atlas`
- Set folder ID: `project-atlas-server`
- Configure ignore patterns (`.stignore` already created)
- Note the device ID for pairing with the local Mac

## Step 6: Seed Server-Side Documents

Copy relevant ProcessMap documents from `/opt/processmap-test` into the vault:

```bash
# Example: copy curated docs
rsync -av --exclude='.git' --exclude='node_modules' --exclude='.venv' \
  /opt/processmap-test/docs/ /srv/obsidian/project-atlas/ProcessMap/Architecture/ \
  --dry-run  # Remove --dry-run after verification
```

Specifically, copy:
- `PROCESSMAP/HANDOFF/*.md` → `ProcessMap/HANDOFF/`
- `docs/*.md` → `ProcessMap/Architecture/` (review and categorize)
- `AGENTS.md` → `ProcessMap/Architecture/`
- `DOD_PROCESS_WORKBENCH.md` → `ProcessMap/Architecture/`

## Constraints

- **NO destructive changes** to `/opt/processmap-test`
- **NO deletion** of existing files in `/srv/obsidian/project-atlas`
- **NO secrets** copied
- **NO changes** to product code
- Do NOT start MCP repair agent

## Output

After completion, report:
1. Syncthing version and status
2. Device ID for pairing
3. Files seeded into the vault
4. Any errors or blockers
