# MISPLACED cross-domain imports

Cross-domain imports where at least one side belongs to a domain slated to become a separate service (`ai`, `org_auth`, `notes`). These imports are intentionally left in place; they are input for the next contour (`feature/extract-storage-service`).

| Importing domain | Source domain | Import line | Location |
|------------------|---------------|-------------|----------|
| ai | __future__ | `from __future__ import annotations` | `ai/repository.py:1` |
| ai | audit_telemetry | `from ..audit_telemetry.repository import _normalize_ai_execution_status` | `ai/repository.py:550` |
| ai | contextvars | `from contextvars import ContextVar` | `ai/repository.py:13` |
| ai | dataclasses | `from dataclasses import dataclass` | `ai/repository.py:14` |
| ai | datetime | `from datetime import datetime, timezone` | `ai/repository.py:15` |
| ai | pathlib | `from pathlib import Path` | `ai/repository.py:16` |
| ai | psycopg_pool | `from psycopg_pool import ConnectionPool` | `ai/repository.py:26` |
| ai | typing | `from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple, Set` | `ai/repository.py:17` |
| audit_telemetry | org_auth | `from ..org_auth.repository import list_user_org_memberships` | `audit_telemetry/repository.py:593` |
| canvas_session | ai | `from ..ai.repository import _build_ai_prompt_where` | `canvas_session/repository.py:938` |
| canvas_session | ai | `from ..ai.repository import _normalize_ai_prompt_scope_level` | `canvas_session/repository.py:939` |
| canvas_session | ai | `from ..ai.repository import get_ai_prompt_version` | `canvas_session/repository.py:940` |
| canvas_session | notes | `from ..notes.repository import _attention_count_case` | `canvas_session/repository.py:950` |
| canvas_session | notes | `from ..notes.repository import _notes_aggregate_payload` | `canvas_session/repository.py:951` |
| canvas_session | notes | `from ..notes.repository import _personal_discussion_count_case` | `canvas_session/repository.py:952` |
| canvas_session | org_auth | `from ..org_auth.repository import _default_org_id` | `canvas_session/repository.py:953` |
| canvas_session | org_auth | `from ..org_auth.repository import _ensure_workspace_folder_backfill` | `canvas_session/repository.py:954` |
| explorer | org_auth | `from ..org_auth.repository import _normalize_template_scope` | `explorer/repository.py:1094` |
| explorer | org_auth | `from ..org_auth.repository import _template_folder_row_to_dict` | `explorer/repository.py:1095` |
| explorer | org_auth | `from ..org_auth.repository import get_workspace_record` | `explorer/repository.py:1096` |
| notes | __future__ | `from __future__ import annotations` | `notes/repository.py:1` |
| notes | contextvars | `from contextvars import ContextVar` | `notes/repository.py:13` |
| notes | dataclasses | `from dataclasses import dataclass` | `notes/repository.py:14` |
| notes | datetime | `from datetime import datetime, timezone` | `notes/repository.py:15` |
| notes | org_auth | `from ..org_auth.repository import _default_org_id` | `notes/repository.py:1360` |
| notes | pathlib | `from pathlib import Path` | `notes/repository.py:16` |
| notes | psycopg_pool | `from psycopg_pool import ConnectionPool` | `notes/repository.py:26` |
| notes | typing | `from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple, Set` | `notes/repository.py:17` |
| notes | utils | `from ..utils.repository import _apply_note_author_profiles` | `notes/repository.py:1361` |
| notes | utils | `from ..utils.repository import _apply_note_comment_reply_summaries` | `notes/repository.py:1362` |
| notes | utils | `from ..utils.repository import _auth_user_profiles_by_id_with_connection` | `notes/repository.py:1363` |
| notes | utils | `from ..utils.repository import _normalize_bool_flag` | `notes/repository.py:1364` |
| notes | utils | `from ..utils.repository import _normalize_note_priority` | `notes/repository.py:1365` |
| notes | utils | `from ..utils.repository import _normalize_note_status` | `notes/repository.py:1366` |
| notes | utils | `from ..utils.repository import _note_comment_row_to_dict` | `notes/repository.py:1367` |
| notes | utils | `from ..utils.repository import _note_mention_row_to_dict` | `notes/repository.py:1368` |
| notes | utils | `from ..utils.repository import _note_notification_plain_preview` | `notes/repository.py:1369` |
| notes | utils | `from ..utils.repository import _note_thread_row_to_dict` | `notes/repository.py:1370` |
| notes | utils | `from ..utils.repository import _note_thread_title_from_scope` | `notes/repository.py:1371` |
| notes | utils | `from ..utils.repository import _project_workspace_id_for_session` | `notes/repository.py:1372` |
| org_auth | __future__ | `from __future__ import annotations` | `org_auth/repository.py:1` |
| org_auth | contextvars | `from contextvars import ContextVar` | `org_auth/repository.py:13` |
| org_auth | dataclasses | `from dataclasses import dataclass` | `org_auth/repository.py:14` |
| org_auth | datetime | `from datetime import datetime, timezone` | `org_auth/repository.py:15` |
| org_auth | pathlib | `from pathlib import Path` | `org_auth/repository.py:16` |
| org_auth | platform | `from ..platform.repository import _meta_get` | `org_auth/repository.py:2401` |
| org_auth | platform | `from ..platform.repository import _meta_set` | `org_auth/repository.py:2402` |
| org_auth | psycopg_pool | `from psycopg_pool import ConnectionPool` | `org_auth/repository.py:26` |
| org_auth | typing | `from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple, Set` | `org_auth/repository.py:17` |
| org_auth | utils | `from ..utils.repository import _org_git_mirror_payload` | `org_auth/repository.py:2403` |
| project | org_auth | `from ..org_auth.repository import _default_workspace_id` | `project/repository.py:342` |
| project | org_auth | `from ..org_auth.repository import _normalize_project_membership_role` | `project/repository.py:343` |
| templates_legacy | org_auth | `from ..org_auth.repository import _normalize_template_folder_id` | `templates_legacy/repository.py:206` |
| templates_legacy | org_auth | `from ..org_auth.repository import _normalize_template_scope` | `templates_legacy/repository.py:207` |
| templates_legacy | org_auth | `from ..org_auth.repository import _normalize_template_type` | `templates_legacy/repository.py:208` |
| templates_legacy | org_auth | `from ..org_auth.repository import _template_row_to_dict` | `templates_legacy/repository.py:209` |
| utils | org_auth | `from ..org_auth.repository import _default_org_id` | `utils/repository.py:332` |

**Total MISPLACED imports: 57**