"""The receipt for a one-off purchase says what was bought, not which plan."""

from app.services.email import addon_invoice_paid_email
from app.services.stripe_payments import _invoice_line_items


def _invoice(**overrides) -> dict:
    invoice = {
        "currency": "ron",
        "lines": {
            "data": [
                {"description": "Credite AI", "quantity": 30, "amount": 6000},
                {"description": "Pagini OCR", "quantity": 50, "amount": 1500},
            ]
        },
    }
    invoice.update(overrides)
    return invoice


# --- reading the lines off the invoice --------------------------------------


def test_the_quantity_is_added_to_the_description() -> None:
    """Stripe words the line as the product alone.

    "Credite AI" says nothing about how many were bought, so the number has to
    come from the quantity field.
    """
    items = _invoice_line_items(_invoice())

    assert items == [
        ("Credite AI × 30", "60,00 RON"),
        ("Pagini OCR × 50", "15,00 RON"),
    ]


def test_a_single_unit_needs_no_multiplier() -> None:
    items = _invoice_line_items(
        _invoice(
            lines={
                "data": [
                    {"description": "Credite AI", "quantity": 1, "amount": 200}
                ]
            }
        )
    )

    assert items == [("Credite AI", "2,00 RON")]


def test_amounts_use_the_same_decimals_as_the_total() -> None:
    """One email must not show two different number formats."""
    items = _invoice_line_items(_invoice())

    assert all("," in amount and "." not in amount for _, amount in items)


def test_an_invoice_without_lines_yields_nothing() -> None:
    assert _invoice_line_items({"currency": "ron"}) == []
    assert _invoice_line_items({"lines": {"data": []}}) == []


def test_a_malformed_line_is_skipped() -> None:
    items = _invoice_line_items(
        _invoice(
            lines={
                "data": [
                    "nonsense",
                    {"description": "Credite AI", "quantity": 10, "amount": 2000},
                ]
            }
        )
    )

    assert items == [("Credite AI × 10", "20,00 RON")]


# --- the email itself -------------------------------------------------------


def _render(language: str = "ro"):
    return addon_invoice_paid_email(
        invoice_url="https://invoice.stripe.com/x",
        invoice_pdf_url="https://pdf/x",
        invoice_number="469562D8-0027",
        amount_label="75,00 RON",
        paid_at_label="14.09.2026",
        line_items=[
            ("Credite AI × 30", "60,00 RON"),
            ("Pagini OCR × 50", "15,00 RON"),
        ],
        logo_html="",
        language=language,
    )


def test_every_purchased_line_appears_in_both_bodies() -> None:
    html, text = _render()

    for fragment in ("Credite AI × 30", "60,00 RON", "Pagini OCR × 50", "15,00 RON"):
        assert fragment in text, fragment
        assert fragment in html, fragment


def test_the_total_and_invoice_number_are_present() -> None:
    html, text = _render()

    for fragment in ("75,00 RON", "469562D8-0027"):
        assert fragment in text
        assert fragment in html


def test_the_receipt_never_claims_to_be_a_subscription() -> None:
    """The whole point of the separate template.

    The subscription email leads with the plan name and says the subscription
    stays active, which is wrong for a top-up.
    """
    html, text = _render()

    for wrong in ("Abonamentul rămâne activ", "Plan:"):
        assert wrong not in text, wrong
        assert wrong not in html, wrong


def test_it_renders_in_every_language() -> None:
    for language in ("ro", "en", "fr"):
        html, text = _render(language)
        assert "Credite AI × 30" in text
        assert "75,00 RON" in html


def test_the_pdf_link_is_optional() -> None:
    html, text = addon_invoice_paid_email(
        invoice_url="https://invoice.stripe.com/x",
        invoice_pdf_url=None,
        invoice_number=None,
        amount_label="20,00 RON",
        paid_at_label=None,
        line_items=[("Credite AI × 10", "20,00 RON")],
        logo_html="",
        language="ro",
    )

    assert "https://pdf" not in text
    assert "https://pdf" not in html
    # A missing number still has to render something rather than "None".
    assert "None" not in text
