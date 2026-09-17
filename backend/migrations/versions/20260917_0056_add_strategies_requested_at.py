"""Let a study pack be ready before its strategies are.

The strategies are written next to the pack but no longer hold it back, so a
project can be ready while they are still on the way. The timestamp tells the
app to wait for them, and lets a lost wait expire.

Revision ID: 20260917_0056
Revises: 20260914_0055
"""

import sqlalchemy as sa
from alembic import op

revision = "20260917_0056"
down_revision = "20260914_0055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "study_projects",
        sa.Column(
            "strategies_requested_at", sa.DateTime(timezone=True), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("study_projects", "strategies_requested_at")
