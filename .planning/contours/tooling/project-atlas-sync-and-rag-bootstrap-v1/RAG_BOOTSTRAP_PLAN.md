# RAG Bootstrap Plan

## Objective
Define the architecture and bootstrap procedure for a read-only RAG (Retrieval-Augmented Generation) context layer over the Project Atlas vault.

## Status
**Planning only. Implementation deferred to follow-up contour.**

## Architecture Overview

```
┌─────────────────┐
│  Product Actions│
│  AI / Chat      │
└────────┬────────┘
         │ query
         ▼
┌─────────────────┐
│  RAG API        │
│  (read-only)    │
│  /search        │
│  /reindex       │
└────────┬────────┘
         │ retrieve
         ▼
┌─────────────────┐
│  Vector Store   │
│  (chunked docs) │
└─────────────────┘
```

## Source Paths

Primary source:
```
/srv/obsidian/project-atlas/ProcessMap
```

Initial indexed directories:
- `ProcessMap/HANDOFF`
- `ProcessMap/Decisions`
- `ProcessMap/Architecture`
- `ProcessMap/Audits`
- `ProcessMap/Contours`
- `ProcessMap/Prompts`

Excluded directories:
- `secrets/` or any directory named `secrets`
- `logs/` or any directory named `logs`
- `Runtime/` (unless explicitly curated)
- `Backlog/` (unless curated)
- `_Inbox/` (transient)
- Any file matching `.stignore` patterns

## Indexing Rules

### Chunking Strategy
- Chunk Markdown by headings (H1, H2, H3)
- Preserve heading hierarchy as metadata
- Maximum chunk size: 512 tokens (approx. 2048 characters)
- Overlap: 64 tokens between chunks

### Metadata per Chunk
```json
{
  "source_path": "ProcessMap/Architecture/contract_project_api.md",
  "title": "Project API Contract",
  "heading_path": ["Architecture", "API Contracts", "Project"],
  "contour_id": "feature-admin-ai-provider-settings-and-product-actions-prompt-v1",
  "date": "2026-03-01",
  "tags": ["api", "contract", "project"]
}
```

### Exclusion Filters
- Skip files > 5MB
- Skip binary files (images, videos, archives)
- Skip files with `draft: true` in frontmatter
- Skip files in `.stignore`
- Skip files containing secrets patterns (env vars, keys)

## API Design (Draft)

### `POST /search`
Request:
```json
{
  "query": "How does session CAS work?",
  "top_k": 5,
  "filters": {
    "directories": ["Architecture", "Decisions"],
    "tags": ["cas", "session"]
  }
}
```

Response:
```json
{
  "results": [
    {
      "chunk_id": "...",
      "score": 0.92,
      "content": "...",
      "metadata": { "source_path": "...", "title": "..." }
    }
  ]
}
```

### `POST /reindex`
- Trigger manual reindex
- Protected by admin token
- Returns job ID for async tracking

### `GET /health`
- Returns index freshness and stats

## Technology Candidates

| Component | Candidates | Notes |
|-----------|-----------|-------|
| Embedding | OpenAI `text-embedding-3-small`, local `all-MiniLM-L6-v2` | Prefer local if possible |
| Vector DB | ChromaDB, Qdrant, Weaviate, pgvector | Qdrant or ChromaDB for simplicity |
| API Framework | FastAPI, Flask | FastAPI preferred |
| Markdown Parser | `markdown-it-py`, `mistune` | Extract headings and structure |
| Chunker | LangChain `MarkdownHeaderTextSplitter` | Good heading-aware splitting |

## Deployment Model

- Run as a separate Docker container or systemd service
- Read-only mount to `/srv/obsidian/project-atlas/ProcessMap`
- Expose API on internal network (e.g., `localhost:8000` or via reverse proxy)
- No direct mutation of vault files

## Security Constraints

- **Read-only**: RAG server must never write to the vault
- **No secrets indexing**: Scan for secret patterns before indexing
- **No external exposure**: API should not be publicly accessible without auth
- **Audit trail**: Log all reindex operations

## Follow-Up Contour

```
tooling/project-atlas-rag-server-bootstrap-v1
```

This contour will:
1. Select and install RAG server components
2. Implement indexing pipeline
3. Implement search API
4. Integrate with Product Actions AI
5. Add monitoring and health checks

## Deferred Decisions

- Exact embedding model (depends on hardware and latency requirements)
- Vector database choice (depends on scale and query patterns)
- Whether to use LangChain or custom chunking
- Authentication mechanism for API
