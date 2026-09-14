# FIVE-PLANE PROOF — audit/dup-logic-audit-v1

## Plane 1 — code
- remote: `https://github.com/xiaomibelov/processmap_v1.git`
- baseline: `origin/main` @ `add38c240fbc48afc8bb1b92d40535ad3699c101`
  (2026-09-14T11:16:09Z, #976) — подтверждён двумя независимыми путями:
  `git fetch` + `git rev-parse origin/main` и GitHub API (`list_commits main`).
- Ветка контура: `audit/dup-logic-audit-v1` — содержит только файлы
  `.planning/contours/audit/dup-logic-audit-v1/*`. Product code не изменён.

## Plane 2 — workspace
- Рабочее дерево: `git archive origin/main` → 4 055 файлов,
  что в точности равно `git ls-tree -r origin/main | wc -l` = 4 055.
  Чистый экспорт без working-tree отклонений (`git status` чист на момент экспорта).
- Анализ выполнен на неизменённом снапшоте main; промежуточный checkout
  `fix/save-latency-subprocess-async` (d5982d3) для выводов не использовался.

## Plane 3 — DB
- Не применимо: статический аудит; runtime-БД не опрашивалась и не изменялась.
- Косвенно: выводы о live-пути опираются на код и compose, не на данные.

## Plane 4 — env/compose
- `docker-compose.yml` (в baseline): сервисы `agent` (context
  `./backend/services/agent`) и `notifications` (`./backend/services/notifications`)
  присутствуют и билдятся; `LLM_VIA_AGENT_SVC=${LLM_VIA_AGENT_SVC:-0}` —
  маршрутизация LLM-трафика в agent-svc **выключена по умолчанию**.
- Вывод о том, что live-путь agent-чата обслуживает монолитная копия,
  подтверждён импортами `routers/agent_chat.py:9-10`.

## Plane 5 — serving mode
- Аудит статический; утверждения «что реально отдаётся runtime» сделаны только
  там, где доказано кодом: монтирование роутеров (`routers/__init__.py`),
  значения env по умолчанию, импорты. Runtime-инструментация не выполнялась.
- Перед архитектурными решениями по P0 (выбор единственного источника истины
  для LLM-домена) обязателен живой прогон: сверка
  `GET /api/admin/graphs/snapshot/current/json` + проверка фактического значения
  `LLM_VIA_AGENT_SVC` на stage/prod (AGENTS.md §8.5).

## Git-proof
```text
remote:    https://github.com/xiaomibelov/processmap_v1.git
baseline:  origin/main = add38c240fbc48afc8bb1b92d40535ad3699c101 (2026-09-14)
branch:    audit/dup-logic-audit-v1
diff:      только .planning/contours/audit/dup-logic-audit-v1/ (6 файлов, новые)
```

## Handoff-proof
- Цель: полный аудит дублирующей логики — закрыта (клоны, AST-дубли, same-name,
  форк-дрейф, граф).
- Не закрыто: runtime-подтверждение live-пути LLM (нужен доступ к stage/prod env);
  семантическая близость при расходящемся тексте (вне scope статики).
- Риски: локально пересобранный граф ≠ официальный graphify-снапшот;
  метод задокументирован в PLAN.md, расхождение возможно в деталях communities.
