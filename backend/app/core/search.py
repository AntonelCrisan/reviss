"""Shared helpers for free-text filters."""

from typing import Any

# A backslash escapes the next character inside LIKE, so it has to be doubled
# first or escaping the wildcards would corrupt a term that contains one.
LIKE_ESCAPE = "\\"


def escape_like(term: str) -> str:
    """Make a user's search term match itself and nothing more.

    Left alone, "%" matches every row and "100%" matches anything merely
    starting with 100, so the filter would quietly answer a different question
    than the one that was typed.
    """
    return (
        term.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", f"{LIKE_ESCAPE}%")
        .replace("_", f"{LIKE_ESCAPE}_")
    )


def contains(column: Any, term: str) -> Any:
    """Case-insensitive "contains" over a column, wildcards treated as text."""
    return column.ilike(f"%{escape_like(term)}%", escape=LIKE_ESCAPE)
