from __future__ import annotations

from fastapi import APIRouter

from ..storage import _connect

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("/process-template")
async def health_check():
    try:
        conn = _connect()
        result = conn.execute("SELECT 1")
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    # Check if tables exist
    try:
        conn = _connect()
        result = conn.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = %s)", ("process_template",))
        row = result.fetchone()
        process_template_exists = bool(row[0]) if row else False
        
        result = conn.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = %s)", ("recipe",))
        row = result.fetchone()
        recipe_exists = bool(row[0]) if row else False
    except Exception as e:
        process_template_exists = False
        recipe_exists = False
    
    return {
        "status": "ok" if db_status == "connected" and process_template_exists and recipe_exists else "error",
        "database": db_status,
        "process_template_table": "exists" if process_template_exists else "missing",
        "recipe_table": "exists" if recipe_exists else "missing"
    }
