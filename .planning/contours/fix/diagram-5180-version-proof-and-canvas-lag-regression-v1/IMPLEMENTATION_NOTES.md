# IMPLEMENTATION_NOTES.md

## Files Changed

### New Files
1. `scripts/generate-build-info.mjs` (81 lines)
   - Reads git metadata via `git rev-parse`, `git branch`, `git diff --quiet`
   - Writes `frontend/src/generated/buildInfo.js`
   - Writes `frontend/public/build-info.json`
   - Supports `PROCESSMAP_CONTOUR_ID` env var

### Modified Files
1. `frontend/package.json`
   - Added `"prebuild": "node ../scripts/generate-build-info.mjs"` script

2. `frontend/.gitignore`
   - Added `src/generated`

3. `frontend/src/components/AppShell.jsx`
   - Imported `PROCESSMAP_BUILD_INFO` from `../generated/buildInfo.js`
   - Added `useEffect` to expose `window.__PROCESSMAP_BUILD_INFO__`
   - Added non-intrusive fixed-position badge (bottom-right, 10px, opacity 0.6)
   - Badge visible only for fix branches or `clearvestnic.ru:5180` host

4. `docker-compose.yml`
   - Added bind volume: `./frontend/dist:/usr/share/nginx/html:ro` to gateway service

## Rollback Steps

1. Delete `scripts/generate-build-info.mjs`
2. Revert `frontend/package.json` prebuild script
3. Revert `frontend/.gitignore`
4. Revert `frontend/src/components/AppShell.jsx` imports and badge code
5. Revert `docker-compose.yml` volume mount
6. `docker compose -p processmap_test up -d --no-deps gateway` to restore original behavior
