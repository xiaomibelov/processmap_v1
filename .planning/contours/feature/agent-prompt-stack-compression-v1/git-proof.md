# git-proof — agent-prompt-stack-compression-v1

## Workspace

```
pwd: /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-worktrees/feature-agent-prompt-stack-compression-v1
remote: git@github.com:xiaomibelov/processmap_v1.git (fetch/push)
current branch: feature/agent-prompt-stack-compression-v1
HEAD: 8f904834559993bcb86d098bc5aa7bbba133dcfd
origin/main: 8f904834559993bcb86d098bc5aa7bbba133dcfd
status: product-code changes in working tree, not committed yet
```

## Changed files

```
 M backend/services/agent/memory/chat.py
 M backend/services/agent/memory/memory_store.py
?? backend/services/agent/memory/prompt_builder.py
?? backend/services/agent/tests/test_prompt_builder.py
?? scripts/measure_prompt_tokens.py
?? .planning/contours/feature/agent-prompt-stack-compression-v1/
```

## Diffstat

```
backend/services/agent/memory/chat.py         | 119 +++++++++-----------------
backend/services/agent/memory/memory_store.py |  22 +++++
backend/services/agent/memory/prompt_builder.py   | 440 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
backend/services/agent/tests/test_prompt_builder.py | 243 +++++++++++++++++++++++++++++++++++++++
scripts/measure_prompt_tokens.py               | 233 +++++++++++++++++++++++++++++++++++++++
```

## Tests

```bash
cd backend/services/agent
python -m pytest tests/test_prompt_builder.py tests/test_branches.py tests/test_agent_chat_contract.py tests/test_agent_stream_contract.py tests/test_context.py tests/test_agent_memory.py tests/test_memory_worker.py -q
# 42 passed
```

## Measurements

```bash
.venv/bin/python scripts/measure_prompt_tokens.py --before         # 25 897 tokens
.venv/bin/python scripts/measure_prompt_tokens.py --after          #    636 tokens
.venv/bin/python scripts/measure_prompt_tokens.py --after-prod-like #    681 tokens (mock RAG + pending-edit)
```

## PR

Draft: https://github.com/xiaomibelov/processmap_v1/pull/880

## Obsidian mirror

Manual mirror: `server-backup/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/agent-prompt-stack-compression-v1.md`

## Isolation

Created as a git worktree from `origin/main` to avoid mixing with the unrelated `feature/extract-storage-service` dirty tree in the main checkout.
