from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ChecklistResponse(BaseModel):
    """
    Data returned for an IRC road safety checklist item.
    """

    id: int
    audit_id: int
    segment_id: int | None

    category: str
    code: str | None
    question: str

    status: str
    reason: str | None
    severity: str | None

    automated: bool
    field_verification_required: bool

    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class ChecklistSummary(BaseModel):
    """
    Lightweight checklist information for audit summaries.
    """

    id: int
    category: str
    code: str | None

    status: str
    severity: str | None

    automated: bool
    field_verification_required: bool

    model_config = ConfigDict(
        from_attributes=True,
    )