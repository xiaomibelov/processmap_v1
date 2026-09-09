# Canvas save intent single lane

1. Reproduce autosave/manual-save overlap and lost edits during an active flush.
2. Keep every canvas save intent in one in-flight lane with a keep-latest replay.
3. Reconcile an ambiguous timeout commit only when authoritative server XML exactly matches the submitted XML.
4. Arm the diagram conflict gate only for `DIAGRAM_STATE_CONFLICT`.
5. Run focused regression tests, production build, graph refresh, review, push, and PR.
