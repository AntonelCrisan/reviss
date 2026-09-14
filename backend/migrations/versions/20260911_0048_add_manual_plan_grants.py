"""Let an admin put a user on a paid plan without a Stripe subscription.

Revision ID: 20260911_0048
Revises: 20260907_0047
"""

import sqlalchemy as sa
from alembic import op

revision = "20260911_0048"
down_revision = "20260907_0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "manual_plan_grants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("granted_by_id", sa.Uuid(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by_id", sa.Uuid(), nullable=True),
        sa.Column("revoke_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["subscription_plans.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["granted_by_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["revoked_by_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_manual_plan_grants_user_id",
        "manual_plan_grants",
        ["user_id"],
    )
    # Only one grant may be live per user; revoked rows stay for the audit trail.
    op.create_index(
        "uq_manual_plan_grants_active_user",
        "manual_plan_grants",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_manual_plan_grants_active_user", table_name="manual_plan_grants")
    op.drop_index("ix_manual_plan_grants_user_id", table_name="manual_plan_grants")
    op.drop_table("manual_plan_grants")
