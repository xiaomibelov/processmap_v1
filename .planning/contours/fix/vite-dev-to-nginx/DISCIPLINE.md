# Discipline — fix/vite-dev-to-nginx

## Тип: fix (infra)
- Ветка: `fix/vite-dev-to-nginx`
- Минимальный патч + smoke-test + PR на русском
- **NO merge/deploy без explicit approve пользователя**

## 5-Plane Proof
1. Audit: бэклог #5, dev-сервер не production-ready
2. Plan: PLAN.md с шагами 1–5, утверждён пользователем
3. Patch: Dockerfile, nginx.conf, docker-compose, env handling
4. Test: smoke-test 5 пунктов (curl, SPA fallback, UI, HMR отсутствие)
5. Deploy: PR на русском, merge после approve

## Workflow
1. Preflight: RAG через `tools/rag/pm-rag-agent-preflight.mjs`
2. Planning: PLAN.md → approve
3. Implementation: патч в ветке `fix/vite-dev-to-nginx`
4. Test: smoke-test на стенде `clearvestnic.ru:5177`
5. Review: проверка PATCH.md + TESTS.md
6. Mirror: `tools/pm-agent-mirror-report.sh` → Obsidian
7. Merge: только после explicit approve

## Запрещено
- Merge без approve
- Deploy без smoke-test
- Оставлять стенд недоступным >5 минут
