from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, Request

from ..storage import _connect

router = APIRouter(prefix="/api/operation-catalog", tags=["operation-catalog"])


@router.get("")
async def list_operations(
    request: Request,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    category: Optional[str] = Query(None)
) -> List[Dict[str, Any]]:
    conn = _connect()
    
    if category:
        result = conn.execute("""
            SELECT id, code, name, name_ru, parameter_schema, allowed_outputs, execution_contract, resource_requirements, category
            FROM operation_catalog
            WHERE category = %s
            ORDER BY code
            LIMIT %s OFFSET %s
        """, (category, limit, offset))
    else:
        result = conn.execute("""
            SELECT id, code, name, name_ru, parameter_schema, allowed_outputs, execution_contract, resource_requirements, category
            FROM operation_catalog
            ORDER BY code
            LIMIT %s OFFSET %s
        """, (limit, offset))
    
    operations = []
    for row in result.fetchall():
        operations.append({
            "id": row[0],
            "code": row[1],
            "name": row[2],
            "name_ru": row[3],
            "parameter_schema": row[4],
            "allowed_outputs": row[5],
            "execution_contract": row[6],
            "resource_requirements": row[7],
            "category": row[8]
        })
    
    return operations


@router.get("/{code}")
async def get_operation(
    request: Request,
    code: str
) -> Dict[str, Any]:
    conn = _connect()
    
    result = conn.execute("""
        SELECT id, code, name, name_ru, parameter_schema, allowed_outputs, execution_contract, resource_requirements, category
        FROM operation_catalog
        WHERE code = %s
    """, (code,))
    
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Operation not found")
    
    return {
        "id": row[0],
        "code": row[1],
        "name": row[2],
        "name_ru": row[3],
        "parameter_schema": row[4],
        "allowed_outputs": row[5],
        "execution_contract": row[6],
        "resource_requirements": row[7],
        "category": row[8]
    }
