# Runtime Proof — :5177

## Проверка

### 1. Git / checkout

```
pwd: /opt/processmap-test
branch: release/consolidation-pr-weekly-v1
HEAD: dac5b98a2758817a236ce7294f3147240f0edef3
origin/main: e0fe6047404cce4729ee579ea7054da11183f8da
```

### 2. Изменённые файлы

```
frontend/src/styles/app/02/02-06-bpmn-dark-theme.css
```

### 3. Сборка

```bash
cd /opt/processmap-test/frontend && npm run build
```

- ✅ Завершилась без ошибок.
- ✅ `dist/assets/index-5Y2ZzVWA.css` содержит новые правила.

### 4. Развёртывание на :5177

```bash
docker cp /opt/processmap-test/frontend/dist/index.html processmap-test-gateway-1:/usr/share/nginx/html/index.html
docker cp /opt/processmap-test/frontend/dist/assets/. processmap-test-gateway-1:/usr/share/nginx/html/assets/
```

- ✅ Контейнер `processmap-test-gateway-1` обновлён.

### 5. HTTP-ответ :5177

```bash
curl -I http://localhost:5177/
```

```
HTTP/1.1 200 OK
Server: nginx/1.27.5
Content-Type: text/html
Cache-Control: no-cache, no-store, must-revalidate
```

### 6. Проверка bundle

```bash
curl -s http://localhost:5177/assets/index-5Y2ZzVWA.css | grep -oE "shape-rendering:[^;}]+|vector-effect:[^;}]+" | sort | uniq -c
```

Результат:
```
      1 shape-rendering:crispEdges
      4 shape-rendering:geometricPrecision   ← из diagram-js.css (UI outlines)
      1 shape-rendering:optimizeSpeed
      1 vector-effect:non-scaling-stroke
```

- ✅ `optimizeSpeed` присутствует.
- ✅ `crispEdges` присутствует.
- ✅ `vector-effect: non-scaling-stroke` присутствует.

### 7. Проверка index.html

```bash
docker exec processmap-test-gateway-1 cat /usr/share/nginx/html/index.html
```

```html
<link rel="stylesheet" crossorigin href="/assets/index-5Y2ZzVWA.css">
```

- ✅ `index.html` ссылается на актуальный CSS-hash.

---

## Вердикт

:5177 **отдаёт текущий build** с применёнными CSS-изменениями.
