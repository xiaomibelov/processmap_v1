set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
git tag -a "cp/step_02_start_${TS}" -m "checkpoint: step_02 start (${TS})" >/dev/null 2>&1 || true

echo "== git =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true

BR="$(git branch --show-current)"
if [ "$BR" != "feat/mvp-runner-v1" ]; then
  echo "wrong branch: $BR"
  false
fi

if [ -n "$(git status --porcelain)" ]; then
  git stash push -u -m "wip: before step_02 fix docker build"
fi

mkdir -p workspace/processes
: > workspace/.keep
: > workspace/processes/.keep

cat > Dockerfile <<'EOF'
FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend

RUN mkdir -p /app/workspace/processes /app/workspace/.session_store

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
EOF

echo "== diff stat =="
git diff --stat || true

git add -A
git status -sb || true
git commit -m "fix: make docker build independent of workspace dir" || true

TS2="$(date +%F_%H%M%S)"
git tag -a "cp/step_02_done_${TS2}" -m "checkpoint: step_02 done (${TS2})" >/dev/null 2>&1 || true

echo "== docker compose build =="
docker compose build

echo "== docker compose up -d =="
docker compose up -d

echo "== ps =="
docker compose ps

HOST_PORT="$(grep -E '^HOST_PORT=' .env | head -n1 | cut -d= -f2)"
echo "== probe =="
curl -sS "http://127.0.0.1:${HOST_PORT}/" | head -n 15 || true

echo "== done =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true
echo "Open: http://localhost:${HOST_PORT}/"
