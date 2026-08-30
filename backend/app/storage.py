from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import threading
import time
import uuid
import hashlib
import secrets
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple, Set
import xml.etree.ElementTree as ET
from .db import get_db_runtime_config, redact_database_url
from .models import Project, Session
from .session_status import derive_session_status
logger = logging.getLogger(__name__)
try:
    import psycopg
    from psycopg.errors import IntegrityError as PsycopgIntegrityError
    from psycopg_pool import ConnectionPool
except Exception:
    psycopg = None
    PsycopgIntegrityError = None
    ConnectionPool = None

from .domains.storage.compat import DiagramStateConflictError, NOTE_SCOPE_TYPES, NOTE_THREAD_PRIORITIES, NOTE_THREAD_STATUSES, SESSION_PRESENCE_TTL_SECONDS, SessionNotFoundError, SessionTitleConflictError, delete_admin_entity_permission, delete_admin_entity_permission_by_role, gen_project_id, get_admin_invite_permissions, get_auth_user_by_email, get_db_runtime_info, list_admin_entity_permissions, list_auth_users, list_org_workspace_folders, list_org_workspaces, list_workspace_snapshot_rows, logger, pop_storage_request_scope, push_storage_request_scope, save_auth_users, set_admin_invite_permissions, startup_db_check, upsert_admin_entity_permission, upsert_admin_entity_permission_by_role
from .domains.storage.platform import cancel_deployment_notice, create_deployment_notice, get_active_deployment_notice, get_deployment_notice, get_feature_flag, get_feature_flags, get_rag_settings, list_deployment_notices, set_feature_flag
from .domains.storage.dictionaries import apply_user_preferences_patch, delete_org_property_dictionary_definition, delete_org_property_dictionary_value, get_org_property_dictionary_bundle, get_org_property_dictionary_definition, get_org_property_dictionary_operation, get_org_property_dictionary_value_by_id, get_process_property_metadata, get_user_preferences, list_org_property_dictionary_definitions, list_org_property_dictionary_operations, list_org_property_dictionary_values, list_process_property_metadata, list_reference_options, update_org_property_dictionary_value, upsert_org_property_dictionary_definition, upsert_org_property_dictionary_operation, upsert_org_property_dictionary_value, upsert_process_property_metadata
from .domains.storage.org_auth import accept_org_invite, add_group_member, append_audit_log, cleanup_org_invites, count_org_records, create_auth_user, create_org_group, create_org_invite, create_org_record, create_workspace_record, delete_org_group, delete_org_invite, delete_org_membership, get_auth_user_by_id, get_current_mirror_version, get_default_org_id, get_org_git_mirror_config, get_org_group, get_org_invite_by_id, get_user_org_role, get_workspace_record, increment_and_get_next_version, is_org_active, list_group_members, list_org_groups, list_org_invites, list_org_memberships, list_org_records, list_user_groups, list_user_org_memberships, list_users_group_memberships, merge_auth_user_profile, preview_org_invite, promote_regenerated_org_invite, read_user_org_memberships_fast, remove_group_member, rename_org_record, rename_workspace_record, resolve_active_org_id, revoke_org_invite, set_org_active, update_auth_user, update_org_git_mirror_config, update_org_group, upsert_org_membership, user_has_org_membership
from .domains.storage.project import create_project_in_folder, delete_project_membership, get_project_explorer_invalidation_targets, get_project_workspace_details, list_project_memberships, move_project_to_folder, upsert_project_membership
from .domains.storage.explorer import create_template_folder, create_workspace_folder, delete_template_folder, delete_workspace_folder, get_template_folder, get_workspace_folder, get_workspace_folder_breadcrumb, list_template_folders, list_workspace_folder_children, move_workspace_folder, rename_workspace_folder, search_workspace_explorer, update_template_folder, update_workspace_folder_business_fields
from .domains.storage.templates_legacy import create_template, delete_template, get_template, list_templates, update_template
from .domains.storage.audit_telemetry import append_error_event, cleanup_audit_log, cleanup_error_events, count_audit_log, count_error_events, delete_error_event, get_effective_project_scope, get_error_event, list_audit_log, list_error_events, update_error_event, user_has_project_access
from .domains.storage.ai import append_ai_execution_log, count_ai_execution_log, create_ai_prompt_draft, get_agent_conversation, get_ai_prompt_version, list_agent_conversation_turns, list_agent_conversations, list_ai_execution_log, update_agent_conversation_summary
from .domains.storage.canvas_session import activate_ai_prompt_version, archive_ai_prompt_version, build_session_version_payload, count_ai_prompt_versions, get_active_ai_prompt_version, get_folder_open_notes_aggregate, get_project_open_notes_aggregate, get_project_session_tree, get_session_open_notes_aggregate, get_sessions_open_notes_aggregates, leave_session_presence, list_ai_prompt_versions, list_project_sessions_for_explorer, list_session_children, list_session_presence, prune_stale_session_presence, run_workspace_folder_backfill, session_version_payload_hash, touch_session_presence
from .domains.storage.notes import acknowledge_note_mention, acknowledge_note_thread_attention, add_note_comment, create_note_thread, delete_note_comment, delete_note_thread, get_note_comment, get_note_thread, list_active_note_mentions_for_user, list_note_notifications_for_user, list_note_threads, mark_note_thread_read, patch_note_thread, patch_note_thread_status, update_note_comment
from .domains.storage.compat.repository import _AGENT_TABLES_DB_FILE, _AGENT_TABLES_READY, _AI_EXECUTION_STATUSES, _AI_PROMPT_SCOPE_LEVELS, _AI_PROMPT_STATUSES, _AUTH_USERS_BACKFILL_MARK, _BACKFILL_FOLDER_NAME, _BACKFILL_META_KEY, _BPMN_ACTIVITY_TAGS, _DB_LOCK, _DEFAULT_ORG_ID, _DEFAULT_ORG_NAME, _DEFAULT_WORKSPACE_NAME, _ENTERPRISE_BOOTSTRAP_MARK, _GIT_MIRROR_HEALTH_STATUSES, _GIT_MIRROR_PROVIDERS, _INT64_MAX, _MIGRATION_MARK, _ORG_FULL_ACCESS_ROLES, _ORG_INVITE_ROLES, _ORG_MEMBER_ROLES, _PERMISSION_KEYS, _PG_POOL, _PG_POOL_LOCK, _PROJECT_MEMBER_ROLES, _PROPERTY_METADATA_SEED, _PROPERTY_METADATA_SEED_KEY, _PgCompatConnection, _PgResult, _REFERENCE_SEED, _REFERENCE_SEED_KEY, _REQ_IS_ADMIN, _REQ_ORG_ID, _REQ_USER_ID, _RowCompat, _SCHEMA_DB_FILE, _SCHEMA_ENSURE_IN_PROGRESS, _SCHEMA_READY, _SESSION_ORG_WIDE_READ_ROLES, _USERS_ROLE_COLUMN_CACHE, _USER_FACING_BPMN_VERSION_ACTIONS, _ai_execution_log_row_to_dict, _ai_prompt_version_row_to_dict, _audit_row_to_dict, _bpmn_local_name, _clamp_int64, _column_exists, _connect, _conversation_row_to_dict, _conversation_status, _db_base_dir, _db_path, _ensure_agent_tables, _ensure_enterprise_bootstrap, _ensure_schema, _error_event_row_to_dict, _get_auth_user_by_email_with_connection, _get_auth_user_by_id_with_connection, _get_pg_pool, _hash_invite_token, _invite_row_to_dict, _invite_status, _json_dumps, _json_loads, _json_text, _legacy_projects_dir, _legacy_sessions_dir, _maybe_migrate_legacy_files, _merge_auth_user_profile_with_connection, _named_to_pyformat, _normalize_email, _normalize_git_mirror_health_status, _normalize_git_mirror_provider, _normalize_note_scope, _normalize_org_invite_role, _now_ts, _org_property_dictionary_definition_row_to_dict, _org_property_dictionary_operation_row_to_dict, _org_property_dictionary_value_row_to_dict, _project_row_to_model, _qmark_to_pyformat, _read_legacy_json, _row_to_dict, _row_value, _scope_is_admin, _scope_org_id, _scope_user_id, _session_read_scope, _session_read_scope_filter, _session_read_scope_filters, _session_row_to_model, _suggestion_row_to_dict, _table_exists, _thread_attention_acknowledged_at, _translate_sql_for_postgres, _users_has_role_column
from .domains.storage.platform.repository import _format_deployment_notice_row, _meta_get, _meta_set
from .domains.storage.dictionaries.repository import _seed_process_property_metadata, _seed_reference_tables
from .domains.storage.utils.repository import _apply_note_author_profiles, _apply_note_comment_reply_summaries, _auth_user_profiles_by_id_with_connection, _comment_author_display, _normalize_bool_flag, _normalize_note_priority, _normalize_note_status, _normalize_org_property_dictionary_bool, _normalize_org_property_dictionary_input_mode, _normalize_org_property_dictionary_key, _normalize_org_property_dictionary_label, _note_comment_body_preview, _note_comment_row_to_dict, _note_mention_row_to_dict, _note_notification_plain_preview, _note_thread_row_to_dict, _note_thread_title_from_scope, _opt_text, _org_git_mirror_payload, _project_workspace_id_for_session
from .domains.storage.org_auth.repository import _admin_entity_permission_defaults, _admin_entity_permission_keys, _as_int_bool, _auth_user_from_mapping, _auth_user_insert_params, _auth_user_row_to_dict, _default_org_id, _default_org_name, _default_workspace_id, _default_workspace_name, _ensure_auth_users_backfill, _ensure_org_workspaces_bootstrap, _ensure_workspace_folder_backfill, _ensure_workspace_record, _group_member_user_row, _group_row_to_dict, _insert_auth_user_ignore, _normalize_admin_entity_permissions, _normalize_membership_permissions, _normalize_org_membership_role, _normalize_project_membership_role, _normalize_template_folder_id, _normalize_template_scope, _normalize_template_type, _permission_template_for_role, _read_auth_users_rows, _template_folder_row_to_dict, _template_row_to_dict, _upsert_auth_user
from .domains.storage.explorer.repository import _get_folder_descendant_ids, _validate_folder_parent
from .domains.storage.audit_telemetry.repository import _build_audit_log_where, _build_error_events_where, _normalize_ai_execution_status
from .domains.storage.ai.repository import _build_ai_execution_log_where, _build_ai_prompt_where, _normalize_ai_prompt_scope_level, _normalize_ai_prompt_status
from .domains.storage.canvas_session.repository import _build_diagram_truth_payload, _count_bpmn_activities, _diagram_truth_payload_hash, _folder_row_to_dict, _is_integrity_error, _org_clause, _owner_clause, _parse_json_text, _session_presence_display_name, _session_to_explorer_dict, _without_session_companion_meta
from .domains.storage.notes.repository import _apply_note_thread_read_state, _attention_count_case, _insert_note_comment_mentions, _latest_note_comment_info, _normalize_mention_targets, _notes_aggregate_payload, _personal_discussion_count_case, _upsert_note_thread_read

from .domains.storage.compat import repository as _compat_repo

def _attach_compat_methods(cls, prefix: str, skip: str) -> None:
    for _name in dir(_compat_repo):
        if _name.startswith(prefix):
            _method = _name[len(prefix):]
            if _method != skip:
                setattr(cls, _method, getattr(_compat_repo, _name))


@dataclass
class Storage:
    base_dir: Path
    def __post_init__(self) -> None:
        return _compat_repo._storage___post_init__(self)


_attach_compat_methods(Storage, "_storage_", "__post_init__")


class ProjectStorage:
    def __init__(self, root: Path) -> None:
        return _compat_repo._projectstorage___init__(self, root)


_attach_compat_methods(ProjectStorage, "_projectstorage_", "__init__")


def get_project_storage() -> ProjectStorage:
    root = os.getenv("PROJECT_STORAGE_DIR", "").strip()
    if root:
        return ProjectStorage(Path(root))
    return ProjectStorage(_db_base_dir())


def get_storage() -> Storage:
    return Storage(base_dir=_db_base_dir())

