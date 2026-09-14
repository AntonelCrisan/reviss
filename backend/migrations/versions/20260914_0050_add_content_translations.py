"""Store plan copy and legal documents per language.

Romanian stays the source of truth: every lookup falls back to it, so a
missing translation degrades to Romanian text rather than to an empty page.

Revision ID: 20260914_0050
Revises: 20260914_0049
"""

import sqlalchemy as sa
from alembic import op

revision = "20260914_0050"
down_revision = "20260914_0049"
branch_labels = None
depends_on = None

DEFAULT_LOCALE = "ro"


def upgrade() -> None:
    op.create_table(
        "subscription_plan_translations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("locale", sa.String(length=8), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("material_limit", sa.Text(), nullable=True),
        sa.Column("ai_level", sa.Text(), nullable=True),
        sa.Column("storage", sa.Text(), nullable=True),
        sa.Column("conditions", sa.Text(), nullable=True),
        sa.Column("badge", sa.String(length=80), nullable=True),
        sa.Column("discount_label", sa.String(length=120), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["subscription_plans.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "plan_id",
            "locale",
            name="uq_subscription_plan_translations_plan_locale",
        ),
    )

    op.create_table(
        "subscription_plan_feature_translations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("feature_id", sa.Uuid(), nullable=False),
        sa.Column("locale", sa.String(length=8), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["feature_id"],
            ["subscription_plan_features.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "feature_id",
            "locale",
            name="uq_plan_feature_translations_feature_locale",
        ),
    )

    # Legal documents are versioned per language as whole documents, not field
    # by field: a translated policy has its own sections and its own revision
    # date, and must be publishable independently of the Romanian original.
    op.add_column(
        "legal_documents",
        sa.Column(
            "locale",
            sa.String(length=8),
            nullable=False,
            server_default=DEFAULT_LOCALE,
        ),
    )
    op.drop_constraint(
        "uq_legal_documents_slug",
        "legal_documents",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_legal_documents_slug_locale",
        "legal_documents",
        ["slug", "locale"],
    )


def downgrade() -> None:
    # Only the Romanian originals can survive a single-slug constraint.
    op.execute("DELETE FROM legal_documents WHERE locale <> 'ro'")
    op.drop_constraint(
        "uq_legal_documents_slug_locale",
        "legal_documents",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_legal_documents_slug",
        "legal_documents",
        ["slug"],
    )
    op.drop_column("legal_documents", "locale")
    op.drop_table("subscription_plan_feature_translations")
    op.drop_table("subscription_plan_translations")
