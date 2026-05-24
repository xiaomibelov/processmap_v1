# Local Mac Inventory Prompt

## Objective
Find and stage all ProcessMap-related documentation from the local Mac into the local Project Atlas vault.

## Target Vault Path
```
~/Documents/Obsidian/ProjectAtlas
```

## Step 1: Inventory (Read-Only)

Run the following command in Terminal to produce an inventory file:

```bash
echo "=== LOCAL MAC PROCESSMAP DOC CANDIDATES ==="

find \
  ~/Documents \
  ~/Desktop \
  ~/Downloads \
  ~/PycharmProjects \
  /Users/mac/PycharmProjects \
  -maxdepth 8 \
  \( \
    -iname "*processmap*" -o \
    -iname "*handoff*" -o \
    -iname "*atlas*" -o \
    -iname "*obsidian*" -o \
    -iname "*audit*" -o \
    -iname "*runtime*" -o \
    -iname "*contour*" -o \
    -iname "*.md" \
  \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.venv/*" \
  -not -path "*/venv/*" \
  -not -path "*/.git/*" \
  -print 2>/dev/null > ~/Desktop/processmap_docs_inventory.txt

wc -l ~/Desktop/processmap_docs_inventory.txt
head -100 ~/Desktop/processmap_docs_inventory.txt
```

## Step 2: Review and Select

Review `~/Desktop/processmap_docs_inventory.txt` and select documents for staging.

Selection criteria:
- Include: Markdown docs, architecture notes, handoffs, decisions, audits, evidence
- Exclude: secrets, `.env`, private keys, raw logs >1MB, node_modules, cache
- Exclude: duplicate or outdated versions (prefer latest)

## Step 3: Stage into Local Vault

Create the canonical structure:

```bash
VAULT="$HOME/Documents/Obsidian/ProjectAtlas"
mkdir -p "$VAULT/ProcessMap"/{HANDOFF,Evidence,Decisions,Runtime,Prompts,Contours,Architecture,Audits,Backlog,RAG}
mkdir -p "$VAULT/_Inbox"
mkdir -p "$VAULT/_Templates"
```

Copy selected documents into appropriate folders. If a document does not fit a canonical folder, place it in `_Inbox/` for later triage.

## Constraints

- **NO deletion** of source files. Copy only.
- **NO secrets**. If a file contains secrets, exclude it or sanitize it first.
- **NO moving** files out of their original locations without explicit approval.
- Produce the inventory file for audit trail.

## Output

After completion, report:
1. Total files inventoried
2. Total files copied to vault
3. Any files excluded and why
4. Any conflicts or duplicates found
