# PLAN — fix/reglament-sync-rag-automation

Дата: 2026-09-13. Контур: fix. Ветка: `fix/reglament-sync-rag-automation` от `origin/main` (26bbab34).

## Цель
Синхронизировать рабочий регламент (AGENTS.md репозитория) с фактическим
состоянием инфраструктуры (аудит 2026-09-13) и добавить shell-first
RAG-инициализацию задачи. Product code не затрагивается.

## Ход работы

### A. Синхронизация регламента (P0) — ✅
- AGENTS.md §5: добавлены пути Obsidian (canonical `/srv/obsidian/...` vs
  локальный mirror `server-backup/srv/obsidian/project-atlas/`) + правило
  точечного чтения.
- AGENTS.md §10 (новый): RAG-инициализация задачи через
  `bash tools/rag/pm-task-init.sh --role ... --contour ... --task ...`
  (заменяет прямой вызов preflight как шаг 3 цепочки).
- AGENTS.md §11 (новый): локальная инфраструктура — контейнеры
  `processmap_v1-*` (устаревшее `app-frontend-1` не используется), порты
  :5177/:8011, PROD healthcheck `https://processmap.ru/` == 200.
  (Закрывает и устаревшую ссылку «см. раздел 11» в §1.5.)
- AGENTS.md §12 (новый): «Токен-экономия» (shell-first, ≤120 строк,
  отчёты только скриптами, запрет дублирования, проверка командой).
- AGENTS.md §13 (новый): бэклог контуров — `feature/admin-health-dashboard`
  ПЕРЕНЕСЁН В БЭКЛОГ по параметру владельца (не инициализирован, активация
  отдельным approve).
- Запрет на `clearvestnic.ru` в §1.5 сохранён как запрет (расходится с
  проверкой «grep → 0» — см. PR.md, осознанное решение).

### B. Чистое дерево (P1) — ✅
- `tools/pm-agent-mirror-report.sh`: ROOT/VAULT переопределяются env
  (`PM_MIRROR_ROOT`/`PM_MIRROR_VAULT`); генерация INDEX.md переписана
  POSIX-портативно (был GNU-only `find -printf`, на macOS падал бы).
- Все 30 существующих audit-контуров промirrorены в Obsidian
  (`MIRROR_OK`, только копирование, ничего не удалено).
- `.gitignore`: добавлено `.planning/contours/audit/` (проверено через
  `git check-ignore`). После merge `git status` в canonical checkout
  станет чистым.

### C. pm-task-init.sh (P1) — ✅
- Создан `tools/rag/pm-task-init.sh` (~140 строк bash + python3).
- Свежесть индекса: отсутствующий/битый индекс → полный rebuild
  (`rag-index/reindex.sh`); sources новее индекса → reindex + счётчик
  изменённых файлов; иначе `index fresh`.
- Health-check: пробный BM25-запрос через `pm-rag-search.mjs` по рабочему
  индексу (preflight.mjs НЕ менялся; у него зашит DEFAULT_INDEX без
  опции `--index`, поэтому health/digest идут через pm-rag-search.mjs).
- Дайджест ≤ 40 строк: статус + топ-10 `score | путь | заголовок`
  без текста чанков; пути без префикса `/ws/`.
- Найдено и исправлено по пути: reindex.sh падал с OOM (exit 137) —
  Docker VM хоста ~8.3 GB, а лимиты контейнеров суммарно занимали 8g+.
  Лимиты снижены (2g manifest / 6g build, heap 5g) — rebuild проходит.
- Проверки: `bash -n` OK; прогон → exit 0, 14 строк; повторный прогон →
  `index fresh`; искусственно «протухший» source → `reindexed: 1 changed
  file(s)`, exit 0.

## Риски / ограничения
- `rag-index/reindex.sh` живёт вне репозитория (`kimi_PM/rag-index/`) —
  его правка (лимиты памяти) не входит в PR, зафиксирована здесь.
- Полный rebuild индекса ~5 минут — pm-task-init.sh на «протухшем»
  индексе блокируется на это время (ожидаемо).
- Регламент-сkills вне репо (`server-backup/root/.kimi/skills/processmap-agent/SKILL.md`,
  `processmap-test/.agents/skills/processmap-agents/SKILL.md`) синхронизируются
  отдельно (gitignored, в PR не входят).

## Proof
- branch: fix/reglament-sync-rag-automation @ origin/main (26bbab34)
- diffstat: AGENTS.md +92/-1, .gitignore +3, tools/pm-agent-mirror-report.sh ~+6/-3,
  tools/rag/pm-task-init.sh новый.
