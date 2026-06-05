import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.models.base import get_db
from app.models.strategy import Strategy
from app.models.user import User
from app.strategies.validator import validate_dag, DAGValidationError

router = APIRouter()


class DAGConfigSchema(BaseModel):
    nodes: list[dict] = Field(..., min_length=1)
    edges: list[dict] = Field(..., min_length=1)


class StrategyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    dag_config: DAGConfigSchema
    is_public: bool = False


class StrategyUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    dag_config: DAGConfigSchema | None = None
    is_public: bool | None = None


class StrategyResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: str | None
    dag_config: dict
    is_public: bool
    fork_count: int
    forked_from_id: str | None
    created_at: str

    model_config = {"from_attributes": True}


def _to_response(s: Strategy) -> dict:
    return {
        "id": str(s.id),
        "user_id": str(s.user_id),
        "name": s.name,
        "description": s.description,
        "dag_config": s.dag_config,
        "is_public": s.is_public,
        "fork_count": s.fork_count,
        "forked_from_id": str(s.forked_from_id) if s.forked_from_id else None,
        "created_at": s.created_at.isoformat(),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_strategy(
    body: StrategyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        validate_dag(body.dag_config.model_dump())
    except DAGValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))

    strategy = Strategy(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        dag_config=body.dag_config.model_dump(),
        is_public=body.is_public,
    )
    db.add(strategy)
    await db.commit()
    await db.refresh(strategy)
    return _to_response(strategy)


@router.get("")
async def list_my_strategies(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Strategy)
        .where(Strategy.user_id == current_user.id)
        .order_by(Strategy.created_at.desc())
    )
    return [_to_response(s) for s in result.scalars().all()]


@router.get("/public")
async def list_public_strategies(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Strategy)
        .where(Strategy.is_public == True)
        .order_by(Strategy.fork_count.desc(), Strategy.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [_to_response(s) for s in result.scalars().all()]


@router.get("/{strategy_id}")
async def get_strategy(
    strategy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if strategy.user_id != current_user.id and not strategy.is_public:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return _to_response(strategy)


@router.put("/{strategy_id}")
async def update_strategy(
    strategy_id: uuid.UUID,
    body: StrategyUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy or strategy.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Strategy not found")

    if body.name is not None:
        strategy.name = body.name
    if body.description is not None:
        strategy.description = body.description
    if body.dag_config is not None:
        try:
            validate_dag(body.dag_config.model_dump())
        except DAGValidationError as e:
            raise HTTPException(status_code=422, detail=str(e))
        strategy.dag_config = body.dag_config.model_dump()
    if body.is_public is not None:
        strategy.is_public = body.is_public

    await db.commit()
    await db.refresh(strategy)
    return _to_response(strategy)


@router.delete("/{strategy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_strategy(
    strategy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy or strategy.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Strategy not found")
    await db.delete(strategy)
    await db.commit()


@router.post("/{strategy_id}/fork", status_code=status.HTTP_201_CREATED)
async def fork_strategy(
    strategy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if not original.is_public and original.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Strategy not found")

    forked = Strategy(
        user_id=current_user.id,
        name=f"{original.name} (fork)",
        description=original.description,
        dag_config=original.dag_config,
        is_public=False,
        forked_from_id=original.id,
    )
    db.add(forked)
    original.fork_count += 1
    await db.commit()
    await db.refresh(forked)
    return _to_response(forked)
