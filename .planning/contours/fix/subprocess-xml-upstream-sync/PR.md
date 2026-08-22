# PR — fix/subprocess-xml-upstream-sync

## Что сделано

Синхронизация child BPMN XML обратно в parent при сохранении sub-процесса.

## Изменения

- `backend/app/services/bpmn_navigation.py`: `re_embed_child_xml_into_parent`.
- `backend/app/_legacy_main.py`: `session_bpmn_save` обновляет parent XML и
  возвращает `parent_synced`.
- `frontend/src/App.jsx`: `onSessionSync` инвалидирует parent cache после child save.
- `backend/tests/test_subprocess_navigation.py`: regression test.

## Как проверить

1. Открыть процесс с embedded `<bpmn:subProcess>`.
2. Перейти в sub-процесс, добавить элемент, сохранить.
3. Вернуться к parent / export parent BPMN.
4. Убедиться, что fragment sub-процесса содержит добавленный элемент.

## Тесты

```bash
cd backend
.venv/bin/python -m pytest tests/test_subprocess_navigation.py -v

cd ../frontend
node --test src/app/sessionRouteOrchestration.test.mjs
npm run build
```

- Backend: 7/7 PASS
- Frontend unit tests: 13/13 PASS
- Build: OK

## Риски

- Race при одновременном редактировании parent и child (parent lock не добавлен).
- callActivity не inline'ится (expected).

## Merge / Deploy

**Не merge'ить и не деплоить без explicit approve.**
Prod не трогаем, тесты на stage.processmap.ru.
