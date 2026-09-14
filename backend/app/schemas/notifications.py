import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

NotificationType = Literal[
    "project_ready",
    "weak_concepts",
    "daily_review",
    "weekly_progress",
    "inactivity_reminder",
    "streak_milestone",
    "usage_limit",
    "subscription_expiring",
]


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: NotificationType
    title: str
    body: str
    project_id: uuid.UUID | None
    project_name: str | None = None
    created_at: datetime
    read_at: datetime | None


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int
