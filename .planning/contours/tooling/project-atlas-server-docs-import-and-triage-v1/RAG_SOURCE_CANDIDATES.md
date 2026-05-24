# RAG Source Candidates

## Status
Planning document only. RAG indexing NOT in scope for this contour.

## Proposed Include List

These folders should be indexed when `tooling/project-atlas-rag-server-bootstrap-v1` executes:

### High-Priority (include first)
1. `ProcessMap/HANDOFF/` — curated handoff notes, session summaries
2. `ProcessMap/Decisions/` — architecture decisions, ADRs
3. `ProcessMap/Architecture/` — API contracts, design notes, source truth
4. `ProcessMap/Audits/` — audit reports, investigation results
5. `ProcessMap/Contours/` — GSD plans, execution reports

### Medium-Priority (include after high-priority)
6. `ProcessMap/Prompts/` — reusable prompts, system templates
7. `ProcessMap/Runtime/` — runtime summaries, health checks (curated only)
8. `ProcessMap/Backlog/EPICS/Active/` — active epic descriptions

### Low-Priority (review before including)
9. `ProcessMap/Backlog/EPICS/Closed/` — closed epics (historical context)
10. `ProcessMap/Evidence/` — test evidence (may be too granular)

## Proposed Exclude List

These must NEVER be indexed:

1. `ProcessMap/_Imported/` — raw snapshot, may contain duplicates and drafts
2. `ProcessMap/_Inbox/Triage/` — unreviewed, uncertain content
3. `ProcessMap/Backlog/EPICS/Blocked/` — blocked items, may be stale
4. `ProcessMap/RAG/` — configuration files, not knowledge content
5. Any file matching `.stignore` patterns
6. Any file > 5MB
7. Any file with `draft: true` in frontmatter
8. Any file in `secrets/`, `logs/`, `.env`

## Metadata Requirements for RAG

Each chunk must preserve:
- `source_path` — vault-relative path
- `title` — document title or first H1
- `heading_path` — H1/H2/H3 hierarchy
- `contour_id` — if present in frontmatter or filename
- `date` — if present
- `tags` — if present in frontmatter

## Chunking Strategy

- Split by Markdown headings (H1, H2, H3)
- Max chunk: 512 tokens (~2048 chars)
- Overlap: 64 tokens
- Preserve heading hierarchy in metadata

## Next Step

Defer to contour: `tooling/project-atlas-rag-server-bootstrap-v1`
