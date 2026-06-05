import logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.base import get_db
from app.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)

TIER_MAP = {
    "price_basic": "basic",
    "price_premium": "premium",
}


@router.post("/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload")

    event_type = event["type"]

    if event_type in ("customer.subscription.created", "customer.subscription.updated"):
        await _handle_subscription_active(event["data"]["object"], db)
    elif event_type == "customer.subscription.deleted":
        await _handle_subscription_deleted(event["data"]["object"], db)
    elif event_type == "invoice.payment_failed":
        _handle_payment_failed(event["data"]["object"])

    return {"received": True}


async def _handle_subscription_active(subscription: dict, db: AsyncSession) -> None:
    customer_id = subscription.get("customer")
    price_id = subscription["items"]["data"][0]["price"]["id"] if subscription.get("items") else None
    tier = TIER_MAP.get(price_id, "free")

    result = await db.execute(select(User).where(User.stripe_customer_id == customer_id))
    user = result.scalar_one_or_none()
    if user:
        user.tier = tier
        await db.commit()
        logger.info("Updated user %s tier to %s", user.id, tier)


async def _handle_subscription_deleted(subscription: dict, db: AsyncSession) -> None:
    customer_id = subscription.get("customer")

    result = await db.execute(select(User).where(User.stripe_customer_id == customer_id))
    user = result.scalar_one_or_none()
    if user:
        user.tier = "free"
        await db.commit()
        logger.info("Downgraded user %s to free tier", user.id)


def _handle_payment_failed(invoice: dict) -> None:
    customer_id = invoice.get("customer")
    logger.warning("Payment failed for Stripe customer %s", customer_id)
