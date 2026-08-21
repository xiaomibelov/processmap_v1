from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, Request

from ..storage import _connect

router = APIRouter(prefix="/api/dictionaries", tags=["dictionaries"])


@router.get("/equipment-types")
async def list_equipment_types(
    request: Request,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    category: Optional[str] = Query(None)
) -> List[Dict[str, Any]]:
    conn = _connect()
    
    if category:
        result = conn.execute("""
            SELECT id, code, name, category, description
            FROM equipment_types
            WHERE category = %s
            ORDER BY code
            LIMIT %s OFFSET %s
        """, (category, limit, offset))
    else:
        result = conn.execute("""
            SELECT id, code, name, category, description
            FROM equipment_types
            ORDER BY code
            LIMIT %s OFFSET %s
        """, (limit, offset))
    
    items = []
    for row in result.fetchall():
        items.append({
            "id": row[0],
            "code": row[1],
            "name": row[2],
            "category": row[3],
            "description": row[4]
        })
    
    return items


@router.get("/container-types")
async def list_container_types(
    request: Request,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    category: Optional[str] = Query(None)
) -> List[Dict[str, Any]]:
    conn = _connect()
    
    if category:
        result = conn.execute("""
            SELECT id, code, name, category, description
            FROM container_types
            WHERE category = %s
            ORDER BY code
            LIMIT %s OFFSET %s
        """, (category, limit, offset))
    else:
        result = conn.execute("""
            SELECT id, code, name, category, description
            FROM container_types
            ORDER BY code
            LIMIT %s OFFSET %s
        """, (limit, offset))
    
    items = []
    for row in result.fetchall():
        items.append({
            "id": row[0],
            "code": row[1],
            "name": row[2],
            "category": row[3],
            "description": row[4]
        })
    
    return items


@router.get("/zone-types")
async def list_zone_types(
    request: Request,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    category: Optional[str] = Query(None)
) -> List[Dict[str, Any]]:
    conn = _connect()
    
    if category:
        result = conn.execute("""
            SELECT id, code, name, category, description
            FROM zone_types
            WHERE category = %s
            ORDER BY code
            LIMIT %s OFFSET %s
        """, (category, limit, offset))
    else:
        result = conn.execute("""
            SELECT id, code, name, category, description
            FROM zone_types
            ORDER BY code
            LIMIT %s OFFSET %s
        """, (limit, offset))
    
    items = []
    for row in result.fetchall():
        items.append({
            "id": row[0],
            "code": row[1],
            "name": row[2],
            "category": row[3],
            "description": row[4]
        })
    
    return items


@router.get("/sku")
async def list_sku(
    request: Request,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    category: Optional[str] = Query(None)
) -> List[Dict[str, Any]]:
    conn = _connect()
    
    if category:
        result = conn.execute("""
            SELECT id, code, name, description, category
            FROM sku
            WHERE category = %s
            ORDER BY code
            LIMIT %s OFFSET %s
        """, (category, limit, offset))
    else:
        result = conn.execute("""
            SELECT id, code, name, description, category
            FROM sku
            ORDER BY code
            LIMIT %s OFFSET %s
        """, (limit, offset))
    
    items = []
    for row in result.fetchall():
        items.append({
            "id": row[0],
            "code": row[1],
            "name": row[2],
            "description": row[3],
            "category": row[4]
        })
    
    return items
