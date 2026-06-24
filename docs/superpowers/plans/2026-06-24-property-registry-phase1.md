# Phase 1: Extended Property Registry Table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 1 of the extended Property Registry: 15-column table, conditional formatting, CSV + simple Excel export, universal reference resolver, and concrete `ingredients`/`equipment`/`containers` tables.

**Architecture:**
- Backend: add `process_property_metadata` and three reference tables in `storage.py`; expose a new registry query that returns metadata rows enriched with derived `usage_count` and dynamic `reference_options`; add `/api/reference/<source>/options` and a new `GET /api/analysis/properties/registry/export`.
- Frontend: extend `ProcessPropertiesRegistryPage` with a new table component, filters, search/sort, conditional formatting, and export buttons; reuse existing API wrappers and registry primitives.

**Tech Stack:** FastAPI + Pydantic + raw SQL (SQLite/PostgreSQL shim), React + Vite, `xlsx` (SheetJS) on backend, existing auth/RBAC.

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/storage.py` | New table schemas + CRUD helpers for metadata and reference tables |
| `backend/app/routers/process_properties_registry.py` | `GET /api/analysis/properties/registry/query`, `GET .../export`, property metadata enrichment, usage count |
| `backend/app/routers/reference_resolver.py` | `GET /api/reference/<source>/options` |
| `backend/app/routers/__init__.py` | Wire new router |
| `backend/tests/test_process_properties_registry_api.py` | Backend tests for query/export/reference/usage_count |
| `frontend/src/lib/apiRoutes.js` | New route paths |
| `frontend/src/lib/api.js` | New API functions |
| `frontend/src/features/analytics/propertyRegistry/` | New table, filters, conditional formatting components |
| `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx` | Page shell using new table |

---

## Task 1: Backend schema — metadata + reference tables

**Files:**
- Modify: `backend/app/storage.py`

**Step 1: Add table definitions in `_ensure_schema()`**

Add after the existing `org_property_dictionary_*` table creation (around line 1233):

```python
# Extended property registry metadata
_create_table_if_not_exists(
    cursor,
    """
    CREATE TABLE IF NOT EXISTS process_property_metadata (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        property_type TEXT NOT NULL,
        applicable_to TEXT,
        default_value TEXT,
        value_range TEXT,
        validation_rules TEXT,
        source TEXT NOT NULL DEFAULT 'bpmn_extension',
        editable INTEGER NOT NULL DEFAULT 1,
        visible_in TEXT,
        category TEXT NOT NULL DEFAULT 'general',
        inheritance TEXT NOT NULL DEFAULT 'none',
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        org_id TEXT,
        created_by TEXT,
        updated_by TEXT,
        FOREIGN KEY (org_id) REFERENCES orgs(id)
    )
    """,
)
_create_index_if_not_exists(cursor, "idx_ppm_org_id", "process_property_metadata", "org_id")
_create_index_if_not_exists(cursor, "idx_ppm_category", "process_property_metadata", "category")
_create_index_if_not_exists(cursor, "idx_ppm_source", "process_property_metadata", "source")

for table_name, ddl in [
    (
        "ingredients",
        """
        CREATE TABLE IF NOT EXISTS ingredients (
            id TEXT PRIMARY KEY,
            org_id TEXT,
            name TEXT NOT NULL,
            unit TEXT,
            calories_per_unit REAL,
            allergens TEXT,
            supplier_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (org_id) REFERENCES orgs(id)
        )
        """,
    ),
    (
        "equipment",
        """
        CREATE TABLE IF NOT EXISTS equipment (
            id TEXT PRIMARY KEY,
            org_id TEXT,
            name TEXT NOT NULL,
            type TEXT,
            capacity TEXT,
            maintenance_schedule TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (org_id) REFERENCES orgs(id)
        )
        """,
    ),
    (
        "containers",
        """
        CREATE TABLE IF NOT EXISTS containers (
            id TEXT PRIMARY KEY,
            org_id TEXT,
            name TEXT NOT NULL,
            volume TEXT,
            material TEXT,
            temperature_range TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (org_id) REFERENCES orgs(id)
        )
        """,
    ),
]:
    _create_table_if_not_exists(cursor, ddl)
    _create_index_if_not_exists(cursor, f"idx_{table_name}_org_id", table_name, "org_id")
    _create_index_if_not_exists(cursor, f"idx_{table_name}_name", table_name, "name")
```

**Step 2: Add CRUD helpers**

Add near other storage helpers:

```python
def _json_text(value):
    return _json_dumps(value) if value is not None else None


def _parse_json_text(text):
    return _json_loads(text) if text else None


def list_process_property_metadata(org_id=None, include_global=True):
    with _connect() as conn:
        params = []
        sql = "SELECT * FROM process_property_metadata WHERE 1=1"
        if org_id:
            if include_global:
                sql += " AND (org_id = ? OR org_id IS NULL)"
                params.append(org_id)
            else:
                sql += " AND org_id = ?"
                params.append(org_id)
        sql += " ORDER BY category, display_name"
        rows = conn.execute(sql, params).fetchall()
        return [_row_to_dict(r) for r in rows]


def get_process_property_metadata(id, org_id=None):
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM process_property_metadata WHERE id = ? AND (org_id = ? OR org_id IS NULL)",
            (id, org_id),
        ).fetchone()
        return _row_to_dict(row) if row else None


def upsert_process_property_metadata(
    id,
    display_name,
    property_type,
    org_id=None,
    applicable_to=None,
    default_value=None,
    value_range=None,
    validation_rules=None,
    source="bpmn_extension",
    editable=True,
    visible_in=None,
    category="general",
    inheritance="none",
    version=1,
    actor_user_id=None,
):
    now = _now_ts()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO process_property_metadata (
                id, display_name, property_type, applicable_to, default_value, value_range,
                validation_rules, source, editable, visible_in, category, inheritance, version,
                created_at, updated_at, org_id, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                display_name=excluded.display_name,
                property_type=excluded.property_type,
                applicable_to=excluded.applicable_to,
                default_value=excluded.default_value,
                value_range=excluded.value_range,
                validation_rules=excluded.validation_rules,
                source=excluded.source,
                editable=excluded.editable,
                visible_in=excluded.visible_in,
                category=excluded.category,
                inheritance=excluded.inheritance,
                version=excluded.version,
                updated_at=excluded.updated_at,
                updated_by=excluded.updated_by
            """,
            (
                id,
                display_name,
                property_type,
                _json_text(applicable_to),
                default_value,
                _json_text(value_range),
                _json_text(validation_rules),
                source,
                1 if editable else 0,
                _json_text(visible_in),
                category,
                inheritance,
                version,
                now,
                now,
                org_id,
                actor_user_id,
                actor_user_id,
            ),
        )
        conn.commit()


def list_reference_options(table_name, org_id=None, q="", limit=20):
    allowed = {"ingredients", "equipment", "containers"}
    if table_name not in allowed:
        return []
    with _connect() as conn:
        params = []
        sql = f"SELECT * FROM {table_name} WHERE 1=1"
        if org_id:
            sql += " AND (org_id = ? OR org_id IS NULL)"
            params.append(org_id)
        if q:
            sql += " AND name LIKE ?"
            params.append(f"%{q}%")
        sql += " ORDER BY name LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        return [_row_to_dict(r) for r in rows]
```

**Step 3: Add seed/backfill function**

Add a `_seed_process_property_metadata()` helper and call it from `_ensure_schema()` after table creation if a `storage_meta` key `property_registry_metadata_seed_v1` is absent.

```python
_PROPERTY_METADATA_SEED_KEY = "property_registry_metadata_seed_v1"
_PROPERTY_METADATA_SEED = [
    {
        "id": "ingredient",
        "display_name": "Ингредиент",
        "property_type": "reference",
        "applicable_to": ["Task", "SubProcess"],
        "validation_rules": ["required"],
        "source": "bpmn_extension",
        "editable": True,
        "visible_in": ["canvas", "properties_panel", "export"],
        "category": "materials",
        "inheritance": "from_template",
        "value_range": {"reference_source": "table:ingredients"},
    },
    {
        "id": "equipment",
        "display_name": "Оборудование",
        "property_type": "reference",
        "applicable_to": ["Task", "SubProcess"],
        "validation_rules": ["required"],
        "source": "bpmn_extension",
        "editable": True,
        "visible_in": ["canvas", "properties_panel", "export"],
        "category": "equipment",
        "inheritance": "from_template",
        "value_range": {"reference_source": "table:equipment"},
    },
    {
        "id": "container",
        "display_name": "Контейнер",
        "property_type": "reference",
        "applicable_to": ["Task", "SubProcess"],
        "source": "bpmn_extension",
        "editable": True,
        "visible_in": ["canvas", "properties_panel", "export"],
        "category": "materials",
        "inheritance": "from_template",
        "value_range": {"reference_source": "table:containers"},
    },
    {
        "id": "duration",
        "display_name": "Длительность",
        "property_type": "duration",
        "applicable_to": ["Task", "SubProcess", "Process"],
        "source": "system",
        "editable": False,
        "visible_in": ["properties_panel", "analytics", "export"],
        "category": "timing",
        "inheritance": "none",
    },
    {
        "id": "priority",
        "display_name": "Приоритет",
        "property_type": "enum",
        "applicable_to": ["Task"],
        "value_range": {"options": ["low", "medium", "high"]},
        "source": "bpmn_extension",
        "editable": True,
        "visible_in": ["properties_panel", "export"],
        "category": "general",
        "inheritance": "none",
    },
]


def _seed_process_property_metadata():
    done = _get_storage_meta(_PROPERTY_METADATA_SEED_KEY)
    if done:
        return
    for item in _PROPERTY_METADATA_SEED:
        upsert_process_property_metadata(**item)
    _set_storage_meta(_PROPERTY_METADATA_SEED_KEY, "1")
```

Also seed sample reference rows (idempotent by primary key):

```python
_REFERENCE_SEED_KEY = "property_registry_reference_seed_v1"
_REFERENCE_SEED = {
    "ingredients": [
        ("ing_001", "Мука пшеничная", "kg", 364.0, "[]", None),
        ("ing_002", "Сахар", "kg", 400.0, "[]", None),
        ("ing_003", "Соль", "kg", 0.0, "[]", None),
        ("ing_004", "Дрожжи", "kg", 0.0, "[]", None),
        ("ing_005", "Молоко", "l", 420.0, "[\"lactose\"]", None),
    ],
    "equipment": [
        ("eq_001", "Печь конвекционная", "oven", "200°C", "ежемесячно"),
        ("eq_002", "Миксер планетарный", "mixer", "50 л", "ежеквартально"),
        ("eq_003", "Конвейер охлаждения", "conveyor", "10 м/мин", "ежегодно"),
    ],
    "containers": [
        ("cnt_001", "Пластиковый лоток", "10 л", "plastic", "-10..+40"),
        ("cnt_002", "Стеклянная банка", "5 л", "glass", "0..+25"),
        ("cnt_003", "Металлическая бочка", "200 л", "metal", "-20..+40"),
    ],
}


def _seed_reference_tables():
    done = _get_storage_meta(_REFERENCE_SEED_KEY)
    if done:
        return
    now = _now_ts()
    with _connect() as conn:
        for table_name, rows in _REFERENCE_SEED.items():
            if table_name == "ingredients":
                conn.executemany(
                    f"""
                    INSERT INTO ingredients (id, name, unit, calories_per_unit, allergens, supplier_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO NOTHING
                    """,
                    [(rid, name, unit, cal, allergens, supplier, now, now) for rid, name, unit, cal, allergens, supplier in rows],
                )
            elif table_name == "equipment":
                conn.executemany(
                    f"""
                    INSERT INTO equipment (id, name, type, capacity, maintenance_schedule, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO NOTHING
                    """,
                    [(rid, name, type, capacity, maint, now, now) for rid, name, type, capacity, maint in rows],
                )
            elif table_name == "containers":
                conn.executemany(
                    f"""
                    INSERT INTO containers (id, name, volume, material, temperature_range, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO NOTHING
                    """,
                    [(rid, name, volume, material, temp, now, now) for rid, name, volume, material, temp in rows],
                )
        conn.commit()
    _set_storage_meta(_REFERENCE_SEED_KEY, "1")
```

Call both `_seed_process_property_metadata()` and `_seed_reference_tables()` from `_ensure_schema()` after tables are created.

**Step 4: Verify build & tests**

Run:
```bash
cd /root/processmap_v1/backend && python -m pytest tests/test_process_properties_registry_api.py -v
```

Expected: existing tests still pass.

**Step 5: Commit**

```bash
cd /root/processmap_v1
git add backend/app/storage.py
git commit -m "feat(registry): add process_property_metadata and reference tables with seed data"
```

---

## Task 2: Reference resolver endpoint

**Files:**
- Create: `backend/app/routers/reference_resolver.py`
- Modify: `backend/app/routers/__init__.py`

**Step 1: Implement router**

```python
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

from ..legacy.request_context import (
    require_authenticated_user,
    request_active_org_id,
)
from ..services.org_workspace import require_org_member_for_enterprise
from ..storage import list_reference_options

router = APIRouter(tags=["reference-resolver"])


def _active_org_id(request: Request) -> str:
    return request_active_org_id(request) or ""


@router.get("/api/reference/{source}/options")
def get_reference_options(
    source: str,
    request: Request,
    q: str = "",
    limit: int = 20,
) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = _active_org_id(request)
    if org_id:
        require_org_member_for_enterprise(request, org_id)

    if not source or ":" not in source:
        raise HTTPException(status_code=422, detail="invalid source format; expected type:identifier")

    source_type, source_id = source.split(":", 1)
    if source_type == "table":
        items = list_reference_options(source_id, org_id=org_id or None, q=q, limit=min(max(limit, 1), 100))
    elif source_type == "org_dict":
        # Phase 1: simple org_dict not wired; return empty
        items = []
    else:
        raise HTTPException(status_code=422, detail="unsupported source type")

    return {"ok": True, "source": source, "items": items, "count": len(items)}
```

**Step 2: Wire router in `backend/app/routers/__init__.py`**

Add import and include:

```python
from . import reference_resolver
...
app.include_router(reference_resolver.router)
```

**Step 3: Test manually**

```bash
curl -s "http://localhost:8000/api/reference/table/ingredients/options?q=мука&limit=5" -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

Expected: `{"ok": true, "items": [...], "count": 1}`.

**Step 4: Commit**

```bash
git add backend/app/routers/reference_resolver.py backend/app/routers/__init__.py
git commit -m "feat(registry): add universal reference resolver endpoint"
```

---

## Task 3: Backend registry query — properties instead of rows

**Files:**
- Modify: `backend/app/routers/process_properties_registry.py`

**Step 1: Add new Pydantic input model**

```python
class ProcessPropertiesRegistryQueryIn(BaseModel):
    filters: Dict[str, Any] = Field(default_factory=dict)
    include_usage: bool = True
    include_reference_options: bool = True
    limit: int = 1000
    offset: int = 0
```

**Step 2: Add query endpoint `GET /api/analysis/properties/registry/query`**

Implementation outline (replace/add alongside existing POST):

```python
@router.get("/api/analysis/properties/registry/query")
def query_property_registry(
    request: Request,
    category: str = "all",
    applicable_to: str = "",
    source: str = "",
    editable: str = "all",
    search: str = "",
    include_usage: bool = True,
    include_reference_options: bool = True,
):
    require_authenticated_user(request)
    org_id = request_active_org_id(request) or ""
    if org_id:
        require_org_member_for_enterprise(request, org_id)

    metadata_rows = list_process_property_metadata(org_id=org_id or None, include_global=True)

    # Build usage counts from sessions bpmn_meta
    usage_counts = {}
    if include_usage:
        usage_counts = _compute_property_usage_counts(org_id)

    out = []
    for meta in metadata_rows:
        if category != "all" and meta.get("category") != category:
            continue
        if source:
            allowed_sources = [s.strip() for s in source.split(",") if s.strip()]
            if meta.get("source") not in allowed_sources:
                continue
        if editable != "all":
            want = editable.lower() == "true"
            if bool(meta.get("editable")) != want:
                continue
        if applicable_to:
            want_types = [s.strip() for s in applicable_to.split(",") if s.strip()]
            app_to = _parse_json_text(meta.get("applicable_to")) or []
            if not any(t in app_to for t in want_types):
                continue
        if search:
            needle = search.lower()
            haystack = f"{meta.get('id', '')} {meta.get('display_name', '')} {meta.get('category', '')}".lower()
            if needle not in haystack:
                continue

        item = _enrich_metadata(meta, usage_counts, include_reference_options, org_id)
        out.append(item)

    return {"ok": True, "properties": out, "count": len(out)}
```

**Step 3: Add helper functions**

```python
def _compute_property_usage_counts(org_id: str) -> Dict[str, int]:
    counts: Dict[str, Set[str]] = {}
    storage = get_storage()
    # List visible sessions for org. Use storage.list_sessions_for_org if available,
    # otherwise iterate project sessions. Fallback: load all sessions for org.
    sessions = []
    try:
        sessions = storage.list_sessions(org_id=org_id) or []
    except Exception:
        pass
    for session in sessions:
        meta = session.get("bpmn_meta") or {}
        camunda = (meta.get("camunda_extensions_by_element_id") or {}) if isinstance(meta, dict) else {}
        for element_id, element_state in camunda.items():
            props = element_state.get("properties") or {}
            for ext in props.get("extensionProperties", []):
                name = _text(ext.get("name"))
                if name:
                    counts.setdefault(name, set()).add(element_id)
    return {k: len(v) for k, v in counts.items()}


def _enrich_metadata(meta, usage_counts, include_reference_options, org_id):
    value_range = _parse_json_text(meta.get("value_range")) or {}
    validation_rules = _parse_json_text(meta.get("validation_rules")) or []
    applicable_to = _parse_json_text(meta.get("applicable_to")) or []
    visible_in = _parse_json_text(meta.get("visible_in")) or []
    reference_options = []
    if include_reference_options and meta.get("property_type") == "reference":
        ref_source = value_range.get("reference_source")
        if ref_source:
            _, _, ref_id = ref_source.partition(":")
            reference_options = list_reference_options(ref_id, org_id=org_id or None, limit=100)
    return {
        "id": meta.get("id"),
        "display_name": meta.get("display_name"),
        "property_type": meta.get("property_type"),
        "applicable_to": applicable_to,
        "default_value": meta.get("default_value"),
        "value_range": value_range,
        "validation_rules": validation_rules,
        "source": meta.get("source"),
        "editable": bool(meta.get("editable")),
        "visible_in": visible_in,
        "category": meta.get("category"),
        "inheritance": meta.get("inheritance"),
        "version": int(meta.get("version") or 1),
        "created_at": meta.get("created_at"),
        "updated_at": meta.get("updated_at"),
        "usage_count": usage_counts.get(meta.get("id"), 0),
        "reference_options": reference_options,
    }
```

**Step 4: Add backend tests**

Add to `backend/tests/test_process_properties_registry_api.py`:

```python
def test_query_property_registry_returns_metadata(self):
    res = self.registry_query()
    self.assertTrue(res.get("ok"))
    properties = res.get("properties", [])
    ids = {p["id"] for p in properties}
    self.assertIn("ingredient", ids)
    self.assertIn("equipment", ids)
```

**Step 5: Run tests**

```bash
python -m pytest tests/test_process_properties_registry_api.py -v
```

**Step 6: Commit**

```bash
git add backend/app/routers/process_properties_registry.py backend/tests/test_process_properties_registry_api.py
git commit -m "feat(registry): add property metadata query with usage counts and reference options"
```

---

## Task 4: Backend export endpoint

**Files:**
- Modify: `backend/app/routers/process_properties_registry.py`

**Step 1: Implement `GET /api/analysis/properties/registry/export`**

```python
@router.get("/api/analysis/properties/registry/export")
def export_property_registry(
    request: Request,
    format: str = "csv",
    category: str = "all",
    applicable_to: str = "",
    source: str = "",
    editable: str = "all",
    include_usage: bool = True,
):
    require_authenticated_user(request)
    org_id = request_active_org_id(request) or ""
    if org_id:
        require_org_member_for_enterprise(request, org_id)

    data = query_property_registry(
        request,
        category=category,
        applicable_to=applicable_to,
        source=source,
        editable=editable,
        include_usage=include_usage,
        include_reference_options=False,
    )
    properties = data.get("properties", [])

    headers = [
        "Идентификатор", "Название", "Тип", "Применимо к", "Значение по умолчанию",
        "Диапазон значений", "Правила валидации", "Источник", "Редактируемо",
        "Видимость", "Категория", "Наследование", "Версия", "Создано", "Обновлено", "Использований",
    ]
    rows = []
    for p in properties:
        rows.append([
            p["id"],
            p["display_name"],
            p["property_type"],
            "|".join(p.get("applicable_to", [])),
            p.get("default_value") or "",
            _json_dumps(p.get("value_range")),
            _json_dumps(p.get("validation_rules")),
            p["source"],
            "true" if p.get("editable") else "false",
            "|".join(p.get("visible_in", [])),
            p["category"],
            p["inheritance"],
            str(p["version"]),
            p.get("created_at") or "",
            p.get("updated_at") or "",
            str(p.get("usage_count", 0)),
        ])

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output, delimiter=";", lineterminator="\r\n")
        output.write("\ufeff")
        writer.writerow(headers)
        writer.writerows(rows)
        body = output.getvalue().encode("utf-8-sig")
        return Response(
            content=body,
            media_type="text/csv; charset=utf-8-sig",
            headers={"Content-Disposition": f'attachment; filename="property-registry-{timestamp}.csv"'},
        )

    if format == "xlsx":
        try:
            import xlsxwriter
        except ImportError as exc:
            raise HTTPException(status_code=501, detail="xlsxwriter not installed") from exc
        buf = io.BytesIO()
        workbook = xlsxwriter.Workbook(buf, {"in_memory": True})
        worksheet = workbook.add_worksheet("Свойства")
        bold = workbook.add_format({"bold": True})
        for col, h in enumerate(headers):
            worksheet.write(0, col, h, bold)
        for row_idx, row in enumerate(rows, start=1):
            for col_idx, value in enumerate(row):
                worksheet.write(row_idx, col_idx, value)
        worksheet.freeze_panes(1, 0)
        worksheet.autofilter(0, 0, len(rows), len(headers) - 1)
        widths = [20, 25, 15, 20, 18, 20, 20, 15, 12, 20, 15, 15, 10, 18, 18, 12]
        for i, w in enumerate(widths):
            worksheet.set_column(i, i, w)
        workbook.close()
        buf.seek(0)
        return Response(
            content=buf.read(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="property-registry-{timestamp}.xlsx"'},
        )

    raise HTTPException(status_code=422, detail="unsupported format")
```

**Step 2: Ensure `xlsxwriter` in requirements**

Add `xlsxwriter>=3.0.0` to `backend/requirements.txt` if absent.

**Step 3: Add tests**

Test CSV/XLSX responses have correct content type and headers.

**Step 4: Commit**

```bash
git add backend/app/routers/process_properties_registry.py backend/requirements.txt backend/tests/test_process_properties_registry_api.py
git commit -m "feat(registry): add CSV and XLSX export for property metadata"
```

---

## Task 5: Frontend API client

**Files:**
- Modify: `frontend/src/lib/apiRoutes.js`
- Modify: `frontend/src/lib/api.js`

**Step 1: Add routes**

```js
processPropertyRegistryQuery: () => "/api/analysis/properties/registry/query",
processPropertyRegistryExport: () => "/api/analysis/properties/registry/export",
referenceOptions: (source) => `/api/reference/${encodeURIComponent(source)}/options`,
```

**Step 2: Add API functions**

```js
export async function apiQueryPropertyRegistry(params = {}) {
  const url = new URL(apiRoutes.analysis.processPropertyRegistryQuery(), window.location.origin);
  if (params.category) url.searchParams.set("category", params.category);
  if (params.applicable_to) url.searchParams.set("applicable_to", params.applicable_to);
  if (params.source) url.searchParams.set("source", params.source);
  if (params.editable) url.searchParams.set("editable", params.editable);
  if (params.search) url.searchParams.set("search", params.search);
  url.searchParams.set("include_usage", params.include_usage !== false ? "true" : "false");
  url.searchParams.set("include_reference_options", params.include_reference_options !== false ? "true" : "false");
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
  return res.json();
}

export function apiExportPropertyRegistry(format, params = {}) {
  const url = new URL(apiRoutes.analysis.processPropertyRegistryExport(), window.location.origin);
  url.searchParams.set("format", format);
  if (params.category) url.searchParams.set("category", params.category);
  if (params.applicable_to) url.searchParams.set("applicable_to", params.applicable_to);
  if (params.source) url.searchParams.set("source", params.source);
  if (params.editable) url.searchParams.set("editable", params.editable);
  url.searchParams.set("include_usage", "true");
  window.location.href = url.toString();
}

export async function apiGetReferenceOptions(source, q = "", limit = 20) {
  const url = new URL(apiRoutes.analysis.referenceOptions(source), window.location.origin);
  if (q) url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
  return res.json();
}
```

Use existing `request` helper if project uses it; ensure auth headers are included.

**Step 3: Commit**

```bash
git add frontend/src/lib/apiRoutes.js frontend/src/lib/api.js
git commit -m "feat(registry): frontend API client for property registry query/export/reference"
```

---

## Task 6: Frontend table + page

**Files:**
- Create: `frontend/src/features/analytics/propertyRegistry/PropertyRegistryTable.jsx`
- Create: `frontend/src/features/analytics/propertyRegistry/PropertyRegistryFilters.jsx`
- Create: `frontend/src/features/analytics/propertyRegistry/propertyRegistryUtils.js`
- Modify: `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx`

**Step 1: Utility helpers**

`propertyRegistryUtils.js`:

```js
export const PROPERTY_CATEGORIES = [
  { value: "all", label: "Все" },
  { value: "general", label: "Общие" },
  { value: "materials", label: "Материалы" },
  { value: "equipment", label: "Оборудование" },
  { value: "timing", label: "Время" },
  { value: "quality", label: "Качество" },
  { value: "custom", label: "Пользовательские" },
];

export const PROPERTY_TYPES = [
  "string", "number", "boolean", "enum", "date", "duration", "reference", "json",
];

export const BPMN_ELEMENT_TYPES = [
  "Task", "SubProcess", "Gateway", "StartEvent", "EndEvent", "SequenceFlow", "Process",
];

export const PROPERTY_SOURCES = [
  { value: "all", label: "Все" },
  { value: "bpmn_extension", label: "BPMN extension" },
  { value: "system", label: "Системное" },
  { value: "user_defined", label: "Пользовательское" },
];

export function formatPropertyType(type) {
  const map = {
    string: "Строка",
    number: "Число",
    boolean: "Да/Нет",
    enum: "Перечисление",
    date: "Дата",
    duration: "Длительность",
    reference: "Справочник",
    json: "JSON",
  };
  return map[type] || type;
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU");
}

export function propertyHasRequired(rules) {
  return Array.isArray(rules) && rules.some((r) => String(r).toLowerCase() === "required");
}

export function getReferenceSourceBadge(valueRange) {
  const source = valueRange?.reference_source;
  if (!source) return null;
  if (source.startsWith("table:")) {
    const map = { ingredients: "Ингредиенты", equipment: "Оборудование", containers: "Контейнеры" };
    return `Справочник: ${map[source.slice(6)] || source.slice(6)}`;
  }
  return source;
}
```

**Step 2: Filters component**

`PropertyRegistryFilters.jsx`:

```jsx
import { PROPERTY_CATEGORIES, PROPERTY_SOURCES } from "./propertyRegistryUtils";

export default function PropertyRegistryFilters({ filters, onChange }) {
  return (
    <div className="propertyRegistryFilters">
      <input
        type="text"
        placeholder="Поиск по ID или названию"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
      />
      <select value={filters.category} onChange={(e) => onChange({ ...filters, category: e.target.value })}>
        {PROPERTY_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <select value={filters.source} onChange={(e) => onChange({ ...filters, source: e.target.value })}>
        {PROPERTY_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <select value={filters.editable} onChange={(e) => onChange({ ...filters, editable: e.target.value })}>
        <option value="all">Все</option>
        <option value="true">Редактируемые</option>
        <option value="false">Только чтение</option>
      </select>
    </div>
  );
}
```

**Step 3: Table component**

`PropertyRegistryTable.jsx`:

```jsx
import { formatPropertyType, formatDate, propertyHasRequired, getReferenceSourceBadge } from "./propertyRegistryUtils";

function RequiredAsterisk() {
  return <span className="propertyRegistryRequired" title="Обязательное">*</span>;
}

function UnusedBadge() {
  return <span className="propertyRegistryUnusedBadge">Не используется</span>;
}

function ModifiedBadge({ updatedAt }) {
  return <span className="propertyRegistryModifiedBadge" title={`Обновлено: ${formatDate(updatedAt)}`}>Изменено</span>;
}

function SystemLock() {
  return <span className="propertyRegistrySystemLock" title="Системное свойство">🔒</span>;
}

function ReferenceTooltip({ options }) {
  if (!options?.length) return null;
  return (
    <div className="propertyRegistryReferenceTooltip">
      {options.slice(0, 5).map((opt) => (
        <div key={opt.id}>{opt.name} {opt.unit ? `(${opt.unit})` : ""}</div>
      ))}
      {options.length > 5 && <div>+ ещё {options.length - 5}</div>}
    </div>
  );
}

export default function PropertyRegistryTable({ properties, sort, onSort }) {
  const headers = [
    { key: "display_name", label: "Название" },
    { key: "id", label: "ID" },
    { key: "property_type", label: "Тип" },
    { key: "applicable_to", label: "Применимо к" },
    { key: "category", label: "Категория" },
    { key: "source", label: "Источник" },
    { key: "editable", label: "Редактируемо" },
    { key: "version", label: "Версия" },
    { key: "updated_at", label: "Обновлено" },
    { key: "usage_count", label: "Использований" },
  ];

  return (
    <table className="propertyRegistryTable">
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h.key} onClick={() => onSort(h.key)} className={sort.key === h.key ? `sorted-${sort.dir}` : ""}>
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {properties.map((row) => {
          const isUnused = (row.usage_count || 0) === 0;
          const isSystem = row.source === "system";
          return (
            <tr
              key={row.id}
              className={[
                isUnused && "propertyRegistryRow--unused",
                isSystem && "propertyRegistryRow--system",
              ].filter(Boolean).join(" ")}
            >
              <td>
                {row.display_name}
                {propertyHasRequired(row.validation_rules) && <RequiredAsterisk />}
                {row.version > 1 && <ModifiedBadge updatedAt={row.updated_at} />}
              </td>
              <td>{row.id}</td>
              <td>{formatPropertyType(row.property_type)}</td>
              <td>{(row.applicable_to || []).join(", ")}</td>
              <td>{row.category}</td>
              <td>{row.source} {isSystem && <SystemLock />}</td>
              <td>{row.editable ? "Да" : "Нет"}</td>
              <td>{row.version}</td>
              <td>{formatDate(row.updated_at)}</td>
              <td>
                <span className="propertyRegistryUsageCount">{row.usage_count || 0}</span>
                {isUnused && <UnusedBadge />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

**Step 4: Update page**

Replace the body of `ProcessPropertiesRegistryPage.jsx` with a loader that calls `apiQueryPropertyRegistry` and renders `PropertyRegistryTable` + `PropertyRegistryFilters` + export buttons.

```jsx
import { apiQueryPropertyRegistry, apiExportPropertyRegistry } from "../../../lib/api.js";
import PropertyRegistryTable from "../../../features/analytics/propertyRegistry/PropertyRegistryTable.jsx";
import PropertyRegistryFilters from "../../../features/analytics/propertyRegistry/PropertyRegistryFilters.jsx";

export default function ProcessPropertiesRegistryPage({ scope = "workspace", ... }) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ search: "", category: "all", source: "all", editable: "all" });
  const [sort, setSort] = useState({ key: "display_name", dir: "asc" });

  useEffect(() => {
    setLoading(true);
    apiQueryPropertyRegistry({
      category: filters.category,
      source: filters.source === "all" ? "" : filters.source,
      editable: filters.editable,
      search: filters.search,
    }).then((res) => {
      setProperties(res.properties || []);
      setLoading(false);
    });
  }, [filters]);

  const sorted = useMemo(() => {
    const list = [...properties];
    list.sort((a, b) => {
      const av = a[sort.key] ?? "";
      const bv = b[sort.key] ?? "";
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [properties, sort]);

  return (
    <div className="processPropertiesRegistryPage">
      <div className="propertyRegistryToolbar">
        <PropertyRegistryFilters filters={filters} onChange={setFilters} />
        <div className="propertyRegistryActions">
          <button onClick={() => apiExportPropertyRegistry("csv", filters)}>CSV</button>
          <button onClick={() => apiExportPropertyRegistry("xlsx", filters)}>Excel</button>
        </div>
      </div>
      {loading ? <LoadingSkeleton /> : <PropertyRegistryTable properties={sorted} sort={sort} onSort={setSort} />}
    </div>
  );
}
```

**Step 5: Add minimal CSS**

Append to `frontend/src/styles/tailwind.css` or a dedicated module:

```css
.propertyRegistryTable { width: 100%; border-collapse: collapse; }
.propertyRegistryTable th, .propertyRegistryTable td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: left; }
.propertyRegistryTable th { cursor: pointer; background: #f9fafb; }
.propertyRegistryTable th.sorted-asc::after { content: " ▲"; }
.propertyRegistryTable th.sorted-desc::after { content: " ▼"; }
.propertyRegistryRow--unused { opacity: 0.6; }
.propertyRegistryRow--system { background: #f3f4f6; }
.propertyRegistryRequired { color: #ef4444; margin-left: 4px; }
.propertyRegistryUnusedBadge { margin-left: 8px; font-size: 11px; color: #6b7280; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 4px; }
.propertyRegistryModifiedBadge { margin-left: 8px; font-size: 11px; color: #d97706; background: #fffbeb; padding: 2px 6px; border-radius: 4px; }
.propertyRegistrySystemLock { margin-left: 4px; }
.propertyRegistryFilters { display: flex; gap: 12px; margin-bottom: 16px; }
.propertyRegistryFilters input, .propertyRegistryFilters select { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 4px; }
.propertyRegistryToolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
```

**Step 6: Run frontend build**

```bash
cd /root/processmap_v1/frontend && npm run build
```

Expected: PASS.

**Step 7: Commit**

```bash
git add frontend/src/features/analytics/propertyRegistry/ frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx frontend/src/styles/tailwind.css frontend/src/lib/api.js frontend/src/lib/apiRoutes.js
git commit -m "feat(registry): extended property registry table with filters, sort, conditional formatting, export"
```

---

## Task 7: Backend tests

**Files:**
- Modify: `backend/tests/test_process_properties_registry_api.py`

Add tests:

```python
def test_property_registry_query_returns_metadata_with_usage(self):
    res = self._query_registry()
    self.assertTrue(res.get("ok"))
    properties = res.get("properties", [])
    self.assertTrue(any(p["id"] == "ingredient" for p in properties))
    ingredient = next(p for p in properties if p["id"] == "ingredient")
    self.assertEqual(ingredient["category"], "materials")
    self.assertEqual(ingredient["property_type"], "reference")
    self.assertIn("usage_count", ingredient)


def test_property_registry_query_filters_by_category(self):
    res = self._query_registry(category="materials")
    ids = {p["id"] for p in res.get("properties", [])}
    self.assertIn("ingredient", ids)
    self.assertNotIn("duration", ids)


def test_property_registry_export_csv(self):
    res = self._export_registry("csv")
    self.assertEqual(res.status_code, 200)
    self.assertIn("text/csv", res.headers.get("content-type"))
    body = res.body.decode("utf-8-sig")
    self.assertIn("Идентификатор;Название", body)


def test_property_registry_export_xlsx(self):
    res = self._export_registry("xlsx")
    self.assertEqual(res.status_code, 200)
    self.assertIn("spreadsheetml.sheet", res.headers.get("content-type"))


def test_reference_options_ingredients(self):
    res = self._get("/api/reference/table/ingredients/options?q=мука")
    self.assertTrue(res.get("ok"))
    self.assertTrue(any("Мука" in item.get("name", "") for item in res.get("items", [])))
```

Run:

```bash
python -m pytest tests/test_process_properties_registry_api.py -v
```

Expected: PASS.

**Commit**

```bash
git add backend/tests/test_process_properties_registry_api.py
git commit -m "test(registry): cover query, filters, export and reference resolver"
```

---

## Task 8: Full build & verification

**Step 1: Backend tests**

```bash
cd /root/processmap_v1/backend && python -m pytest tests/test_process_properties_registry_api.py -v
```

**Step 2: Frontend build**

```bash
cd /root/processmap_v1/frontend && npm run build
```

**Step 3: Deploy**

```bash
cd /root/processmap_v1 && ./deploy/deploy.sh
```

**Step 4: Manual verification**

- Open `http://clearvestnic.ru:5177/app/registry/properties`.
- Confirm table shows 15 columns, conditional formatting, filters.
- Download CSV and XLSX, verify contents.
- Screenshot for proof.

**Step 5: Push branch**

```bash
git push new-origin feature/property-registry-table-export
```

---

## Spec coverage check

| Requirement | Task |
|-------------|------|
| 15-column extended schema | Task 1 + 3 + 6 |
| Conditional formatting | Task 6 |
| CSV + simple Excel export | Task 4 + 6 |
| Universal reference resolver | Task 2 |
| `ingredients`/`equipment`/`containers` tables | Task 1 |
| `usage_count` derived | Task 3 |
| `npm run build` PASS | Task 6 + 8 |
| Backend tests | Task 7 |

**Out of scope per Phase 1:** inline/batch editing, drill-down, category tree, import, advanced filters, permissions, canvas highlight.
