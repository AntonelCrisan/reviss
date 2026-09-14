"""Sell extra capacity by the unit, for the current billing cycle.

Each resource has its own unit price and its own Stripe Price, so a checkout
is unit price times quantity and the money arithmetic stays on Stripe's side
rather than ours.

Revision ID: 20260914_0051
Revises: 20260914_0050
"""

import sqlalchemy as sa
from alembic import op

revision = "20260914_0051"
down_revision = "20260914_0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "addon_resources",
        sa.Column("id", sa.Uuid(), nullable=False),
        # Matches the capacity column it tops up, so the credit step needs no
        # translation table between the two.
        sa.Column("resource_key", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("unit_label", sa.String(length=60), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "unit_price_ron", sa.Numeric(precision=10, scale=2), nullable=False
        ),
        sa.Column("stripe_product_id", sa.String(length=120), nullable=True),
        sa.Column("stripe_price_id", sa.String(length=120), nullable=True),
        # Stripe refuses charges below a per-currency floor, so a resource
        # priced in small units needs a minimum order that clears it.
        sa.Column(
            "min_quantity", sa.Integer(), nullable=False, server_default="10"
        ),
        sa.Column(
            "max_quantity", sa.Integer(), nullable=False, server_default="500"
        ),
        sa.Column("step", sa.Integer(), nullable=False, server_default="10"),
        sa.Column(
            "is_visible", sa.Boolean(), nullable=False, server_default="true"
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
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
        sa.PrimaryKeyConstraint("id", name="pk_addon_resources"),
        sa.UniqueConstraint("resource_key", name="uq_addon_resources_resource_key"),
        sa.UniqueConstraint(
            "stripe_price_id", name="uq_addon_resources_stripe_price_id"
        ),
        sa.CheckConstraint(
            "min_quantity >= 1 AND max_quantity >= min_quantity AND step >= 1",
            name="ck_addon_resources_quantity_bounds",
        ),
    )

    op.create_table(
        "addon_purchases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        # Written before the redirect to Stripe and flipped to paid on the way
        # back. Keeping the basket here rather than in Stripe metadata avoids
        # its size limits and leaves abandoned checkouts visible.
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="pending"
        ),
        sa.Column(
            "stripe_checkout_session_id", sa.String(length=200), nullable=False
        ),
        sa.Column(
            "stripe_payment_intent_id", sa.String(length=200), nullable=True
        ),
        sa.Column("amount_paid", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "currency", sa.String(length=12), nullable=False, server_default="RON"
        ),
        # What was bought, per resource. Quantities are fixed at checkout time,
        # so repricing a resource later cannot rewrite an earlier order.
        sa.Column(
            "extra_projects", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "extra_materials", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("extra_pages", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "extra_ai_credits", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "extra_ocr_pages", sa.Integer(), nullable=False, server_default="0"
        ),
        # The billing cycle this order belongs to, captured at checkout. It is
        # the real subscription period, never a window an admin reset moved:
        # otherwise resetting an account would void capacity already paid for.
        sa.Column("cycle_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cycle_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_addon_purchases_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_addon_purchases"),
        # Stripe retries webhooks and the browser syncs the same session, so a
        # session must never be credited twice.
        sa.UniqueConstraint(
            "stripe_checkout_session_id",
            name="uq_addon_purchases_stripe_checkout_session_id",
        ),
    )
    # The balance lookup runs on every authenticated request and only ever
    # wants paid rows inside the live cycle. A plain index on user_id would be
    # redundant beside this one: user_id is its leading column, so any lookup
    # by user alone can use it as a prefix.
    op.create_index(
        "ix_addon_purchases_user_status_cycle",
        "addon_purchases",
        ["user_id", "status", "cycle_start", "cycle_end"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_addon_purchases_user_status_cycle", table_name="addon_purchases"
    )
    op.drop_table("addon_purchases")
    op.drop_table("addon_resources")
