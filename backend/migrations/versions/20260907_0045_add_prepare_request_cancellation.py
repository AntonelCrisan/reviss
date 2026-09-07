"""Track cancellable project prepare requests.

Revision ID: 20260907_0045
Revises: 20260904_0044
Create Date: 2026-09-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260907_0045"
down_revision: str | Sequence[str] | None = "20260904_0044"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "study_projects",
        sa.Column("prepare_request_id", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_study_projects_prepare_request_id",
        "study_projects",
        ["prepare_request_id"],
        unique=False,
    )
    op.create_table(
        "study_project_prepare_cancellations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_study_project_prepare_cancellations_user_request",
        "study_project_prepare_cancellations",
        ["user_id", "request_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_study_project_prepare_cancellations_user_request",
        table_name="study_project_prepare_cancellations",
    )
    op.drop_table("study_project_prepare_cancellations")
    op.drop_index("ix_study_projects_prepare_request_id", table_name="study_projects")
    op.drop_column("study_projects", "prepare_request_id")