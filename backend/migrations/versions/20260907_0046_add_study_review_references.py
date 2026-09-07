"""Save verified summary references for keywords and quiz remediation.

Revision ID: 20260907_0046
Revises: 20260907_0045
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260907_0046"
down_revision: str | Sequence[str] | None = "20260907_0045"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing content remains readable without inventing references.
    op.add_column("study_project_keywords", sa.Column("paragraph_index", sa.Integer()))
    for name, type_ in (
        ("concept", sa.String(180)),
        ("review_section", sa.Text()),
        ("review_paragraph_index", sa.Integer()),
        ("review_anchor_text", sa.String(240)),
        ("review_advice", sa.Text()),
    ):
        op.add_column("study_project_quiz_questions", sa.Column(name, type_))


def downgrade() -> None:
    for name in (
        "review_advice",
        "review_anchor_text",
        "review_paragraph_index",
        "review_section",
        "concept",
    ):
        op.drop_column("study_project_quiz_questions", name)
    op.drop_column("study_project_keywords", "paragraph_index")
