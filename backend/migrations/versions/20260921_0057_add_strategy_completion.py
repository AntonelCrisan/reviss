"""Let a student mark a strategy step as done.

The strategies are a route through the course, walked in order, so each step
records when it was completed.

Revision ID: 20260921_0057
Revises: 20260917_0056
"""

import sqlalchemy as sa
from alembic import op

revision = "20260921_0057"
down_revision = "20260917_0056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "study_project_strategies",
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("study_project_strategies", "completed_at")
