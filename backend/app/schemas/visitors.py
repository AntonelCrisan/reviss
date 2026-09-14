import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class VisitorPingRequest(BaseModel):
    path: str | None = Field(default=None, max_length=300)


class VisitorPingResponse(BaseModel):
    tracked: bool


class VisitorStatsResponse(BaseModel):
    total_visitors: int
    visitors_today: int
    visitors_last_7_days: int
    visitors_last_30_days: int


class VisitorVisitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    visitor_hash: str
    visit_date: date
    path: str | None
    created_at: datetime


class VisitorVisitListResponse(BaseModel):
    """A page of visits plus how many match the filter."""

    items: list[VisitorVisitResponse]
    total: int
