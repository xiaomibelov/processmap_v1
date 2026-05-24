# Runtime Navigation — Analytics Hub

**Контур:** `feature/process-analytics-hub-and-registry-navigation-v1`  
**Цель:** Как добраться до целевой поверхности в runtime.

---

## Прямой URL

```
http://clearvestnic.ru:5180/app?surface=analytics
```

## Через UI

1. Открыть `http://clearvestnic.ru:5180/app`
2. В workspace sidebar нажать «Аналитика» (бывшая кнопка «Реестр действий»).
3. Или в project pane нажать «Аналитика».

## Проверка registry из Hub

1. На странице Analytics Hub нажать «Открыть» на карточке «Реестр действий».
2. URL должен измениться на `?surface=product-actions-registry&return_to=analytics`.
3. Закрытие registry должно вернуть на `?surface=analytics` (или в workspace, если return_to не реализован).

## Проверка close/back

1. На Analytics Hub нажать «Закрыть» или browser back.
2. Должен произойти переход к workspace/project/session без user trap.

## Health checks

```bash
curl -s http://clearvestnic.ru:8088/health
curl -I http://clearvestnic.ru:5180
curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"
```
