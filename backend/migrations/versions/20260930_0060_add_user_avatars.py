"""Let people put a picture where their initials are.

The image lives in its own table: a user row is read on every request, and a
few dozen kilobytes of picture riding along with it would be paid for on all
of them. Only the timestamp stays on the user, because that is what tells the
interface a picture exists and what makes the browser fetch a new one.

Revision ID: 20260930_0060
Revises: 20260928_0059
"""

import sqlalchemy as sa
from alembic import op

revision = "20260930_0060"
down_revision = "20260928_0059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("avatar_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "user_avatars",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("content_type", sa.String(length=40), nullable=False),
        sa.Column("image", sa.LargeBinary(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_avatars")
    op.drop_column("users", "avatar_updated_at")
