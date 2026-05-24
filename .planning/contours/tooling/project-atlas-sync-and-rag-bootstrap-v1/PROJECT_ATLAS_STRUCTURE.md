# Project Atlas Canonical Vault Structure

This document defines the canonical directory structure for the Project Atlas Obsidian vault, used both on the local Mac and on the server.

## Root Layout

```
ProjectAtlas/
├── ProcessMap/
│   ├── HANDOFF/              # Curated handoff notes from AI sessions
│   ├── Evidence/             # Runtime evidence, test results, proofs
│   ├── Decisions/            # Architecture and product decisions (ADRs)
│   ├── Runtime/              # Runtime configuration, telemetry summaries
│   ├── Prompts/              # Reusable AI prompts and prompt templates
│   ├── Contours/             # GSD / planning contour manifests and plans
│   ├── Architecture/         # System architecture docs, API contracts
│   ├── Audits/               # Audit reports, security reviews, code reviews
│   ├── Backlog/              # Backlog items, parking lot, ideas
│   └── RAG/                  # RAG configuration, index manifests, exclusions
├── _Inbox/                   # Staging area for new, uncategorized notes
└── _Templates/               # Obsidian templates for consistent note creation
```

## Directory Descriptions

### ProcessMap/HANDOFF/
Curated handoff documents from AI contour sessions. Each note should include:
- Date and contour ID
- Summary of work performed
- Decisions made
- Open questions or follow-ups
- Links to relevant evidence

### ProcessMap/Evidence/
Runtime evidence, test results, performance proofs, and verification artifacts.
Exclude: raw unfiltered logs, temporary screenshots, unverified claims.

### ProcessMap/Decisions/
Architecture Decision Records (ADRs) and product decisions.
Each decision should have a unique ID, date, context, decision, and consequences.

### ProcessMap/Runtime/
Runtime configuration summaries, telemetry dashboards, deployment notes.
Exclude: secrets, env files, private keys, full log dumps.

### ProcessMap/Prompts/
Reusable AI prompts, system prompt templates, and prompt engineering notes.
Exclude: API keys, provider-specific credentials.

### ProcessMap/Contours/
GSD contour plans, manifests, and execution reports.
Mirror the `.planning/contours/` structure but in a human-readable vault format.

### ProcessMap/Architecture/
System architecture documentation, API contract summaries, data model diagrams.

### ProcessMap/Audits/
Security audits, code review summaries, compliance checks.

### ProcessMap/Backlog/
Backlog items, ideas, parking lot entries.
Use consistent numbering (e.g., `999.x` for parking lot).

### ProcessMap/RAG/
RAG server configuration, indexing manifests, exclusion rules, and reindex procedures.

### _Inbox/
Staging area for new notes before they are categorized.
Regularly reviewed and processed into canonical directories.

### _Templates/
Obsidian templates for consistent note creation (handoff template, ADR template, etc.).

## Naming Conventions

- Use `YYYY-MM-DD - <topic> - <contour-id>.md` for dated documents
- Use kebab-case for directory names and file names
- Always include frontmatter with `date`, `contour_id`, `tags`, and `source_path` where applicable

## Exclusion Rules (Global)

The following must NEVER be added to the vault:
- `.env`, `.env.*`, `secrets/`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`
- `node_modules/`, `.venv/`, `venv/`
- Raw unfiltered logs over 1MB
- Temporary files, cache, build artifacts
- Private keys, tokens, passwords
- Draft AI suggestions unless curated and verified
