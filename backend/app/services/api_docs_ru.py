"""Русская обогащённая OpenAPI-спека ProcessMap (генерация на лету).

Источник — живой get_openapi() FastAPI (3.1); обогащение (правила идентичны
экспорту docs/openapi.yaml, PR #694): openapi 3.0.3, русские summary/description
операций и тегов, стандартные ответы 400/401/403/404/409/422, bearerAuth
глобально, публичные эндпоинты — security: []. Используется роутом
GET /api/openapi_ru.json (право уровня админки) для Swagger UI внутри SPA.
"""
from __future__ import annotations

import re
from typing import Any, Dict



# ---------------------------------------------------------------- метаданные
INFO = {
    "title": "Processmap API",
    "version": "1.0.141",
    "description": (
        "REST API ProcessMap — системы описания и исполнения технологических процессов "
        "роботизированных кухонь (BPMN-диаграммы, интервью-извлечение, TO BE-трансформация, "
        "LLM-помощники, отчёты, администрирование организаций).\n\n"
        "**Аутентификация**: JWT access token в заголовке `Authorization: Bearer <token>` "
        "(получение — `POST /api/auth/login`). Мультитенантность: активная организация "
        "передаётся заголовком `X-Org-Id` (необязателен, если у пользователя одна организация "
        "или выбрана активная).\n\n"
        "**Формат ошибок**: большинство доменных ошибок — `{\"detail\": {\"code\", \"message\"}}` "
        "с соответствующим HTTP-статусом; ошибки валидации FastAPI — HTTP 422.\n\n"
        "Интерактивный просмотр этой спеки также доступен на живом сервере: `/api/docs` (Swagger UI), `/api/redoc`."
    ),
    "contact": {"name": "ProcessMap"},
    "license": {"name": "Proprietary", "url": "https://processmap.ru"},
}

SERVERS = [
    {"url": "https://processmap.ru", "description": "Прод"},
    {"url": "https://stage.processmap.ru", "description": "Стейдж"},
    {"url": "http://127.0.0.1:8011", "description": "Локальная разработка"},
]

# ---------------------------------------------------------------- теги (RU)
TAG_RU = {
    "admin": "Администрирование платформы (пользователи, орг-настройки, телеметрия, аудит)",
    "analytics": "Аналитика процессов и орг-дашборды",
    "audit-log": "Журнал аудита действий",
    "auto-pass": "Автопроход сценариев (роботизированный прогон процесса)",
    "clipboard": "Буфер обмена элементами диаграмм между сессиями",
    "deployment-notices": "Уведомления о деплое/версиях платформы",
    "dictionaries": "Справочники доменных значений",
    "error-events": "Клиентская телеметрия ошибок фронтенда",
    "explorer": "Навигатор по проектам/процессам (дерево, поиск)",
    "feature-flags": "Фичефлаги организации",
    "health": "Проверки живости сервиса",
    "kitchens": "Кухни (производственные площадки)",
    "llm": "LLM-гейтвей: статус, квоты, feedback (без секретов)",
    "notes": "Заметки и обсуждения по элементам диаграмм",
    "operation-catalog": "Каталог операций роботизированного исполнения",
    "org-groups": "Группы доступа в организациях",
    "org-invites": "Приглашения в организации",
    "org-listing": "Список организаций пользователя",
    "org-members": "Члены организации и роли",
    "org-property-dictionary": "Словарь свойств организации (пользовательские атрибуты)",
    "organizations": "Организации (мультитенантность)",
    "process-properties-registry": "Реестр свойств процессов",
    "process-templates": "Шаблоны процессов и их версии",
    "product-actions-ai": "AI-предложения продуктовых действий по шагам",
    "product-actions-registry": "Реестр продуктовых действий",
    "project-analytics": "Аналитика по проекту",
    "projects": "Проекты (группировка сессий-процессов)",
    "rag": "RAG-поиск по базе знаний",
    "recipes": "Рецепты (доменные технологические карты)",
    "reference-resolver": "Резолвинг ссылок на доменные сущности",
    "reports": "Отчёты по сценариям и их версии",
    "save-status": "Статус сохранения сессии",
    "session-events": "События сессии (live-лента)",
    "sessions": "Сессии процессов: BPMN-диаграммы, интервью, граф, LLM-действия",
    "sku-bindings": "Привязки SKU к операциям",
    "system": "Системные эндпоинты (метаданные, конфигурация, логин)",
    "templates": "Шаблоны вставки элементов на диаграмму",
    "transformation": "Трансформация AS IS → TO BE",
    "version": "Версия сборки",
}

# ------------------------------------------------------- публичные эндпоинты
PUBLIC_PATHS = {
    ("GET", "/health"),
    ("GET", "/api/health"),
    ("GET", "/version"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/refresh"),
    ("POST", "/api/auth/invite/preview"),
    ("POST", "/api/auth/invite/activate"),
}

# --------------------------------------------------- глаголы и существительные
VERB_RU = {
    "GET": "Получить",
    "POST": "Создать/выполнить",
    "PUT": "Сохранить (replace)",
    "PATCH": "Обновить частично",
    "DELETE": "Удалить",
}
NOUN_RU = [
    (r"sessions/\{session_id\}/bpmn/versions/\{version_id\}", "версию BPMN сессии"),
    (r"sessions/\{session_id\}/bpmn/versions", "версии BPMN сессии"),
    (r"sessions/\{session_id\}/bpmn/restore/\{version_id\}", "восстановление версии BPMN"),
    (r"sessions/\{session_id\}/bpmn_meta", "BPMN-метаданные сессии"),
    (r"sessions/\{session_id\}/bpmn", "BPMN XML сессии"),
    (r"sessions/\{session_id\}/llm/analysis", "LLM-анализ процесса"),
    (r"sessions/\{session_id\}/llm/suggest-next", "предложение следующего блока (LLM)"),
    (r"sessions/\{session_id\}/llm/explain-step", "объяснение шага (LLM)"),
    (r"sessions/\{session_id\}/llm/step-qa", "вопрос-ответ по шагу (LLM)"),
    (r"sessions/\{session_id\}/graph", "граф процесса сессии"),
    (r"sessions/\{session_id\}/interview", "интервью сессии"),
    (r"sessions/\{session_id\}/notes", "заметки сессии"),
    (r"sessions/\{session_id\}", "сессию процесса"),
    (r"sessions", "сессии процессов"),
    (r"projects/\{project_id\}", "проект"),
    (r"projects", "проекты"),
    (r"admin/llm/providers/\{provider_id\}/test", "проверку LLM-провайдера"),
    (r"admin/llm/providers/\{provider_id\}", "LLM-провайдера"),
    (r"admin/llm/providers", "LLM-провайдеров"),
    (r"admin/llm/prompts/\{prompt_id\}/activate", "активацию промпта"),
    (r"admin/llm/prompts/\{prompt_id\}/rollback", "откат промпта"),
    (r"admin/llm/prompts", "LLM-промптов"),
    (r"admin/llm/features/\{feature\}", "фичефлаг LLM"),
    (r"admin/llm/features", "фичефлагов LLM"),
    (r"admin/llm/usage", "расход токенов LLM"),
    (r"llm/status", "статус LLM-гейтвея"),
    (r"llm/feedback", "оценку ответа LLM"),
    (r"orgs/\{org_id\}", "организацию"),
    (r"org", "орг-контекст"),
    (r"reports/\{version_id\}", "версию отчёта"),
    (r"reports", "отчёты"),
    (r"recipes/\{recipe_id\}", "рецепт"),
    (r"recipes", "рецепты"),
    (r"process-templates/\{template_id\}", "шаблон процесса"),
    (r"process-templates", "шаблоны процессов"),
    (r"notes", "заметки"),
    (r"templates", "шаблоны"),
    (r"analytics", "аналитику"),
    (r"auth", "аутентификацию"),
    (r"meta", "метаданные"),
    (r"health", "здоровье сервиса"),
    (r"version", "версию сборки"),
]

# -------------------------------------------------- ручная карта особых операций
# (method, path) → (summary, description)
SPECIAL = {
    ("POST", "/api/auth/login"): (
        "Вход: выдача JWT по email+паролю",
        "Аутентификация пользователя. Принимает `{email, password}`, возвращает "
        "`{access_token, refresh_token?, token_type}` и профиль. Access token — короткоживущий "
        "(TTL из конфига JWT_ACCESS_TTL_MIN), дальше — `Authorization: Bearer`. Публичный эндпоинт.",
    ),
    ("POST", "/api/auth/refresh"): (
        "Обновление access token по refresh token",
        "Ротация пары токенов: принимает refresh token, возвращает новый access token "
        "(и новый refresh при ротации с grace-периодом). Публичный эндпоинт.",
    ),
    ("GET", "/version"): (
        "Версия сборки backend",
        "Возвращает commit/branch/buildTime сборки (`{commit, branch, buildTime, env}`). "
        "Используется healthcheck'ами и диагностикой деплоя. Публичный эндпоинт.",
    ),
    ("GET", "/api/llm/status"): (
        "Статус LLM-гейтвея: configured + дневная квота",
        "LLM4: `{configured: bool}` (есть ли enabled-провайдер с непустым ключом) и "
        "`{quota: {used, limit}}` — токены за 24ч по фиче analysis и дневной лимит "
        "(дефолт 200000). Секреты, base_url, модели и имена провайдеров НЕ возвращаются. "
        "Доступ: любой член организации (viewer+).",
    ),
    ("POST", "/api/llm/feedback"): (
        "Оценка ответа LLM (👍/👎) без вызова LLM",
        "LLM4: записывает оценку ответа панели PROCESSMAN в `llm_usage` "
        "(`feature=processman_feedback`, `status=feedback_up|feedback_down`, 0 токенов). "
        "Тело `{rating: \"up\"|\"down\", session_id?, action?}`. Обращения к LLM не выполняется. "
        "422 — rating вне {up, down}. Доступ: viewer+.",
    ),
    ("POST", "/api/sessions/{session_id}/llm/analysis"): (
        "LLM-анализ процесса (узкие места, кандидаты, риски)",
        "LLM1: полный анализ сессии: `{analysis: {bottlenecks, robotization_candidates, risks, "
        "open_questions}, dropped, cached}`. Результат кэшируется в Redis (повтор — 0 токенов, "
        "`cached=true`); `force=1` — принудительный новый вызов. Деградация честная: при "
        "недоступном LLM — HTTP 200 с `{ok:false, status: no_provider|rate_limited|disabled|error}`.",
    ),
    ("POST", "/api/sessions/{session_id}/llm/suggest-next"): (
        "Предложить следующий блок процесса (LLM)",
        "LLM3: кандидаты следующего блока строго из живого каталога операций "
        "(вне каталога — отбрасываются, `dropped`). Query: `after_step_id`, `force`. "
        "Кэш Redis; при fallback-провайдере — `fallback=true`. Деградация — HTTP 200 со статусом.",
    ),
    ("POST", "/api/sessions/{session_id}/llm/explain-step"): (
        "Объяснить AI-решение по шагу (LLM)",
        "LLM3: объяснение шага трансформации `{explanation, note, trace}`. "
        "`no_trace` — по шагу нет AI-решения (не додумывается). Query: `step_id`, `force`.",
    ),
    ("POST", "/api/sessions/{session_id}/llm/step-qa"): (
        "Вопрос-ответ по шагу (LLM)",
        "LLM3: ответ на вопрос пользователя по шагу. Тело `{question}`. Query: `step_id`, `force`.",
    ),
    ("PUT", "/api/sessions/{session_id}"): (
        "Сохранить сессию процесса целиком",
        "Полная запись сессии (узлы/рёбра/интервью/BPMN-мета). Оптимистичная конкуренция: "
        "требуется `base_diagram_state_version` = текущей версии на сервере; иначе **409** "
        "`DIAGRAM_STATE_BASE_VERSION_REQUIRED` с серверной версией и последним автором — "
        "клиент показывает merge-диалог.",
    ),
    ("PATCH", "/api/sessions/{session_id}"): (
        "Частично обновить сессию процесса",
        "Точечное обновление полей сессии. Та же защита версий: несовпадение "
        "`base_diagram_state_version` → **409**.",
    ),
    ("GET", "/api/sessions/{session_id}"): (
        "Получить сессию процесса",
        "Карточка сессии: title, режим, роли, узлы/рёбра графа, интервью (без bpmn_xml — "
        "он отдаётся отдельным эндпоинтом `/bpmn`). Доступ по scope организации/проекта.",
    ),
    ("GET", "/api/sessions/{session_id}/bpmn"): (
        "BPMN XML сессии (raw или с оверлеями)",
        "Отдаёт BPMN XML: `raw=1` — как сохранён; иначе — регенерация/оверлей аннотаций "
        "интервью (`include_overlay`, `zoom`, `pan_x`, `pan_y`).",
    ),
    ("PUT", "/api/sessions/{session_id}/bpmn"): (
        "Загрузить BPMN XML в сессию",
        "Импорт BPMN: валидация XML, пересчёт графа и fingerprint. Требует "
        "`base_diagram_state_version`/`base_bpmn_xml_version` → иначе **409**.",
    ),
    ("GET", "/api/meta"): (
        "Метаданные runtime (версия для клиента)",
        "Runtime-метаданные для фронтенда (app_version/build_id/min_supported — "
        "использовалось до перехода на static/version.json).",
    ),
}

# ----------------------------------------------------- ответы-шаблоны (RU)
RESP_200 = "Успешный ответ"
RESP_201 = "Создано"
RESP_401 = "Не аутентифицирован: отсутствует или недействителен JWT access token (Authorization: Bearer)"
RESP_403 = "Доступ запрещён: требуется роль admin или членство в организации с нужными правами"
RESP_404 = "Не найдено: ресурс отсутствует или недоступен в текущем org-scope"
RESP_409 = "Конфликт версий: ресурс изменился на сервере (см. base_diagram_state_version / retry)"
RESP_422 = "Ошибка валидации запроса (схема FastAPI/Pydantic)"

ADMIN_TAGS = {"admin", "feature-flags"}


def _is_null_type(s):
    return isinstance(s, dict) and s.get("type") == "null" and len(s) == 1


def convert_to_30(node):
    """JSON Schema 2020-12 (FastAPI/OAS 3.1) → OpenAPI 3.0: type:'null' → nullable.

    Порядок: anyOf обрабатывается на текущем уровне ДО рекурсии в варианты.
    nullable ставится только там, где есть type (правило nullable-type-sibling);
    пустая схема {} и так допускает null — nullable не нужен.
    """
    if isinstance(node, dict):
        node = dict(node)
        # OpenAPI 3.1 → 3.0: `const` → `enum: [const]`
        if "const" in node:
            node["enum"] = [node.pop("const")]
        # OpenAPI 3.1 → 3.0: `examples` (массив) на схеме → `example` (значение)
        if "examples" in node and isinstance(node["examples"], list) and node["examples"]:
            node["example"] = node["examples"][0]
            del node["examples"]
        elif "examples" in node:
            del node["examples"]
        # $ref рядом с sibling-ключами (3.0 игнорирует siblings): оборачиваем в allOf
        if "$ref" in node and len(node) > 1:
            ref = node["$ref"]
            siblings = {k: convert_to_30(v) for k, v in node.items() if k != "$ref"}
            return {"allOf": [{"$ref": ref}], **siblings}
        if "anyOf" in node and isinstance(node["anyOf"], list):
            variants = node["anyOf"]
            nulls = [v for v in variants if _is_null_type(v)]
            rest = [convert_to_30(v) for v in variants if not _is_null_type(v)]
            if nulls and rest:
                if len(rest) == 1:
                    merged = dict(rest[0])
                    for k, v in node.items():
                        if k != "anyOf" and k not in merged:
                            merged[k] = convert_to_30(v)
                    if merged.get("type"):
                        merged["nullable"] = True
                    # anyOf-фолдинг мог собрать $ref+siblings — обработать повторно
                    return convert_to_30(merged)
                keep = {k: convert_to_30(v) for k, v in node.items() if k != "anyOf"}
                if keep.get("type"):
                    keep["nullable"] = True
                keep["anyOf"] = rest
                return keep
            if nulls and not rest:
                # только null → пустая схема (допускает всё, включая null)
                return {k: convert_to_30(v) for k, v in node.items() if k != "anyOf" and k != "type"}
            node = {k: convert_to_30(v) for k, v in node.items()}
            return node
        node = {k: convert_to_30(v) for k, v in node.items()}
        if node.get("type") == "null":
            node = {k: v for k, v in node.items() if k != "type"}  # {} допускает null
        return node
    if isinstance(node, list):
        return [convert_to_30(v) for v in node]
    return node


def guess_noun(path):
    for pat, noun in NOUN_RU:
        if re.search(pat, path):
            return noun
    # fallback: последний сегмент без параметров
    parts = [p for p in path.split("/") if p and not p.startswith("{")]
    tail = parts[-1] if parts else "ресурс"
    return tail.replace("_", " ").replace("-", " ")


def build_summary(method, path, op):
    key = (method, path)
    if key in SPECIAL:
        return SPECIAL[key][0]
    verb = VERB_RU.get(method, method)
    noun = guess_noun(path)
    return f"{verb} {noun}"


def build_description(method, path, op, tags):
    key = (method, path)
    if key in SPECIAL:
        return SPECIAL[key][1]
    parts = []
    noun = guess_noun(path)
    parts.append(f"{VERB_RU.get(method, method)} {noun}.")
    feats = []
    if "admin" in tags:
        feats.append("доступ: администратор платформы/организации")
    elif tags and tags[0] not in ("system", "health", "version"):
        feats.append("доступ: член организации с нужной ролью (org-scope)")
    if method in ("PUT", "PATCH", "POST"):
        feats.append("тело валидируется схемой (422 при несоответствии)")
    if re.search(r"\{[^}]+\}", path):
        feats.append("404 — ресурс не найден/вне scope")
    if feats:
        parts.append("Особенности: " + "; ".join(feats) + ".")
    return " ".join(parts)


def add_response(op, code, description, schema=None):
    responses = op.setdefault("responses", {})
    if code in responses:
        # обновим пустое описание
        if not responses[code].get("description"):
            responses[code]["description"] = description
        return
    resp = {"description": description}
    if schema:
        resp["content"] = {"application/json": {"schema": schema}}
    responses[code] = resp


def build_ru_openapi(spec: Dict[str, Any]) -> Dict[str, Any]:
    """FastAPI get_openapi() dict → обогащённая русская спека OpenAPI 3.0.3."""
    out: Dict[str, Any] = {
        "openapi": "3.0.3",
        "info": INFO,
        "servers": SERVERS,
        "tags": [
            {"name": t, "description": TAG_RU.get(t, t)}
            for t in sorted({
                t for item in spec["paths"].values() for op in item.values()
                if isinstance(op, dict) for t in op.get("tags", [])
            })
        ],
        "paths": {},
        "components": spec.get("components", {}),
    }
    comps = out["components"]
    schemes = comps.get("securitySchemes", {})
    if "JWT access token" in schemes:
        schemes["bearerAuth"] = schemes.pop("JWT access token")
        schemes["bearerAuth"]["bearerFormat"] = "JWT"
        schemes["bearerAuth"]["description"] = "JWT access token (получить через POST /api/auth/login)"
    else:
        schemes["bearerAuth"] = {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
    comps["securitySchemes"] = schemes

    for path, item in spec["paths"].items():
        new_item: Dict[str, Any] = {}
        for method, op in item.items():
            if method not in ("get", "post", "put", "patch", "delete") or not isinstance(op, dict):
                new_item[method] = op
                continue
            op = dict(op)
            m = method.upper()
            tags = op.get("tags") or []
            op["summary"] = build_summary(m, path, op)
            if not op.get("description"):
                op["description"] = build_description(m, path, op, tags)
            if (m, path) in PUBLIC_PATHS:
                op["security"] = []
                op.setdefault("x-public", True)
                add_response(op, "400", "Некорректный запрос (невалидные параметры/тело, невалидный или истёкший токен)")
            else:
                op["security"] = [{"bearerAuth": []}]
                add_response(op, "401", RESP_401)
            if any(t in ADMIN_TAGS for t in tags):
                add_response(op, "403", RESP_403)
            if re.search(r"\{[^}]+\}", path):
                add_response(op, "404", RESP_404)
            if method in ("put", "patch") and "sessions" in tags:
                add_response(op, "409", RESP_409)
            for code, resp in op.get("responses", {}).items():
                if not resp.get("description"):
                    resp["description"] = RESP_201 if code == "201" else (RESP_422 if code == "422" else RESP_200)
            new_item[method] = op
        out["paths"][path] = new_item

    out["security"] = [{"bearerAuth": []}]
    return convert_to_30(out)


