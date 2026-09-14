"""Let the audit search stay usable as the log grows.

The admin search is a "contains" over the people-identifying columns, which no
btree index can serve: every term starts with a wildcard. Measured on 300k
rows it took 294 ms and grew linearly, so it would cross a second somewhere
around a million entries.

Trigram indexes on the three searched columns bring the same query to 9 ms.
The cost is about 80 MB per million rows and roughly 35 microseconds added to
each insert, which is not measurable next to the request that caused it.

`resource_id` is deliberately left out: indexing UUIDs for trigram search cost
more than the other three together (43 MB against 24 MB at 300k) while an
exact match already runs in 0.1 ms on ix_audit_logs_resource.

Revision ID: 20260914_0055
Revises: 20260914_0054
Create Date: 2026-09-14
"""

from alembic import op
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError

revision = "20260914_0055"
down_revision = "20260914_0054"
branch_labels = None
depends_on = None

# (index name, indexed column)
TRIGRAM_INDEXES = (
    ("ix_audit_logs_actor_email_trgm", "actor_email"),
    ("ix_audit_logs_actor_name_trgm", "actor_name"),
    ("ix_audit_logs_ip_address_trgm", "ip_address"),
)


def upgrade() -> None:
    connection = op.get_bind()

    try:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    except ProgrammingError:
        # Creating an extension needs a privilege the deploy role may not have.
        # Search still works without the indexes, only slower, so a missing
        # privilege must not stop the release.
        print(
            "pg_trgm nu a putut fi activat; cautarea in jurnal ramane fara "
            "index. Ruleaza 'CREATE EXTENSION pg_trgm' cu un rol privilegiat "
            "si apoi aceasta migratie din nou."
        )
        return

    for index_name, column in TRIGRAM_INDEXES:
        connection.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS {index_name} "
                f"ON audit_logs USING gin ({column} gin_trgm_ops)"
            )
        )


def downgrade() -> None:
    connection = op.get_bind()
    for index_name, _ in TRIGRAM_INDEXES:
        connection.execute(text(f"DROP INDEX IF EXISTS {index_name}"))

    # The extension is left in place: something else may have come to rely on
    # it, and dropping it would take those indexes with it.
