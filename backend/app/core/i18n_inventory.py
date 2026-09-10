"""Inventory of the Romanian messages the code raises, for the catalog check.

Walks ``app/`` with ``ast`` and collects the literal (or f-string template)
passed to ``HTTPException(detail=...)``, any ``*Error(...)``, ``ValueError``
inside schema validators, and ``MessageResponse(message=...)``. The test
suite asserts every one of them has an entry in ``app/i18n/messages.json``;
run ``python -m app.core.i18n_inventory`` to list what is missing.
"""

from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]

# Not shown to visitors: configuration errors, upstream-provider wording that
# is already English, the email transport, and this module itself.
EXCLUDED_FILES = frozenset(
    {
        "core/config.py",
        "core/i18n.py",
        "core/i18n_inventory.py",
        "services/email.py",
        "services/google_oauth.py",
    }
)
IGNORED_EXCEPTION_NAMES = frozenset(
    {
        "AssertionError",
        "JSONDecodeError",
        "KeyError",
        "RuntimeError",
        "TypeError",
    }
)
MESSAGE_KEYWORDS = {
    "HTTPException": "detail",
    "MessageResponse": "message",
}


def _template(node: ast.AST) -> str | None:
    """The literal text of a string expression, with ``{name}`` for f-string parts."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        parts: list[str] = []
        for value in node.values:
            if isinstance(value, ast.Constant):
                parts.append(str(value.value))
            elif isinstance(value, ast.FormattedValue):
                parts.append("{" + ast.unparse(value.value) + "}")
        return "".join(parts)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left = _template(node.left)
        right = _template(node.right)
        if left is not None and right is not None:
            return left + right
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "format"
    ):
        return _template(node.func.value)
    return None


def _call_name(node: ast.Call) -> str:
    if isinstance(node.func, ast.Name):
        return node.func.id
    if isinstance(node.func, ast.Attribute):
        return node.func.attr
    return ""


def _message_nodes(call: ast.Call) -> list[ast.AST]:
    name = _call_name(call)
    keyword = MESSAGE_KEYWORDS.get(name)
    if keyword is not None:
        return [item.value for item in call.keywords if item.arg == keyword]
    if name == "ValueError" or (
        name.endswith("Error") and name not in IGNORED_EXCEPTION_NAMES
    ):
        return call.args[:1]
    return []


def collect_messages(app_dir: Path = APP_DIR) -> dict[str, list[str]]:
    """Every Romanian message template, mapped to the ``file:line`` sites raising it."""
    messages: dict[str, list[str]] = {}
    for path in sorted(app_dir.rglob("*.py")):
        relative = path.relative_to(app_dir).as_posix()
        if relative in EXCLUDED_FILES:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            for message_node in _message_nodes(node):
                template = _template(message_node)
                if template is None or not template.strip():
                    continue
                messages.setdefault(template, []).append(f"{relative}:{node.lineno}")
    return messages


def missing_translations(
    catalog: dict[str, dict[str, str]],
    languages: tuple[str, ...] = ("en", "fr"),
) -> dict[str, list[str]]:
    """Messages without a complete catalog entry, mapped to where they are raised."""
    missing: dict[str, list[str]] = {}
    for message, sites in collect_messages().items():
        entry = catalog.get(message)
        if entry is None or any(not entry.get(language) for language in languages):
            missing[message] = sites
    return missing


def main() -> int:
    catalog_path = APP_DIR / "i18n" / "messages.json"
    with catalog_path.open(encoding="utf-8") as handle:
        catalog = json.load(handle)
    missing = missing_translations(catalog)
    for message, sites in missing.items():
        print(f"{message!r}\n    {', '.join(sites)}")
    print(f"{len(missing)} message(s) missing from {catalog_path.name}")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
