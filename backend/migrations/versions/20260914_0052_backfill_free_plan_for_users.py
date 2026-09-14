"""Put every planless account back on the free plan.

Registration used to leave ``users.current_plan_id`` empty and the entitlement
code filled the gap with hardcoded free limits. That fallback is gone -- a
missing plan is now refused -- so accounts created before this point have to be
pointed at the free plan, or they cannot create a project at all.

Revision ID: 20260914_0052
Revises: 20260914_0051
"""

from alembic import op

revision = "20260914_0052"
down_revision = "20260914_0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE users
        SET current_plan_id = (
            SELECT id FROM subscription_plans WHERE slug = 'start' LIMIT 1
        )
        WHERE current_plan_id IS NULL
          AND EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'start')
        """
    )


def downgrade() -> None:
    # The plan each account had before is not recorded anywhere, so there is
    # nothing to restore; leaving them on the free plan is the safe direction.
    pass
