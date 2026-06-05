import stripe
from app.core.config import settings

stripe.api_key = settings.STRIPE_SECRET_KEY

PLANS = {
    "basic": {"price_id": "price_basic", "name": "Basic", "limit": 5},
    "premium": {"price_id": "price_premium", "name": "Premium", "limit": 20},
}


def create_customer(email: str) -> str:
    customer = stripe.Customer.create(email=email)
    return customer.id


def create_checkout_session(
    customer_id: str, tier: str, success_url: str, cancel_url: str
) -> str:
    plan = PLANS[tier]
    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": plan["price_id"], "quantity": 1}],
        mode="subscription",
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return session.url


def create_portal_session(customer_id: str, return_url: str) -> str:
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return session.url
