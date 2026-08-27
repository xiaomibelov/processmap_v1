# PR — fix/llm-output-contract-residuals

## Что чинит

Панель processman показывала сырой JSON envelope (`{&quot;action&quot;:&quot;suggest-next&quot;,...}`) в ленте чата при smalltalk-запросах, которые LLM интерпретировал как processman-действия.

Root cause: `extractAnswerText` в `processmanView.js` обрабатывал только старые action-имена `suggest`/`explain`/`qa`, но не processman-аналоги `suggest-next`/`explain-step`/`step-qa`. Когда backend распознавал envelope и слал `event: action` с `action: "suggest-next"`, фронтенд извлекал пустую строку и затирал накопленный текст сообщения.

## Изменения

- `frontend/src/features/process/processman/processmanView.js`:
  - `extractAnswerText` теперь распознаёт `suggest-next`, `explain-step`, `step-qa` и извлекает `suggestions.candidates/note`, `explanation/note`, `answer/note` аналогично базовым action.
- `frontend/src/features/process/processman/processmanView.test.mjs`:
  - Добавлен unit-тест для новых action-типов.

## Проверка

```bash
cd frontend
docker run --rm -v "$(pwd):/ws" -w /ws node:20-alpine \
  node --test src/features/process/processman/processmanView.test.mjs \
              src/features/process/processman/processmanStream.test.mjs
```

Результат: 20/21 тестов проходят. Один pre-existing failure в `cleanAgentError` (ожидание устаревшего текста ошибки) не относится к контуру.

## Stage-факты

- `GET /agent/version` → `307effbb` (main после PR #843).
- S1 воспроизведён: сессия `13f1f10b20`, SSE-фреймы сохранены в `evidence/processman_sse_raw_envelope.txt`.
- S2 (AI_RESPONSE_PARSE_ERROR на «Анализ LLM») на stage не воспроизвёлся после PR #843.

## Что после merge

1. Задеплоить на stage.
2. Проверить в processman: smalltalk-запрос → нет сырого JSON, action event рендерится структурированно.
3. Если S2 повторится — собрать execution log и завести отдельный контур.

## Тип контура

`fix / llm-output-contract-residuals` — frontend-only, конфиги и БД не трогаем.
