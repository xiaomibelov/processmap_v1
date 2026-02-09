set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
git tag -a "cp/step_05_start_${TS}" -m "checkpoint: step_05 add favicon start (${TS})" >/dev/null 2>&1 || true

mkdir -p backend/app/static

python - <<'PY'
import base64, pathlib
ico_b64 = (
  "AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
)
p = pathlib.Path("backend/app/static/favicon.ico")
p.write_bytes(base64.b64decode(ico_b64 + "=="))
print("wrote", p)
PY

git add -A
git status -sb || true
git commit -m "chore: add favicon" || true

TS2="$(date +%F_%H%M%S)"
git tag -a "cp/step_05_done_${TS2}" -m "checkpoint: step_05 add favicon done (${TS2})" >/dev/null 2>&1 || true

echo "== done =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true
