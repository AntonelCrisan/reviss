from datetime import datetime

from pydantic import BaseModel


class UsageResponse(BaseModel):
    """This cycle's consumption against the allowances.

    Each ``*_limit`` is the whole allowance, plan plus anything bought. The
    matching ``*_extra`` says how much of that came from a purchase, so the UI
    can show the two apart without recomputing the split itself.
    """

    projects_used: int
    projects_limit: int
    projects_extra: int
    materials_used: int
    materials_limit: int
    materials_extra: int
    pages_processed: int
    pages_limit: int
    pages_extra: int
    ai_credits_used: int
    ai_credits_limit: int
    ai_credits_extra: int
    ocr_pages_used: int
    ocr_pages_limit: int
    ocr_pages_extra: int
    reset_date: datetime
