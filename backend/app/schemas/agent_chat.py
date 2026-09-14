"""Pydantic-схемы для AGENT-0 PROCESSMAN chat."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SourceRef(BaseModel):
    """Источник RAG-цитаты в ответе агента (cite-контракт E2, контракт общий
    с agent-сервисом; монолитный контур retrieval не выполняет и поле не заполняет)."""

    source_id: str = Field(..., description="Уникальный id чанка-источника (chunk_id).")
    source_type: str = Field(default="", description="Тип корпуса: bpmn_xml | property_dictionary | ...")
    session_id: Optional[str] = Field(default=None, description="Сессия-источник (для bpmn_xml).")
    session_title: Optional[str] = Field(default=None, description="Название сессии-источника.")
    process_layer: Optional[str] = Field(default=None, description="as_is | to_be (после E1 #972).")
    element_id: Optional[str] = Field(default=None, description="BPMN-элемент-источник (навигация для E5).")
    element_name: Optional[str] = Field(default=None, description="Имя BPMN-элемента-источника.")
    snippet: str = Field(default="", description="Фрагмент чанка (~200 символов).")
    score: float = Field(default=0.0, description="BM25-скор чанка.")


class AgentChatIn(BaseModel):
    message: str = Field(default="", description="Свободное текстовое сообщение пользователя.")
    selected_step_id: Optional[str] = Field(default=None, description="Текущий выбранный узел схемы.")
    client_turn_id: Optional[str] = Field(
        default=None,
        description="UUID реплики от фронта. Защита от дабл-клика: повтор с тем же id вернёт существующий turn.",
    )


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
    sources: Optional[List[SourceRef]] = Field(
        default=None,
        description="Процитированные RAG-источники (null — retrieval не участвовал или деградация).",
    )


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


class AgentAnalysisArtifactOut(BaseModel):
    """Сохранённый артефакт фонового анализа сессии (bpmn_meta.agent_analysis_v1)."""

    artifact: Dict[str, Any] = Field(default_factory=dict, description="Полный артефакт анализа.")
    schema_version: str = Field(default="", description="Версия схемы артефакта.")
    version: int = Field(default=0, description="Версия сессии на момент чтения.")
    updated_at: str = Field(default="", description="Время генерации артефакта (ISO).")
