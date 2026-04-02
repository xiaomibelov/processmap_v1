set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
git tag -a "cp/step_03_diag_start_${TS}" -m "checkpoint: step_03 diag start (${TS})" >/dev/null 2>&1 || true

echo "== git =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true
echo "branch=$(git branch --show-current)"

echo "== docker compose ps =="
docker compose ps || true

CID="$(docker compose ps -q app || true)"
echo "container_id=$CID"

if [ -n "$CID" ]; then
  echo "== docker inspect state =="
  docker inspect --format='state={{.State.Status}} running={{.State.Running}} restart_count={{.RestartCount}} started_at={{.State.StartedAt}} finished_at={{.State.FinishedAt}} exit_code={{.State.ExitCode}} error={{.State.Error}}' "$CID" || true
fi

echo "== logs (tail 200) =="
docker compose logs --tail=200 app || true

echo "== try import app inside container =="
docker compose exec -T app python -c "import backend.app.main as m; print('import ok', m.app.title)" || true

echo "== try http request inside container (urllib) =="
docker compose exec -T app python -c "import urllib.request as u; print(u.urlopen('http://127.0.0.1:8000/', timeout=5).status)" || true

HOST_PORT="$(grep -E '^HOST_PORT=' .env | head -n1 | cut -d= -f2)"
echo "== host curl =="
curl -v "http://127.0.0.1:${HOST_PORT}/" 2>&1 | head -n 60 || true

TS2="$(date +%F_%H%M%S)"
git tag -a "cp/step_03_diag_done_${TS2}" -m "checkpoint: step_03 diag done (${TS2})" >/dev/null 2>&1 || true

echo "== done =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true
