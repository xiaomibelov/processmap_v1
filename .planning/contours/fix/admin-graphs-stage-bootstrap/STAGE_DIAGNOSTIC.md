# Stage diagnostic checklist — fix/admin-graphs-stage-bootstrap

## Цель

Понять, почему на stage нет снапшота графа, и выбрать способ создания первого снапшота.

## Команды для запуска на stage

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/processmap/app"
GRAPHS_DIR="$APP_DIR/graphify-out"

echo "=== OS / Python ==="
uname -a
python3 --version || echo "python3 not found"
which python3 || echo "no python3 in PATH"

echo "=== App checkout ==="
cd "$APP_DIR"
git rev-parse HEAD
git status -sb
git log -1 --pretty="%h %s"

echo "=== Graphify files ==="
ls -la "$APP_DIR/tools/graphify-render-graph.py" || echo "graphify-render-graph.py missing"
ls -la "$APP_DIR/tools/graphify-semantic-config.json" || echo "graphify-semantic-config.json missing"

echo "=== Graph storage ==="
ls -la "$GRAPHS_DIR" || echo "graphify-out missing"
ls -la "$GRAPHS_DIR/snapshots" 2>/dev/null || echo "snapshots dir missing"

echo "=== Write test ==="
if touch "$GRAPHS_DIR/.write_test" 2>/dev/null; then
  rm "$GRAPHS_DIR/.write_test"
  echo "write OK"
else
  echo "write FAILED"
fi

echo "=== Python deps (graphify) ==="
python3 -c "import sys; print(sys.path)"
python3 -c "import networkx" 2>/dev/null && echo "networkx OK" || echo "networkx MISSING"
python3 -c "import community" 2>/dev/null && echo "community OK" || echo "community MISSING"
python3 -c "import sklearn" 2>/dev/null && echo "sklearn OK" || echo "sklearn MISSING"

echo "=== Container runtime ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | head -20 || echo "docker not available"

echo "=== Env hints ==="
env | grep -E 'GRAPHS_DIR|PYTHONPATH|APP_DIR' || echo "no relevant env vars"
```

## Следующий шаг

После получения вывода:
1. Если пайплайн работает — запустить `POST /api/admin/graphs/rebuild` и дождаться `success`.
2. Если пайплайн не работает — залить локальный снапшот как initial snapshot.
