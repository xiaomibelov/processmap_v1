# Endpoint Check Pipeline Profiles

- Add `read_only`, `save_pipeline`, and `full` run profiles.
- Save checks use a temporary session and always clean it up.
- Built-in save chain covers XML, XML with BPMN meta, concurrent writes,
  timeout recovery, and a terminal durable save.
- Custom chains use an allowlist and must end with `final_save`.
- Persist profile and chain in the existing run summary JSON.
- Keep deploy-trigger runs read-only by default.
