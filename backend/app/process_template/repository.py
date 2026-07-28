from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional
from datetime import datetime

from ..storage import _connect


class ProcessTemplateRepository:
    def __init__(self):
        self.conn = _connect()

    def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        template_id = str(uuid.uuid4())
        now = datetime.utcnow()
        
        query = """
            INSERT INTO process_template (id, name, version, status, ui_model, created_by, updated_at, published_at, audit_metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, name, version, status, ui_model, created_by, updated_at, published_at, audit_metadata
        """
        
        with self.conn.cursor() as cur:
            cur.execute(query, (
                template_id,
                data["name"],
                data["version"],
                data.get("status", "draft"),
                json.dumps(data.get("ui_model")) if data.get("ui_model") else None,
                data["created_by"],
                now,
                data.get("published_at"),
                json.dumps(data.get("audit_metadata")) if data.get("audit_metadata") else None
            ))
            result = cur.fetchone()
            self.conn.commit()
            
        return {
            "id": result[0],
            "name": result[1],
            "version": result[2],
            "status": result[3],
            "ui_model": json.loads(result[4]) if result[4] else None,
            "created_by": result[5],
            "updated_at": result[6],
            "published_at": result[7],
            "audit_metadata": json.loads(result[8]) if result[8] else None
        }

    def get_by_id(self, template_id: str) -> Optional[Dict[str, Any]]:
        query = """
            SELECT id, name, version, status, ui_model, created_by, updated_at, published_at, audit_metadata
            FROM process_template
            WHERE id = %s
        """
        
        with self.conn.cursor() as cur:
            cur.execute(query, (template_id,))
            result = cur.fetchone()
            
        if not result:
            return None
            
        return {
            "id": result[0],
            "name": result[1],
            "version": result[2],
            "status": result[3],
            "ui_model": json.loads(result[4]) if result[4] else None,
            "created_by": result[5],
            "updated_at": result[6],
            "published_at": result[7],
            "audit_metadata": json.loads(result[8]) if result[8] else None
        }

    def list(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        query = """
            SELECT id, name, version, status, ui_model, created_by, updated_at, published_at, audit_metadata
            FROM process_template
            ORDER BY updated_at DESC
            LIMIT %s OFFSET %s
        """
        
        with self.conn.cursor() as cur:
            cur.execute(query, (limit, offset))
            results = cur.fetchall()
            
        templates = []
        for result in results:
            templates.append({
                "id": result[0],
                "name": result[1],
                "version": result[2],
                "status": result[3],
                "ui_model": json.loads(result[4]) if result[4] else None,
                "created_by": result[5],
                "updated_at": result[6],
                "published_at": result[7],
                "audit_metadata": json.loads(result[8]) if result[8] else None
            })
            
        return templates

    def update(self, template_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        # Build update query dynamically
        set_parts = []
        values = []
        
        for key, value in data.items():
            if key in ["name", "version", "status", "created_by"]:
                set_parts.append(f"{key} = %s")
                values.append(value)
            elif key in ["ui_model", "audit_metadata"]:
                set_parts.append(f"{key} = %s")
                values.append(json.dumps(value) if value else None)
        
        if not set_parts:
            return self.get_by_id(template_id)
        
        set_parts.append("updated_at = %s")
        values.append(datetime.utcnow())
        values.append(template_id)
        
        query = f"""
            UPDATE process_template
            SET {", ".join(set_parts)}
            WHERE id = %s
            RETURNING id, name, version, status, ui_model, created_by, updated_at, published_at, audit_metadata
        """
        
        with self.conn.cursor() as cur:
            cur.execute(query, values)
            result = cur.fetchone()
            self.conn.commit()
            
        if not result:
            return None
            
        return {
            "id": result[0],
            "name": result[1],
            "version": result[2],
            "status": result[3],
            "ui_model": json.loads(result[4]) if result[4] else None,
            "created_by": result[5],
            "updated_at": result[6],
            "published_at": result[7],
            "audit_metadata": json.loads(result[8]) if result[8] else None
        }

    def publish(self, template_id: str) -> Optional[Dict[str, Any]]:
        now = datetime.utcnow()
        
        query = """
            UPDATE process_template
            SET status = published, published_at = %s, updated_at = %s
            WHERE id = %s
            RETURNING id, name, version, status, ui_model, created_by, updated_at, published_at, audit_metadata
        """
        
        with self.conn.cursor() as cur:
            cur.execute(query, (now, now, template_id))
            result = cur.fetchone()
            self.conn.commit()
            
        if not result:
            return None
            
        return {
            "id": result[0],
            "name": result[1],
            "version": result[2],
            "status": result[3],
            "ui_model": json.loads(result[4]) if result[4] else None,
            "created_by": result[5],
            "updated_at": result[6],
            "published_at": result[7],
            "audit_metadata": json.loads(result[8]) if result[8] else None
        }
