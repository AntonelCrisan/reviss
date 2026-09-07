"""Check that review references can be deployed over existing study content."""

import runpy
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_review_reference_migration_preserves_existing_content():
    migration = runpy.run_path(
        str(
            Path(__file__).resolve().parents[1]
            / "migrations/versions/20260907_0046_add_study_review_references.py"
        )
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE study_project_keywords "
                "(id INTEGER PRIMARY KEY, term TEXT NOT NULL)"
            )
        )
        connection.execute(
            sa.text(
                "CREATE TABLE study_project_quiz_questions "
                "(id INTEGER PRIMARY KEY, prompt TEXT NOT NULL)"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO study_project_keywords (id, term) "
                "VALUES (1, 'Legacy keyword')"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO study_project_quiz_questions (id, prompt) "
                "VALUES (1, 'Legacy question')"
            )
        )
        operations = Operations(MigrationContext.configure(connection))
        for name in ("upgrade", "downgrade"):
            migration[name].__globals__["op"] = operations

        migration["upgrade"]()

        added_columns = {
            "study_project_keywords": {"paragraph_index"},
            "study_project_quiz_questions": {
                "concept",
                "review_section",
                "review_paragraph_index",
                "review_anchor_text",
                "review_advice",
            },
        }
        for table, expected in added_columns.items():
            columns = {
                column["name"]: column
                for column in sa.inspect(connection).get_columns(table)
            }
            assert expected <= columns.keys()
            assert all(columns[name]["nullable"] for name in expected)
            row = (
                connection.execute(sa.text(f"SELECT * FROM {table} WHERE id = 1"))
                .mappings()
                .one()
            )
            assert all(row[name] is None for name in expected)

        connection.execute(
            sa.text(
                "UPDATE study_project_keywords SET paragraph_index = 1 WHERE id = 1"
            )
        )
        connection.execute(
            sa.text(
                "UPDATE study_project_quiz_questions "
                "SET concept = 'Concept', review_section = 'Section', "
                "review_paragraph_index = 1, "
                "review_anchor_text = 'An exact quote', "
                "review_advice = 'Recall the concept' "
                "WHERE id = 1"
            )
        )

        migration["downgrade"]()

        assert connection.execute(
            sa.text("SELECT * FROM study_project_keywords")
        ).all() == [(1, "Legacy keyword")]
        assert connection.execute(
            sa.text("SELECT * FROM study_project_quiz_questions")
        ).all() == [(1, "Legacy question")]
    engine.dispose()
