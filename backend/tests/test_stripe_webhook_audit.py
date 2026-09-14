"""What a Stripe delivery leaves behind in the audit log."""

from app.services.stripe_payments import (
    AUDITED_WEBHOOK_EVENTS,
    _webhook_details,
    _webhook_resource_id,
)

# --- which deliveries are recorded ------------------------------------------


def test_the_events_that_move_money_are_recorded() -> None:
    for event_type in (
        "checkout.session.completed",
        "invoice.paid",
        "invoice.payment_failed",
        "customer.subscription.deleted",
    ):
        assert event_type in AUDITED_WEBHOOK_EVENTS


def test_incidental_events_are_not() -> None:
    """Stripe sends far more than this; the log is for what changed an account."""
    for event_type in (
        "customer.updated",
        "payment_intent.created",
        "charge.succeeded",
    ):
        assert event_type not in AUDITED_WEBHOOK_EVENTS


# --- what is kept -----------------------------------------------------------


def test_a_checkout_keeps_the_amount_and_the_outcome() -> None:
    details = _webhook_details(
        "checkout.session.completed",
        {
            "id": "cs_1",
            "mode": "subscription",
            "payment_status": "paid",
            "amount_total": 4900,
            "currency": "ron",
            "subscription": "sub_1",
        },
    )

    assert details["payment_status"] == "paid"
    assert details["amount_total"] == 4900
    assert details["currency"] == "ron"


def test_a_failed_payment_keeps_the_attempt_count() -> None:
    """How many times it has been retried is the reason to look at all."""
    details = _webhook_details(
        "invoice.payment_failed",
        {"id": "in_1", "amount_due": 4900, "amount_paid": 0, "attempt_count": 3},
    )

    assert details["attempt_count"] == 3
    assert details["amount_paid"] == 0


def test_a_cancellation_keeps_whether_the_plan_still_renews() -> None:
    details = _webhook_details(
        "customer.subscription.updated",
        {"id": "sub_1", "status": "active", "cancel_at_period_end": True},
    )

    assert details["status"] == "active"
    assert details["cancel_at_period_end"] is True


def test_the_payload_itself_is_not_copied() -> None:
    """stripe_events already stores the delivery verbatim; duplicating it here
    would multiply the largest column in the database for no added answer."""
    details = _webhook_details(
        "invoice.paid",
        {"id": "in_1", "lines": {"data": [{"x": 1}] * 50}, "customer": "cus_1"},
    )

    assert "lines" not in details
    assert set(details) == {
        "number",
        "billing_reason",
        "amount_due",
        "amount_paid",
        "currency",
        "attempt_count",
    }


def test_the_stripe_object_is_identifiable() -> None:
    assert _webhook_resource_id("invoice.paid", {"id": "in_1"}) == "in_1"
    assert (
        _webhook_resource_id("customer.subscription.updated", {"id": "sub_1"})
        == "sub_1"
    )
