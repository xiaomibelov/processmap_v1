"""Pydantic-схемы PROCESSMAN chat — копия backend/app/schemas/agent_chat.py (AGENT-0).

DTO идентичны монолитным: контракт публичных endpoints сервиса совпадает
поле-в-поле с монолитным /api/sessions/{id}/agent/chat|history.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class AgentChatIn(BaseModel):
    message: str = Field(default="", description="Свободное текстовое сообщение пользователя.")
    selected_step_id: Optional[str] = Field(default=None, description="Текущий выбранный узел схемы.")
    client_turn_id: Optional[str] = Field(
        default=None,
        description="UUID реплики от фронта. Защита от дабл-клика: повтор с тем же id вернёт существующий turn.",
    )

    model_config = {"extra": "forbid"}


class AgentChatOut(BaseModel):
    ok: bool = Field(..., description="Успешность ответа.")
    status: str = Field(
        ...,
        description="Статус ответа: ok | disabled | rate_limited | no_provider | error | bad_request.",
    )
    error: str = Field(default="", description="Человекочитаемое описание ошибки (при ok=false).")
    message: str = Field(..., description="Текстовая часть ответа ассистента.")
    action: Optional[str] = Field(default=None, description="Вызванное действие: suggest-next | explain-step | step-qa.")
    action_payload: Dict[str, Any] = Field(default_factory=dict, description="Результат выполненного действия.")
    usage: Dict[str, Any] = Field(default_factory=dict, description="Токены и метаданные LLM-вызова.")
    projection_digest: str = Field(default="", description="Digest схемы на момент ответа.")


class AgentTurnOut(BaseModel):
    id: str
    role: str
    content: Dict[str, Any] = Field(default_factory=dict)
    action: Optional[str] = None
    action_payload: Dict[str, Any] = Field(default_factory=dict)
    projection_digest: Optional[str] = None
    usage: Dict[str, Any] = Field(default_factory=dict)
    created_at: int
    client_turn_id: Optional[str] = None


class AgentHistoryOut(BaseModel):
    turns: list[AgentTurnOut] = Field(default_factory=list)
