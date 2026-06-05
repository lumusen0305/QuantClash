from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.stripe_client import PLANS, create_checkout_session, create_customer, create_portal_session
from app.models.base import get_db
from app.models.user import User

router = APIRouter()


class CheckoutRequest(BaseModel):
    tier: str
    success_url: str
    cancel_url: str


class PortalRequest(BaseModel):
    return_url: str


@router.get("/plans")
async def get_plans():
    return [
        {
            "tier": tier,
            "name": info["name"],
            "limit": info["limit"],
            "features": _plan_features(tier),
        }
        for tier, info in PLANS.items()
    ]


def _plan_features(tier: str) -> list[str]:
    if tier == "basic":
        return ["5 analyses per day", "Standard LLM providers", "Email support"]
    if tier == "premium":
        return ["20 analyses per day", "All LLM providers", "Priority support", "Advanced analytics"]
    return []


@router.post("/checkout")
async def checkout(
    payload: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.tier not in PLANS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tier")

    customer_id = current_user.stripe_customer_id
    if not customer_id:
        customer_id = create_customer(current_user.email)
        current_user.stripe_customer_id = customer_id
        await db.commit()

    url = create_checkout_session(
        customer_id=customer_id,
        tier=payload.tier,
        success_url=payload.success_url,
        cancel_url=payload.cancel_url,
    )
    return {"url": url}


@router.post("/portal")
async def portal(
    payload: PortalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.stripe_customer_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No billing account found")

    url = create_portal_session(
        customer_id=current_user.stripe_customer_id,
        return_url=payload.return_url,
    )
    return {"url": url}
