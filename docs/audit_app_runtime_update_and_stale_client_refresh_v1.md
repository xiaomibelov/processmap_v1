# Audit: App Runtime Update And Stale Client Refresh V1

## 1. Runtime/source truth

- Contour: `audit/app-runtime-update-and-stale-client-refresh-v1`
- Worktree: `/private/tmp/processmap-app-runtime-update-audit-v1`
- Remote: `origin git@github.com:xiaomibelov/processmap_v1.git`
- Branch: `audit/app-runtime-update-and-stale-client-refresh-v1`
- HEAD: `972b45de355febf313d375cf3b49f5ba97dfa29a`
- origin/main: `972b45de355febf313d375cf3b49f5ba97dfa29a`
- Merge base: `972b45de355febf313d375cf3b49f5ba97dfa29a`
- Starting status: clean audit worktree.
- Main checkout was dirty/conflicted, so this audit used a separate clean worktree.
- Audit scope: source-only. No product code, schema, API, deploy, save/version/CAS, or cache config changes were made.

## 2. GSD proof

- `gsd`: unavailable.
- `gsd-sdk`: `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`
- `gsd-sdk --version`: `gsd-sdk v0.1.0`
- `gsd-sdk query init.phase-op audit/app-runtime-update-and-stale-client-refresh-v1`: completed.
- Limitation: `.planning` and GSD agents were not installed in this worktree (`agents_installed: false`), so the contour continued by GSD discipline.

## 3. Source map

| Area | File/function | Current behavior | Gap |
| --- | --- | --- | --- |
| App version source | `frontend/src/config/appVersion.js:1-5` | `appVersionInfo.currentVersion` is the human app version; current value is `v1.0.62`. | This is static source bundled into the frontend, not a runtime served-version source. |
| App version in bundle | `frontend/vite.config.js:58-61` | Vite defines `import.meta.env.VITE_APP_VERSION` from `appVersionInfo.currentVersion`. | Frontend can know its own bundled version, but not whether server has newer runtime without a comparable endpoint. |
| App version UI | `frontend/src/components/AppShell.jsx:1-6`, `23-35`, `313-317` | App shell imports `appVersionInfo`, renders updates page and footer link `Версия {appVersionInfo.currentVersion}`. | Surface is changelog/display only; no stale-client detection. |
| Runtime meta endpoint | `backend/app/_legacy_main.py:211-222`, `6783-6802`; `frontend/src/lib/api.js:56-60`; `frontend/src/App.jsx:992-999` | `/api/meta` exists, is public, and returns `api_version`, features, and Redis status. Frontend calls it only as API health check. | It does not expose `app_version`, `build_id`, `git_sha`, or `min_supported_frontend_version`. |
| Build id / git sha | `frontend/vite.config.js:21-24`, `26-56`, `64-73`; `frontend/src/features/telemetry/telemetryClient.js:7-8` | Stage deploy fingerprint may be embedded as a JS banner comment when `.stage-deploy-fingerprint.json` exists. Telemetry reads `VITE_GIT_SHA` if present. | Build identity is not available via runtime API. `VITE_GIT_SHA` is not defined in source config, so it depends on external env if used. |
| Cache headers | `Dockerfile.gateway.prod:1-14`; `deploy/nginx/default.conf:25-31`; `deploy/nginx/default.prod.internal.conf:25-31`; `deploy/nginx/default.prod.tls.conf:53-59` | Built assets are served from nginx. `/assets/` has `Cache-Control: public, max-age=31536000, immutable`. SPA fallback serves `/index.html`. | No explicit `Cache-Control: no-cache` or equivalent for `index.html`/root fallback in source nginx configs. Index caching is unproven/unsafe for stale-client prevention. |
| Service worker | `frontend/package.json:15-30`; source search for `serviceWorker`, `navigator.serviceWorker`, `workbox`, `registerSW`, `vite-plugin-pwa` | No service worker registration or PWA plugin was found. | Stale clients are likely browser/index-cache/runtime-open-tab issues, not service-worker cache issues. |
| ProcessStage dirty state | `frontend/src/features/process/stage/orchestration/state/useProcessStagePanelState.js:1-32`; `frontend/src/components/ProcessStage.jsx:1041-1048` | ProcessStage tracks `saveDirtyHint` and derives `leaveNavigationRisk` from session save snapshot and upload state. | Dirty model is ProcessStage-local; app-wide update UI must query or receive this state instead of guessing. |
| Leave guard | `frontend/src/features/process/navigation/leaveNavigationGuardModel.js:15-78` | Guard classifies saving, conflict, dirty, failed, stale, and unsaved states as unsafe with user-facing copy. | Existing guard is navigation-focused, not app-update-focused, but can be reused for update confirmation/copy. |
| Save/flush before leave | `frontend/src/features/process/navigation/processLeaveFlushController.js:22-24`, `62-118`; `frontend/src/components/ProcessStage.jsx:5188-5200` | `flushProcessStageBeforeLeave` skips clean sessions, otherwise flushes active BPMN/XML tab via `bpmnSync.flushFromActiveTab` with bounded waits. ProcessStage registers the listener. | Feasible foundation for "save and refresh", but source/reason is currently `leave_to_project`; update refresh should use a distinct reason to avoid telemetry/causality confusion. |
| Manual save path | `frontend/src/components/ProcessStage.jsx:1875-1888`; `frontend/src/features/process/hooks/useBpmnSync.js:235-318`, `452-529` | Manual save and active-tab flush already save modeler/XML paths and handle pending/error outcomes. Lifecycle flush skips no-dirty deltas. | Safe refresh must respect failed/conflict/pending outcomes and must not force reload on failure. |
| Remote/session refresh toast | `frontend/src/components/ProcessStage.jsx:1231-1251`, `6231-6246`; `frontend/src/features/process/stage/ui/ProcessSaveAckToast.jsx:25-297` | Remote update toast supports persistent action; applying remote refresh refuses local dirty/saving/conflict state. | This is a session-update surface, not a global app-update banner. Reusing it for app runtime update would mix concerns. |
| Critical update handling | No current `min_supported_frontend_version` source in `/api/meta` or app config. | There is no source-backed way to distinguish normal update from incompatible/critical update. | Requires runtime meta contract before critical update modal can be implemented safely. |

## 4. Current app version/runtime meta model

Current source of truth:

- Human app version lives in `frontend/src/config/appVersion.js` as `appVersionInfo.currentVersion`.
- Vite embeds that value into the bundle as `import.meta.env.VITE_APP_VERSION`.
- The visible application footer and `#updates` page render from the same frontend config.

Runtime gap:

- `/api/meta` exists and is already lightweight/public enough for polling, but it is backend/API status metadata only.
- It does not return the frontend version being served, build id, resolved git SHA, deploy fingerprint, or minimum supported frontend version.
- A client can know "I am bundle v1.0.62", but cannot know "the server now serves v1.0.63/build X" from the current source model.

## 5. Cache/deploy behavior

Current source proof:

- Production gateway builds the frontend with `npm run build` and copies `frontend/dist` into nginx.
- `/assets/` responses are configured as immutable for one year, which is correct for Vite hashed JS/CSS assets.
- The SPA fallback serves `/index.html` through `location /`, but source nginx configs do not set explicit no-cache headers for index/root fallback.
- No service worker was found.

Implication:

- If Vite emits hashed assets, ordinary reload should be enough once the browser fetches a fresh `index.html`.
- Hard refresh is not the first-line product behavior. It should only be a documented fallback if runtime/header proof shows browsers keep a stale index despite correct cache headers.
- The implementation contour should first make index cache behavior explicit and prove it with headers on stage/prod.

## 6. Dirty/save guard model

Strongly guarded today:

- BPMN/modeler state through `bpmnSync.flushFromActiveTab`.
- XML draft state through `saveFromXmlDraft` and `hasXmlDraftChanges`.
- Save conflict/stale/failed/saving state through `deriveLeaveNavigationRisk`.
- Remote session refresh already refuses to apply when local state is unsafe.

Feasible safe refresh path:

1. Detect update availability outside ProcessStage.
2. If no active ProcessStage or no dirty/unsafe state, offer `Обновить`.
3. If active ProcessStage is dirty, saving, stale, failed, or conflicted, offer `Сохранить и обновить` and reuse a ProcessStage-provided safe flush API.
4. If flush returns failed/conflict/pending timeout, do not reload. Show a conflict/error state.
5. If flush succeeds or the session is clean, call ordinary `window.location.reload()`.

States that must not be lost:

- BPMN XML/modeler draft.
- Process properties/meta persisted through session save.
- XML tab edits.
- In-progress save/conflict state.
- Discussion/comment composer drafts, DOC/Markdown drafts, template form drafts, clipboard/selection state are less clearly guarded in the audited source and should block automatic refresh by policy unless the user explicitly confirms.

## 7. UX proposal

Normal update, no dirty state:

- Copy: `Доступна новая версия ProcessMap.`
- Action: `Обновить`
- Behavior: ordinary reload after user click.

Normal update, dirty ProcessStage state:

- Copy: `Доступна новая версия ProcessMap. Сохраните изменения перед обновлением.`
- Actions: `Сохранить и обновить`, `Позже`
- Behavior: run safe flush first; reload only after confirmed success.

Critical update:

- Copy: `Требуется обновить ProcessMap для продолжения работы.`
- Action: `Сохранить и обновить`
- Behavior: modal or blocking banner only when runtime meta exposes a compatible `min_supported_frontend_version` decision. Still do not discard dirty state.

Save conflict:

- Copy: `Не удалось безопасно обновить приложение: есть конфликт сохранения.`
- Behavior: no reload; point user to existing conflict resolution surface.

Placement:

- Use a global app-level banner/notice near the shell/top-level chrome, not ProcessStage remote-save toast and not transient save/process toasts.
- In ProcessStage, the banner may delegate "save and refresh" to the existing ProcessStage save/flush contract.

## 8. Verdicts

| Verdict | Evidence | Implication | Recommended fix |
| --- | --- | --- | --- |
| `APP_VERSION_SOURCE_EXISTS` | `frontend/src/config/appVersion.js:1-5`; `frontend/vite.config.js:58-61`; `AppShell.jsx:313-317` | Bundle has a stable human app version and displays it. | Reuse as `frontend_app_version`; keep changelog source single. |
| `RUNTIME_BUILD_ID_MISSING` | `/api/meta` returns only `api_version`, features, Redis status (`backend/app/_legacy_main.py:6783-6802`). | Frontend cannot compare current bundle against deployed build. | Add runtime meta fields: `app_version`, `build_id`, `git_sha`, `deployed_at` if available. |
| `API_META_EXISTS_OR_MISSING` | `/api/meta` is public (`AUTH_PUBLIC_PATHS`) and wrapped by `apiMeta()`. | Good endpoint shape exists for lightweight polling. | Extend existing endpoint rather than adding duplicate meta endpoint. |
| `GIT_SHA_NOT_EXPOSED` | Telemetry reads `VITE_GIT_SHA`, but Vite config only defines `VITE_APP_VERSION`; `/api/meta` omits git SHA. | Runtime diagnosis cannot prove exact deployed commit from client. | Inject git SHA/build id at build/deploy and expose it via `/api/meta`. |
| `INDEX_CACHE_HEADERS_SAFE_OR_UNSAFE` | Assets have immutable cache headers; `location /` lacks explicit index cache headers in nginx configs. | Users may keep stale `index.html`, so reload may not always fetch new bundle. | Add/prove `Cache-Control: no-cache` or equivalent for `index.html` and SPA fallback. |
| `HARD_REFRESH_NOT_REQUIRED_OR_REQUIRED` | No service worker; assets are hashed/immutable; stale risk is index/runtime-open-tab. | Hard refresh is not required by source as a default UX. | Prefer ordinary reload after safe save; keep hard refresh as support fallback only if header proof fails. |
| `PROCESS_STAGE_DIRTY_GUARD_EXISTS` | `saveDirtyHint`, `deriveLeaveNavigationRisk`, `saveUploadStatus`, `sessionSaveReadSnapshot` are wired in ProcessStage. | App-update UI can be dirty-aware instead of blind. | Expose a small ProcessStage update-safety/flush adapter to app shell. |
| `SAFE_SAVE_BEFORE_RELOAD_FEASIBLE` | `flushProcessStageBeforeLeave` and `bpmnSync.flushFromActiveTab` already provide bounded flush behavior. | "Сохранить и обновить" can be implemented without changing CAS semantics. | Generalize leave flush with an `app_update_refresh` reason and strict failure handling. |
| `AUTO_RELOAD_UNSAFE_DURING_EDITING` | Dirty/conflict/saving states exist and remote refresh already refuses unsafe local state. | Silent reload can lose edits or worsen conflicts. | No auto-refresh. Always user-initiated; critical update still saves first. |
| `UPDATE_BANNER_FEASIBLE` | `apiMeta()` exists and AppShell has global chrome. | A frontend-only banner is feasible once `/api/meta` exposes comparable runtime version/build data. | Add polling with backoff and a single app update banner. |
| `CRITICAL_UPDATE_MODAL_REQUIRES_MIN_SUPPORTED_VERSION` | No `min_supported_frontend_version` exists in meta/source. | Critical vs normal update cannot be source-backed today. | Add `min_supported_frontend_version` to runtime meta before implementing critical modal. |

## 9. Recommended implementation stack

1. `backend/app-runtime-meta-build-id-v1`
   - Extend `/api/meta` with `app_version`, `build_id`, `git_sha`, and `min_supported_frontend_version`.
   - Keep endpoint lightweight and cache-safe.
   - Do not change deploy workflow in the same PR unless needed only to inject build identity.

2. `uiux/app-update-available-banner-v1`
   - Frontend polls `/api/meta` at a low frequency with backoff.
   - Compare bundled `VITE_APP_VERSION/build_id` against served meta.
   - Show a global `Доступна новая версия ProcessMap.` banner.
   - No auto reload.
   - Do not reuse ProcessStage remote-save toast.

3. `feature/app-safe-save-and-refresh-v1`
   - Add a ProcessStage adapter for update safety and safe flush.
   - Reuse `deriveLeaveNavigationRisk` and `flushFromActiveTab`.
   - Add distinct source/reason such as `app_update_refresh`.
   - Reload only after clean or successful flush; block on conflict/failure.

4. `ops/frontend-cache-headers-runtime-proof-v1`
   - Add/prove explicit no-cache behavior for `/index.html` and SPA fallback.
   - Keep hashed assets immutable.
   - Verify ordinary reload receives new index and new hashed assets after deploy.
   - Escalate to hard refresh guidance only if runtime proof shows ordinary reload cannot be made reliable.

## 10. Validation plan

Runtime/update:

- Build with known `app_version`, `build_id`, `git_sha`.
- Open old client, deploy newer build.
- Confirm old bundle polls `/api/meta` and detects newer served build.
- Confirm no banner when versions/build ids match.
- Confirm normal update banner reloads with ordinary `window.location.reload()`.
- Confirm critical modal appears only when `client_version < min_supported_frontend_version`.

Cache:

- Verify headers for `/`, `/index.html`, and a deep SPA route.
- Verify headers for `/assets/*.js` and `/assets/*.css`.
- After deploy, verify ordinary reload fetches new index and references new hashed assets.
- Confirm no service worker controls the page.

ProcessStage safe refresh:

- Dirty modeler draft: `Сохранить и обновить` saves then reloads.
- Dirty XML draft: saves then reloads.
- Clean session: reloads without extra write.
- Saving in progress: waits or blocks according to guard.
- Conflict/save failed/stale: no reload, show conflict/error copy.
- Existing manual save, remote update toast, save/version/CAS flows unchanged.

## 11. Final conclusion

The application already has a frontend app-version source and enough ProcessStage dirty/save primitives to make a safe update UX possible. The missing single truth is runtime build identity: `/api/meta` exists but does not expose app version, build id, git SHA, or minimum supported frontend version. Cache source also needs proof because nginx config makes hashed assets immutable but does not explicitly prevent stale `index.html`.

Recommended path: first expose runtime build metadata, then add a global user-initiated update banner, then wire ProcessStage-safe `Сохранить и обновить`, and finally prove cache headers. Do not auto-refresh users during editing, and do not hard refresh by default.
