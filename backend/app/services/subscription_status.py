"""Subscription status vocabulary, shared by everything that reads it.

These live apart from the Stripe service on purpose. Both the billing-window
and add-on services need to know which statuses count as live, and the Stripe
service in turn needs those services - keeping the constants here is what
stops that becoming a circular import.
"""

from typing import Final

ACTIVE_SUBSCRIPTION_STATUSES: Final[frozenset[str]] = frozenset(
    {"active", "trialing"}
)

# "checkout_completed" is ours, not Stripe's: it marks the gap between a paid
# checkout and the first subscription webhook, so the user is not treated as
# unsubscribed in between.
CHECKOUT_SUBSCRIPTION_STATUSES: Final[frozenset[str]] = (
    ACTIVE_SUBSCRIPTION_STATUSES | frozenset({"checkout_completed"})
)

INACTIVE_SUBSCRIPTION_STATUSES: Final[frozenset[str]] = frozenset(
    {
        "canceled",
        "incomplete_expired",
        "unpaid",
    }
)
