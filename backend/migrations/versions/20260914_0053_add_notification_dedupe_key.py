"""Let a notification say what it is about, so it is sent once.

Existing generators dedupe on type plus a time window, which cannot express
"this metric, at this threshold, in this cycle". A key the caller composes can,
and a partial unique index makes the guarantee the database's rather than the
code's.

Revision ID: 20260914_0053
Revises: 20260914_0052
"""

import sqlalchemy as sa
from alembic import op

revision = "20260914_0053"
down_revision = "20260914_0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notifications",
        sa.Column("dedupe_key", sa.String(length=160), nullable=True),
    )
    # Null keys are the existing notifications, which dedupe by time window and
    # must stay free to repeat.
    op.create_index(
        "uq_notifications_user_dedupe_key",
        "notifications",
        ["user_id", "dedupe_key"],
        unique=True,
        postgresql_where=sa.text("dedupe_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_notifications_user_dedupe_key", table_name="notifications")
    op.drop_column("notifications", "dedupe_key")
