# Cross-domain DB transactions inside storage domains

Source of truth: functions whose body contains `with _connect()` and which reference names imported from another domain.

## compat

### `_ensure_schema` @ `compat/repository.py:788`

- **dictionaries**: write [`_seed_process_property_metadata`, `_seed_reference_tables`]
- **org_auth**: write [`_ensure_auth_users_backfill`, `_ensure_org_workspaces_bootstrap`, `_ensure_workspace_folder_backfill`]

### `save_auth_users` @ `compat/repository.py:3493`

- **org_auth**: write [`_upsert_auth_user`]

### `set_admin_invite_permissions` @ `compat/repository.py:3502`

- **org_auth**: read [`_normalize_membership_permissions`]

### `_projectstorage_create` @ `compat/repository.py:3584`

- **org_auth**: write [`_ensure_workspace_record`]

### `_projectstorage_save` @ `compat/repository.py:3703`

- **org_auth**: read [`_default_org_id`, `_default_org_id`, `_default_workspace_id`]; write [`_ensure_workspace_record`]

### `_storage_count_bpmn_versions` @ `compat/repository.py:3861`

- **org_auth**: read [`_default_org_id`]

### `_storage_create_bpmn_version_snapshot` @ `compat/repository.py:4003`

- **org_auth**: read [`_default_org_id`]

### `_storage_get_bpmn_version` @ `compat/repository.py:4289`

- **org_auth**: read [`_default_org_id`]

### `_storage_list_bpmn_version_numbers_by_source_actions` @ `compat/repository.py:4412`

- **org_auth**: read [`_default_org_id`]

### `_storage_list_bpmn_versions` @ `compat/repository.py:4455`

- **org_auth**: read [`_default_org_id`]

### `_storage_list_session_state_versions` @ `compat/repository.py:4893`

- **org_auth**: read [`_default_org_id`]

### `_storage_save` @ `compat/repository.py:5255`

- **canvas_session**: read [`_diagram_truth_payload_hash`]
- **org_auth**: read [`_default_org_id`, `_default_org_id`, `_default_org_id`]

## platform

## dictionaries

### `apply_user_preferences_patch` @ `dictionaries/repository.py:140`

- **compat**: read [`_row_to_dict`]; write [`_json_dumps`]

### `upsert_org_property_dictionary_definition` @ `dictionaries/repository.py:587`

- **utils**: write [`normalize_org_property_dictionary_bool`, `normalize_org_property_dictionary_bool`, `normalize_org_property_dictionary_bool`, `normalize_org_property_dictionary_input_mode`]

### `upsert_org_property_dictionary_operation` @ `dictionaries/repository.py:662`

- **utils**: write [`normalize_org_property_dictionary_bool`]

### `upsert_org_property_dictionary_value` @ `dictionaries/repository.py:718`

- **utils**: write [`normalize_org_property_dictionary_bool`]

### `upsert_process_property_metadata` @ `dictionaries/repository.py:790`

- **compat**: write [`_json_text`, `_json_text`, `_json_text`, `_json_text`]

## org_auth

### `accept_org_invite` @ `org_auth/repository.py:597`

- **compat**: read [`_invite_row_to_dict`, `_normalize_email`, `_normalize_org_invite_role`]; write [`_json_dumps`, `_merge_auth_user_profile_with_connection`]

### `create_auth_user` @ `org_auth/repository.py:844`

- **compat**: write [`_get_auth_user_by_email_with_connection`, `_get_auth_user_by_id_with_connection`]

### `get_auth_user_by_id` @ `org_auth/repository.py:1165`

- **compat**: write [`_get_auth_user_by_id_with_connection`]

### `list_user_org_memberships` @ `org_auth/repository.py:1572`

- **compat**: write [`_ensure_enterprise_bootstrap`, `_now_ts`]

### `merge_auth_user_profile` @ `org_auth/repository.py:1724`

- **compat**: write [`_merge_auth_user_profile_with_connection`]

### `rename_workspace_record` @ `org_auth/repository.py:2010`

- **compat**: write [`_now_ts`]

### `update_auth_user` @ `org_auth/repository.py:2152`

- **compat**: read [`_normalize_email`]; write [`_get_auth_user_by_email_with_connection`, `_get_auth_user_by_id_with_connection`, `_get_auth_user_by_id_with_connection`, `_now_ts`]

### `update_org_group` @ `org_auth/repository.py:2263`

- **compat**: write [`_now_ts`]

## project

### `create_project_in_folder` @ `project/repository.py:32`

- **compat**: write [`_json_dumps`]

### `get_project_workspace_details` @ `project/repository.py:149`

- **org_auth**: read [`_default_workspace_id`]

## explorer

### `create_workspace_folder` @ `explorer/repository.py:149`

- **org_auth**: read [`get_workspace_record`]

### `update_template_folder` @ `explorer/repository.py:989`

- **org_auth**: read [`_normalize_template_scope`]

### `update_workspace_folder_business_fields` @ `explorer/repository.py:1034`

- **compat**: read [`_row_value`]

## templates_legacy

### `create_template` @ `templates_legacy/repository.py:32`

- **compat**: write [`_json_dumps`]

### `update_template` @ `templates_legacy/repository.py:153`

- **compat**: write [`_json_dumps`]

## audit_telemetry

## ai

## canvas_session

### `run_workspace_folder_backfill` @ `canvas_session/repository.py:837`

- **compat**: read [`_BACKFILL_META_KEY`]
- **org_auth**: write [`_ensure_workspace_folder_backfill`]

## notes

### `acknowledge_note_mention` @ `notes/repository.py:236`

- **compat**: read [`_row_value`]

### `acknowledge_note_thread_attention` @ `notes/repository.py:271`

- **compat**: read [`_row_value`, `_row_value`]
- **org_auth**: read [`_default_org_id`]

### `add_note_comment` @ `notes/repository.py:316`

- **compat**: read [`_row_value`, `_row_value`, `_row_value`]
- **org_auth**: read [`_default_org_id`]

### `create_note_thread` @ `notes/repository.py:388`

- **compat**: write [`_json_dumps`]
- **utils**: write [`_project_workspace_id_for_session`]

### `delete_note_comment` @ `notes/repository.py:472`

- **compat**: read [`_row_value`]

### `get_note_thread` @ `notes/repository.py:598`

- **compat**: read [`_row_value`, `_row_value`, `_row_value`, `_row_value`, `_row_value`, `_row_value`, `_thread_attention_acknowledged_at`]
- **utils**: read [`_auth_user_profiles_by_id_with_connection`, `_note_mention_row_to_dict`]

### `list_note_notifications_for_user` @ `notes/repository.py:720`

- **compat**: read [`_row_value`, `_row_value`]
- **utils**: read [`_auth_user_profiles_by_id_with_connection`]

### `list_note_threads` @ `notes/repository.py:1034`

- **compat**: read [`_row_value`, `_row_value`, `_row_value`, `_row_value`, `_row_value`]
- **utils**: read [`_auth_user_profiles_by_id_with_connection`, `_note_comment_row_to_dict`, `_note_mention_row_to_dict`]

### `mark_note_thread_read` @ `notes/repository.py:1158`

- **compat**: write [`_now_ts`]
- **utils**: read [`_note_comment_row_to_dict`]

### `update_note_comment` @ `notes/repository.py:1285`

- **compat**: read [`_row_value`, `_row_value`, `_row_value`]
- **org_auth**: read [`_default_org_id`]

**Total functions with cross-domain DB transactions: 43**