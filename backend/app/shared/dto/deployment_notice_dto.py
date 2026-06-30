from pydantic import BaseModel, Field


class DeploymentNoticeIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    scheduled_at: int = Field(..., ge=0)
    display_duration_minutes: int = Field(default=0, ge=0)


class DeploymentNoticeOut(BaseModel):
    id: str
    message: str
    scheduled_at: int
    display_duration_minutes: int
    is_active: bool
    created_by: str
    created_at: int
