"""Reach accounts that signed up and then did nothing.

The inactivity reminder starts from the last day of study, so someone who
never studied at all has no last day and never hears from us again. These
nudges cover exactly that gap, and get their own switch: a student who wants
study reminders may still not want us writing about getting started.

Revision ID: 20260928_0059
Revises: 20260921_0058
"""

import sqlalchemy as sa
from alembic import op

revision = "20260928_0059"
down_revision = "20260921_0058"
branch_labels = None
depends_on = None

OLD_TYPES = (
    "project_ready",
    "weak_concepts",
    "daily_review",
    "weekly_progress",
    "inactivity_reminder",
    "streak_milestone",
    "usage_limit",
    "subscription_expiring",
)
NEW_TYPES = (*OLD_TYPES, "study_nudge")

# The metadata naming convention renders "ck_<table>_<name>", so the bare name
# is what produces ck_notifications_type.
CONSTRAINT_NAME = "type"


def _values(types: tuple[str, ...]) -> str:
    return ", ".join(f"'{name}'" for name in types)


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "notify_tips_reminders",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )
    op.drop_constraint(CONSTRAINT_NAME, "notifications", type_="check")
    op.create_check_constraint(
        CONSTRAINT_NAME,
        "notifications",
        f"type IN ({_values(NEW_TYPES)})",
    )


def downgrade() -> None:
    op.execute("DELETE FROM notifications WHERE type = 'study_nudge'")
    op.drop_constraint(CONSTRAINT_NAME, "notifications", type_="check")
    op.create_check_constraint(
        CONSTRAINT_NAME,
        "notifications",
        f"type IN ({_values(OLD_TYPES)})",
    )
    op.drop_column("user_preferences", "notify_tips_reminders")
