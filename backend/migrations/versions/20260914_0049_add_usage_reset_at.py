"""Let an admin start a fresh usage cycle for one account.

Revision ID: 20260914_0049
Revises: 20260911_0048
"""

import sqlalchemy as sa
from alembic import op

revision = "20260914_0049"
down_revision = "20260911_0048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("usage_reset_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "usage_reset_at")
