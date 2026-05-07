# 2026-05-07 - fix/admin-ai-modules-archive-and-session-open-regressions-v1

- Admin -> AI modules no longer collapses into generic `internal_server_error` copy after prompt archive action.
- Prompt action errors are rendered as controlled Admin UI copy while the page stays usable.
- WorkspaceDashboard session open actions pass the full session row to navigation, preserving `project_id`/workspace context.
- Explorer session CTA again says `Открыть сессию`; project and session actions remain visually and behaviorally distinct.
- Session open from workspace/session rows targets the session on the first click instead of requiring project-open first.
