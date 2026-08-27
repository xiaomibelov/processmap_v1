# RAG Preflight — fix/product-actions-suggest-single-object

**Role:** executor  
**Contour:** fix/product-actions-suggest-single-object  
**Queries:**
- product_actions_suggest parse single object suggestions array action_text tags
- prompt registry product_actions_suggest v4 few-shot array

---

## Key findings

### Parser location
- `backend/app/ai/product_actions_suggest.py` — `parse_product_actions_suggestions`, `_extract_suggestions_array`.
- Known wrapper keys: `suggestions`, `actions`, `items`, `results`, `data`.
- `_extract_suggestions_array` returns `None` if payload is a dict without known wrapper keys — this is the bug for single-object responses.

### Prompt registry
- `backend/app/ai/prompt_registry.py` seeds prompts via `existing_ai_prompt_seeds()`.
- v4 prompt: `PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE_V4` in `product_actions_suggest.py`.
- Active prompt id: `seed_ai_product_actions_suggest_v4`.

### Tests
- `backend/tests/test_product_actions_suggest_v2.py` — parser unit tests.
- `backend/tests/test_product_actions_ai_suggest.py` — router integration tests.
- `backend/tests/test_ai_prompt_registry_seeds.py` — prompt seed tests.

### Related contours
- `audit/analysis-llm-raw-capture` — captured raw evidence of single-object failure.
- `fix/llm-pipeline-stabilization` — previous LLM contract work.

---

## Raw search results

# Search Results

**Query:** product_actions_suggest parse single object suggestions array action_text tags
**Terms:** product, actions, suggest, parse, single, object, suggestions, array, action, text, tags
**Results:** 5

| Rank | Score | Path | Title | Category | Class | Verdict |
|------|-------|------|-------|----------|-------|---------|
| 1 | 53.806 | `/ws/server-backup/opt/processmap-test/backend/tests/test_product_actions_ai_suggest.py` | def test_suggest_returns_candidates_without_mutation_and_logs_success(self): | code | code_map |  |
| 2 | 52.831 | `/ws/server-backup/opt/processmap-test/backend/app/ai/product_actions_suggest.py` | def suggest_product_actions_with_deepseek( | code | code_map |  |
| 3 | 50.269 | `/ws/server-backup/opt/processmap-test/backend/app/routers/product_actions_ai.py` | product_actions_ai.py | code | code_map |  |
| 4 | 49.015 | `/ws/server-backup/opt/processmap-test/backend/app/ai/product_actions_suggest.py` | class ProductActionsAiResponseParseError(ValueError): | code | code_map |  |
| 5 | 47.711 | `/ws/server-backup/opt/processmap-test/backend/tests/test_product_actions_ai_suggest.py` | def test_selected_step_suggest_filters_context_and_unrelated_rows_without_mutati | code | code_map |  |

## Snippets

### 1. def test_suggest_returns_candidates_without_mutation_and_logs_success(self):
**Score:** 53.806 | **Matched:** product, actions, suggest, object, suggestions, action, text
**Boosts:** path_match, heading_match
**Why matched:** path_match, heading_match

```
## def test_*suggest*_returns_candidates_without_mutation_and_logs_success(self):
def test_*suggest*_returns_candidates_without_mutation_and_logs_success(self): before = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True) with patch( "app.routers.*product*_**action*s*_ai.*suggest*_*product*_**action*s*_with_deepseek", return_value={ "*suggest*ions": [ { "id": "ai_1", "step_id": "step_2", "bpmn_element_id": "Task_2", "step_label": "Упаковать сэндвич", "*product*_name": "Сэндвич", "*product*_group": "Готовые блюда", "*action*_type": "упаковка", "*action*_stage": "упаковка", "*action*_*object*": "сэндвич…
```

### 2. def suggest_product_actions_with_deepseek(
**Score:** 52.831 | **Matched:** product, actions, suggest, parse, object, suggestions, action
**Boosts:** path_match, heading_match
**Why matched:** path_match, heading_match

```
## def *suggest*_*product*_**action*s*_with_deepseek(
def *suggest*_*product*_**action*s*_with_deepseek( *, con*text*: Dict[str, Any], api_key: str, base_url: str, prompt_template: Optional[str] = None, max_*suggest*ions: int = 3, ) -> Dict[str, Any]: system_prompt = str(prompt_template or *PRODUCT*_**ACTION*S*_*SUGGEST*_PROMPT_TEMPLATE) user_payload = json.dumps(con*text* if isinstance(con*text*, dict) else {}, ensure_ascii=False, sort_keys=True) base = (base_url or "https://api.deepseek.com").strip().rstrip("/") data = _dq._deepseek_chat_request( api_key=api_key, base_url=base, messages=[ {"role": "system", "content": syst…
```

### 3. product_actions_ai.py
**Score:** 50.269 | **Matched:** product, actions, suggest, parse, object, action, tags
**Boosts:** path_match, heading_match
**Why matched:** path_match, heading_match

```
## *product*_**action*s*_ai.py
from __future__ import annotations import time import uuid from typing import Any, Dict, List, Optional, Set from fastapi import APIRouter, HTTPException, Request from pydantic import BaseModel, Field from ..ai.execution_log import check_ai_rate_limit, hash_ai_input, record_ai_execution from ..ai.*product*_**action*s*_*suggest* import *Product***Action*s*AiResponse*Parse*Error, *suggest*_*product*_**action*s*_with_deepseek from ..ai.prompt_registry import get_active_prompt, seed_existing_ai_prompts from ..legacy.request_con*text* import require_authenticated_user, request_active_org_id from ..m…
```

### 4. class ProductActionsAiResponseParseError(ValueError):
**Score:** 49.015 | **Matched:** product, actions, suggest, object, suggestions, action, text
**Boosts:** path_match
**Why matched:** path_match

```
## class *Product***Action*s*AiResponse*Parse*Error(ValueError):
class *Product***Action*s*AiResponse*Parse*Error(ValueError): """Raised when the provider returned *text* that cannot be *parse*d as *suggest*ions JSON.""" *PRODUCT*_**ACTION*S*_*SUGGEST*_PROMPT_TEMPLATE = """Ты помогаешь заполнить реестр действий с продуктом для пищевого процесса. Верни только JSON без markdown. Формат: { "*suggest*ions": [ { "step_id": "", "bpmn_element_id": "", "step_label": "", "*product*_name": "", "*product*_group": "", "*action*_type": "", "*action*_stage": "", "*action*_*object*": "", "*action*_*object*_category": "", "*action*_method": "", "role": "", "…
```

### 5. def test_selected_step_suggest_filters_context_and_unrelated_rows_without_mutati
**Score:** 47.711 | **Matched:** product, actions, suggest, object, suggestions, action
**Boosts:** path_match, heading_match
**Why matched:** path_match, heading_match

```
## def test_selected_step_*suggest*_filters_con*text*_and_unrelated_rows_without_mutati
def test_selected_step_*suggest*_filters_con*text*_and_unrelated_rows_without_mutation(self): before = self.get_storage().load(self.session_id, org_id=self.org_id, is_admin=True) with patch( "app.routers.*product*_**action*s*_ai.*suggest*_*product*_**action*s*_with_deepseek", return_value={ "*suggest*ions": [ { "id": "ai_wrong", "step_id": "step_1", "bpmn_element_id": "Task_1", "*product*_name": "Курица", "*product*_group": "Птица", "*action*_type": "нарезка", "*action*_*object*": "курица", "confidence": 0.8, }, { "id": "ai_right", "step_id…
```


---

# Search Results

**Query:** prompt registry product_actions_suggest v4 few-shot array
**Terms:** prompt, registry, product, actions, suggest, v4, few, shot, array
**Results:** 5

| Rank | Score | Path | Title | Category | Class | Verdict |
|------|-------|------|-------|----------|-------|---------|
| 1 | 55.051 | `/ws/server-backup/opt/processmap-test/backend/app/ai/prompt_registry.py` | def existing_ai_prompt_seeds() -> list[PromptSeed]: | code | prompt_template |  |
| 2 | 47.561 | `/ws/server-backup/opt/processmap-test/backend/tests/test_ai_prompt_registry_seeds.py` | test_ai_prompt_registry_seeds.py | code | prompt_template |  |
| 3 | 44.794 | `/ws/server-backup/opt/processmap-test/backend/tests/test_product_actions_ai_suggest.py` | def test_active_prompt_seed_is_used_and_fallback_kept(self): | code | code_map |  |
| 4 | 43.499 | `/ws/p0-work/docs/obsidian_fallback/project_atlas_updates/fix-product-actions-ai-suggest-json-contract-hardening-v1/handoff.md` | Contour 2 (`3845028`) — JSON Contract Hardening | docs | source_truth |  |
| 5 | 43.411 | `/ws/p0-work/docs/obsidian_fallback/project_atlas_updates/fix-product-actions-ai-suggest-json-contract-hardening-v1/handoff.md` | AI Layer / Modules | docs | source_truth |  |

## Snippets

### 1. def existing_ai_prompt_seeds() -> list[PromptSeed]:
**Score:** 55.051 | **Matched:** prompt, product, actions, suggest, v4, array
**Boosts:** path_match, heading_match
**Why matched:** path_match, heading_match

```
## def existing_ai_*prompt*_seeds() -> list[*Prompt*Seed]:
def existing_ai_*prompt*_seeds() -> list[*Prompt*Seed]: from .deepseek_client import NOTES_EXTRACTION_SYSTEM_*PROMPT* from .deepseek_questions import ( _LLM_QUESTION_POLICY_*PROMPT*, _PATH_REPORT_*PROMPT*_TEMPLATE_V1, _PATH_REPORT_*PROMPT*_TEMPLATE_V2, _SESSION_TITLE_*PROMPT*_TEMPLATE, ) from .*product*_*actions*_*suggest* import *PRODUCT*_*ACTIONS*_*SUGGEST*_*PROMPT*_TEMPLATE, *PRODUCT*_*ACTIONS*_*SUGGEST*_*PROMPT*_TEMPLATE_*V4* questions_input = _object_schema( { "bpmn_xml": {"type": "string"}, "parsed_bpmn_json": {"type": "object"}, "memory": {"type": "object"}, "constraint…
```

### 2. test_ai_prompt_registry_seeds.py
**Score:** 47.561 | **Matched:** prompt, registry, product, actions, suggest, v4
**Boosts:** path_match, heading_match
**Why matched:** path_match, heading_match

```
## test_ai_*prompt*_*registry*_seeds.py
import os import sys import tempfile import unittest from pathlib import Path BACKEND_DIR = Path(__file__).resolve().parents[1] if str(BACKEND_DIR) not in sys.path: sys.path.insert(0, str(BACKEND_DIR)) class Ai*Prompt**Registry*SeedTests(unittest.TestCase): def setUp(self): self.tmp = tempfile.TemporaryDirectory() self.old_process_db_path = os.environ.get("PROCESS_DB_PATH") self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR") self.old_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR") self.old_database_url = os.environ.get("DATABASE_URL") self.o…
```

### 3. def test_active_prompt_seed_is_used_and_fallback_kept(self):
**Score:** 44.794 | **Matched:** prompt, product, actions, suggest, v4
**Boosts:** path_match, heading_match
**Why matched:** path_match, heading_match

```
## def test_active_*prompt*_seed_is_used_and_fallback_kept(self):
def test_active_*prompt*_seed_is_used_and_fallback_kept(self): with patch( "app.routers.*product*_*actions*_ai.*suggest*_*product*_*actions*_with_deepseek", return_value={"*suggest*ions": [], "warnings": []}, ) as provider: out = self.*suggest*_*product*_*actions*(self.session_id, self.*Product**Actions**Suggest*In(), self._req()) self.assertTrue(out.get("ok")) self.assertEqual(out.get("*prompt*_id"), "seed_ai_*product*_*actions*_*suggest*_*v4*") *prompt*_template = str(provider.call_args.kwargs.get("*prompt*_template") or "") self.assertIn("физические действия сотрудни…
```

### 4. Contour 2 (`3845028`) — JSON Contract Hardening
**Score:** 43.499 | **Matched:** prompt, product, actions, suggest, v4
**Boosts:** path_match, recent_14d
**Why matched:** path_match, recent_14d

```
| Dimension | Before (v3) | After (*v4*) | |-----------|-------------|------------| | Max *suggest*ions in *prompt* | none | `"Верни не более 3 предложений."` | | String length constraint | none | `"Все строковые поля — не более 60 символов."` | | `confidence` type | `0.0` float | `"low\|medium\|high"` string enum | | `evidence_text` | present | removed from *v4* schema (kept in normalizer) | | `reason` field | absent | replaces `evidence_text`, ≤60 chars | | Per-*suggest*ion `warnings[]` | present | removed from *v4* schema | | `max_tokens` | `2400` | `4000` | | Default `max_*suggest*ions` | `20` | `3` | |
```

### 5. AI Layer / Modules
**Score:** 43.411 | **Matched:** prompt, product, actions, suggest, v4
**Boosts:** path_match, recent_14d
**Why matched:** path_match, recent_14d

```
- Module: `ai.*product*_*actions*.*suggest*` - Active seed: `seed_ai_*product*_*actions*_*suggest*_*v4*` (version `*v4*`) - Archived seeds: `v1`, `v2`, `v3` - Seeder idempotency: confirmed — archived seeds never re-activated - `max_tokens`: `4000` - Default `max_*suggest*ions` (*prompt* + router + normalizer): `3` - Confidence wire format: `"low"|"medium"|"high"` (normalizer maps to float for storage) ---
```

