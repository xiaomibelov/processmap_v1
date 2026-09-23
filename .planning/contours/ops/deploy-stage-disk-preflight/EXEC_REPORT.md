# EXEC_REPORT — ops/deploy-stage-disk-preflight

Дата: 2026-09-23. Исполнитель: агент (ops-контур, APPROVED владельцем).

## Что сделано
Добавлен step `Disk preflight on stage host` в job `deploy` workflow `.github/workflows/deploy-stage.yml`, непосредственно перед шагом `Deploy to stage server`.

## Как ходит workflow на хост (исследование)
- Единственный способ доступа: `appleboy/ssh-action@v1.0.3` с secrets `STAGE_HOST`, `STAGE_USER`, `STAGE_SSH_KEY` (шаг `Deploy to stage server`). Значения секретов не логировались и не копировались.
- Новый шаг переиспользует тот же action/версию/secrets — новых способов доступа не добавлено. `command_timeout: 1m` (деплойный шаг использует 20m).

## Добавленный шаг (логика)
```yaml
- name: Disk preflight on stage host
  uses: appleboy/ssh-action@v1.0.3
  with:
    host: ${{ secrets.STAGE_HOST }}
    username: ${{ secrets.STAGE_USER }}
    key: ${{ secrets.STAGE_SSH_KEY }}
    command_timeout: 1m
  script: |
    set -euo pipefail
    MIN_FREE_KB=5242880  # 5 GiB
    avail_kb="$(df -k / | awk 'NR==2 {print $4}')"
    ...
    if [ "${avail_kb}" -lt "${MIN_FREE_KB}" ]; then
      echo "::error::Диск stage-хоста заполнен: свободно ${avail_kb} KiB, требуется >= 5G. Запусти cleanup-скрипт или дождись cron */30 (retention-cleanup), затем повтори деплой." >&2
      exit 1
    fi
```
Проверяется корневая ФС (`/`), т.к. оба инцидента ENOSPC — заполнение диска хоста; stage checkout живёт в `/opt/processmap/stage/app` на той же ФС.

## Верификация (TDD неприменим к CI-конфигу — фиксирую аналоги)
1. **YAML-валидация:** `python3 -c 'import yaml; yaml.safe_load(...)'` → `YAML OK` (см. `evidence/yaml-check.log`).
2. **Dry-run логики гейта** — команда ровно та, что выполнится на хосте:
   - `df -k / | awk 'NR==2 {print $4}'` → avail в KiB.
   - avail=6000000 KiB (~5.7G) → `GATE PASS`, деплой продолжится.
   - avail=4000000 KiB (~3.8G) → `GATE FAIL (exit 1)`, сообщение про cleanup/cron */30.
   - Реальный прогон на dev-машине: `df -k / | awk 'NR==2 {print $4}'` → 286712288 KiB (команда валидна).
3. **Diffstat:** `1 file changed, 22 insertions(+), 0 deletions` (см. `evidence/deploy-stage.diff`).

## Git-proof
- Branch: `ops/deploy-stage-disk-preflight` (от `origin/main` = 16f7c186).
- Worktree: `.wt-disk-preflight` (в `.git/info/exclude`, дерево не пачкается).
- Product code: backend-diff = 0, frontend-diff = 0.

## Ограничения / что НЕ делал
- Не менял другие шаги workflow, не трогал product code.
- Никаких действий на хостах (только чтение workflow).
- Merge не выполнялся — только PR.
