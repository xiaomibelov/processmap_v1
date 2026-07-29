from __future__ import annotations

from typing import Any, Dict, List, Optional

from .repository import ProcessTemplateRepository
from .models import ProcessTemplateCreate, ProcessTemplateUpdate


class ProcessTemplateService:
    def __init__(self):
        self.repository = ProcessTemplateRepository()

    def create_template(self, data: ProcessTemplateCreate) -> Dict[str, Any]:
        return self.repository.create(data.dict())

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        return self.repository.get_by_id(template_id)

    def list_templates(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        return self.repository.list(limit, offset)

    def update_template(self, template_id: str, data: ProcessTemplateUpdate) -> Optional[Dict[str, Any]]:
        return self.repository.update(template_id, data.dict(exclude_unset=True))

    def publish_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        return self.repository.publish(template_id)
