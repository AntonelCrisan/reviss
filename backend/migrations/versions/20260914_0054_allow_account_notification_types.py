"""Let the account alerts be stored at all.

The notifications table whitelists its type column, so adding a type to the
Python Literal is not enough: the insert is refused and the notification never
appears.

Revision ID: 20260914_0054
Revises: 20260914_0053
"""

from alembic import op

revision = "20260914_0054"
down_revision = "20260914_0053"
branch_labels = None
depends_on = None

OLD_TYPES = (
    "project_ready",
    "weak_concepts",
    "daily_review",
    "weekly_progress",
    "inactivity_reminder",
    "streak_milestone",
)
NEW_TYPES = (*OLD_TYPES, "usage_limit", "subscription_expiring")


# The metadata naming convention renders "ck_<table>_<name>", so the bare name
# is what produces ck_notifications_type. Passing the full name would ask for
# ck_notifications_ck_notifications_type, which does not exist.
CONSTRAINT_NAME = "type"


def _values(types: tuple[str, ...]) -> str:
    return ", ".join(f"'{name}'" for name in types)


def upgrade() -> None:
    op.drop_constraint(CONSTRAINT_NAME, "notifications", type_="check")
    op.create_check_constraint(
        CONSTRAINT_NAME,
        "notifications",
        f"type IN ({_values(NEW_TYPES)})",
    )


def downgrade() -> None:
    # Rows of the new types would violate the narrower constraint.
    op.execute(
        "DELETE FROM notifications "
        "WHERE type IN ('usage_limit', 'subscription_expiring')"
    )
    op.drop_constraint(CONSTRAINT_NAME, "notifications", type_="check")
    op.create_check_constraint(
        CONSTRAINT_NAME,
        "notifications",
        f"type IN ({_values(OLD_TYPES)})",
    )
