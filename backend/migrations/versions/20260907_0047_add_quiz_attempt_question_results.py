"""Keep per-question results for quiz history and review.

Revision ID: 20260907_0047
Revises: 20260907_0046
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260907_0047"
down_revision = "20260907_0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "study_project_quiz_attempts",
        sa.Column(
            "question_results",
            sa.JSON().with_variant(postgresql.JSONB(), "postgresql"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("study_project_quiz_attempts", "question_results")
