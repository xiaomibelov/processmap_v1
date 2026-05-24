# REPLAN NOTE — feature/process-analytics-hub-and-registry-navigation-v1

**Дата:** 2026-05-17  
**Run ID:** 20260517T084454Z-64313  
**Причина replan:** исправление архитектурной ошибки в 4-agent workflow.

---

## Что было неправильно в предыдущем плане

1. **Agent 3 (Worker 3) получил зависимую задачу:** «Validate the Analytics Hub implementation from Worker 2.»
2. **Worker 3 был вынужден ждать WORKER_2_DONE.** В prompt явно требовалось читать WORKER_2_REPORT.md и инспектировать изменения Worker 2.
3. **Создан глобальный EXEC_BLOCKED.md**, который блокировал запуск Worker 3 до завершения Worker 2.
4. **Валидация реализации была отдана Agent 3 вместо Agent 4.**

Это нарушает принцип параллельных независимых worker'ов в 4-agent модели.

---

## Правильная архитектура 4-agent workflow

```
Agent 1 / Planner
  ↓
Agent 2 / Worker + Agent 3 / Worker   ← параллельно, независимо
  ↓
Agent 4 / Reviewer                    ← финальная валидация обоих
```

- **Worker 2** выполняет Work Package A (implementation lane).
- **Worker 3** выполняет Work Package B (independent UX/data-safety lane).
- **Agent 4** выполняет final review после обоих маркеров.

---

## Что изменено в исправленном плане

1. **Worker 3 prompt полностью переписан.** Убраны все фразы:
   - «validate Worker 2 implementation»
   - «wait for WORKER_2_DONE»
   - «after Worker 2»
   - «depends on Worker 2»
   - «review Worker 2»
   - «read WORKER_2_REPORT.md»

2. **Worker 3 работает независимо.** Он инспектирует исходный код продукта напрямую, готовит UX/data-safety отчёты и чеклист для Agent 4. Он не ждёт реализации Worker 2.

3. **Валидация реализации передана только Agent 4.** Только Agent 4 может проверить результаты Worker 2 после появления обоих маркеров.

4. **Глобальный EXEC_BLOCKED.md объявлен устаревшим.** Для этого контура используются только part-specific маркеры:
   - `EXEC_PART_1_BLOCKED.md` — для Worker 2
   - `EXEC_PART_2_BLOCKED.md` — для Worker 3

5. **Stale global EXEC_BLOCKED.md** переименован в `EXEC_BLOCKED.stale-before-worker2-done.20260517T083846Z.md` и не блокирует workflow.

---

## Текущее состояние контура

- **Worker 2:** УЖЕ ЗАВЕРШЁН (WORKER_2_DONE существует). Реализация Analytics Hub выполнена.
- **Worker 3:** НЕ ЗАПУЩЕН. Необходимо независимое выполнение Work Package B.
- **Agent 4:** ОЖИДАЕТ обоих маркеров (WORKER_2_DONE + WORKER_3_DONE).

---

## Вывод

План исправлен. Worker 3 получает независимый пакет работ. Agent 4 получает единственное право финальной валидации. Глобальный EXEC_BLOCKED.md не используется.
