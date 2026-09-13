# PR — fix/reglament-sync-rag-automation

## Что и зачем
Аудит регламента от 2026-09-13 нашёл расхождения регламента с реальностью
и отсутствие автоматической RAG-инициализации задачи. Контур чинит только
регламент и agent-tooling — **product code не затронут**.

## Изменения

### `AGENTS.md` (регламент)
- **§5**: пути Obsidian (canonical `/srv/obsidian/project-atlas/ProcessMap` =
  сервер; рабочий mirror — `server-backup/srv/obsidian/project-atlas/`),
  mirror только скриптом; правило точечного чтения.
- **§10 (новый)**: обязательный шаг 3 цепочки —
  `bash tools/rag/pm-task-init.sh --role <роль> --contour <контур> --task "<описание>"`.
  Прямой вызов preflight вручную — только для отладки.
- **§11 (новый)**: локальная инфраструктура — контейнеры `processmap_v1-*`
  (устаревшее имя `app-frontend-1` исключено), порты :5177/:8011,
  PROD healthcheck: `curl ... https://processmap.ru/` == 200
  (мёртвый пункт про `clearvestnic.ru:5177` не восстанавливается — домен
  выведен навсегда, §1.5).
- **§12 (новый)**: «Токен-экономия» — shell-first, файлы >120 строк только
  через outline, отчёты/mirror только скриптами, запрет дублирования вывода,
  проверка командой вместо рассуждения.
- **§13 (новый)**: бэклог — `feature/admin-health-dashboard` перенесён в
  бэклог по параметру владельца (не инициализирован; активация — отдельным
  approve).

### `tools/rag/pm-task-init.sh` (новый)
Обёртка RAG-инициализации задачи (shell + python3, ноль LLM-токенов):
- свежесть индекса по mtime источников (`processmap-rag-sources.local.json`):
  битый/отсутствующий индекс → полный rebuild; изменившиеся источники →
  reindex + счётчик; иначе `index fresh`;
- health-check индекса после индексации;
- дайджест ≤ 40 строк: статус + топ-10 чанков `score | путь | заголовок`
  без текста чанков; exit 0 / ненулевой + одна строка причины.
- `pm-rag-agent-preflight.mjs` не изменён (у него зашит DEFAULT_INDEX без
  `--index`, поэтому health/digest выполняются через `pm-rag-search.mjs`
  по тому же индексу).

### `tools/pm-agent-mirror-report.sh`
- `ROOT`/`VAULT` переопределяются env (`PM_MIRROR_ROOT`/`PM_MIRROR_VAULT`) —
  mirror стал работоспособен на локальной машине (раньше hardcode
  серверных путей давал MIRROR_SKIPPED).
- Генерация INDEX.md переведена с GNU-only `find -printf` на POSIX-цикл.

### `.gitignore`
- `.planning/contours/audit/` — audit-артефакты зеркалируются в Obsidian
  и не коммитятся. Перед этим все 30 audit-контуров промirrorены
  (`MIRROR_OK`, только копирование, ничего из Obsidian не удалялось).

## Чек-лист проверок (все выполнены)
- [x] `bash -n tools/rag/pm-task-init.sh` → OK
- [x] прогон pm-task-init.sh с тестовой задачей → exit 0, вывод 14 строк (≤ 40)
- [x] повторный прогон → `index fresh`, переиндексации нет
- [x] прогон с искусственно изменённым source → `reindexed: 1 changed file(s)`, exit 0
- [x] `grep -i clearvestnic AGENTS.md` → 1 совпадение: запрет в §1.5
      («домен выведен навсегда»). Пункт healthcheck'а clearvestnic:5177 в
      регламенте отсутствует. **Осознанное исключение из проверки «0
      совпадений»:** удаление запрета противоречило бы правилу workspace
      AGENTS.md §1.4 («любое упоминание — мусор, подлежащий удалению») и
      регрессировало бы дисциплину. Решение: запрет сохранён, упоминаний
      как адреса — ноль.
- [x] `grep app-frontend-1 AGENTS.md` → 0 совпадений
- [x] `git status` в worktree → чисто (изменения только контура);
      main checkout станет чистым после merge (правило gitignore проверено
      `git check-ignore`)
- [x] AGENTS.md и workspace-регламент консистентны: контуры, запреты,
      Obsidian-пути, домены — без противоречий

## Риски
- Полный rebuild индекса ~5 мин — pm-task-init.sh блокируется на это время
  при «протухшем» индексе.
- `rag-index/reindex.sh` (вне репо) скорректирован по лимитам памяти Docker VM
  (~8.3 GB): 2g manifest / 6g build. Без этого rebuild падал с OOM (exit 137).
- Merge только после явного approve владельца (§7). Deploy не выполнялся.
