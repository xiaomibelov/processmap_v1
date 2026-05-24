# RUNTIME_VERSION_PROOF — Доказательство версии на runtime

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Run ID:** `20260517T121105Z-76345`  
**Дата:** `2026-05-17`  
**Runtime:** `http://clearvestnic.ru:5180`

---

## Проверки

### 1. HTTP 200

```bash
curl -I http://clearvestnic.ru:5180/
```

Результат:
```
HTTP/1.1 200 OK
Cache-Control: no-cache, no-store, must-revalidate
```

### 2. Версия в footer

В интерфейсе отображается: **Версия v1.0.136**

### 3. build-info.json

```bash
curl -s http://clearvestnic.ru:5180/build-info.json
```

Результат:
```json
{
  "branch": "fix/lockfile-sync-test",
  "sha": "5b20bc2d1292f419647238eaf37dac55f9315942",
  "shaShort": "5b20bc2",
  "timestamp": "2026-05-17T13:29:31.536Z",
  "contourId": "uiux/product-actions-registry-inner-page-safe-redesign-v1",
  "dirty": true,
  "host": "clearvestnic.ru"
}
```

### 4. Свежие ассеты

index.html ссылается на: `index-CjS2Hgb4.js`

Старый сломанный ассет (`index-DD7asGo1.js`) **не отдаётся**.

### 5. Changelog

В footer видна запись:
> «Безопасный UI-редизайн страницы Реестра действий: исправлена визуальная иерархия, фильтры горизонтальны, метрики подняты, таблица доминирует, блок источника вторичен.»

---

**Вердикт:** версия `v1.0.136`, сборка свежая, ассеты обновлены.
