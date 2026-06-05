from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import date
import json
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.cache.quota import check_and_increment_quota, get_quota_status
from app.cache.redis_cache import get_cached_analysis
from app.tasks.celery_app import celery_app
from app.models.base import get_db
from app.models.strategy import Strategy

router = APIRouter()

class AnalyzeRequest(BaseModel):
    ticker: str
    trade_date: str = None  # defaults to today
    strategy_id: str | None = None

@router.post("")
async def trigger_analysis(
    req: AnalyzeRequest,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ticker = req.ticker.upper()
    trade_date = req.trade_date or date.today().isoformat()

    # Resolve strategy dag_config when strategy_id is provided
    dag_config: dict | None = None
    if req.strategy_id is not None:
        result = await db.execute(
            select(Strategy).where(Strategy.id == req.strategy_id)
        )
        strategy = result.scalar_one_or_none()
        if not strategy:
            raise HTTPException(status_code=404, detail="Strategy not found")
        if strategy.user_id != current_user.id and not strategy.is_public:
            raise HTTPException(status_code=404, detail="Strategy not found")
        dag_config = strategy.dag_config

    # Check cache first
    cached = await get_cached_analysis(ticker, trade_date)
    if cached:
        return {
            "task_id": None,
            "cached": True,
            "result": cached,
        }

    # Check quota
    has_quota = await check_and_increment_quota(
        str(current_user.id), current_user.tier
    )
    if not has_quota:
        raise HTTPException(
            status_code=429,
            detail="Daily analysis quota exceeded. Upgrade your plan for more analyses."
        )

    task_id = str(uuid.uuid4())

    # Dispatch to appropriate queue
    if current_user.tier == "free":
        celery_app.send_task(
            "app.tasks.analysis_task.run_analysis_free",
            args=[task_id, ticker, trade_date, str(current_user.id), dag_config],
            queue="free_queue",
            task_id=task_id,
        )
    else:
        celery_app.send_task(
            "app.tasks.analysis_task.run_analysis_premium",
            args=[task_id, ticker, trade_date, str(current_user.id), dag_config],
            queue="premium_queue",
            task_id=task_id,
        )

    return {"task_id": task_id, "cached": False, "status": "pending"}

@router.get("/{task_id}/status")
async def analysis_status(
    task_id: str,
    current_user = Depends(get_current_user),
):
    result = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }

class AnalyzeSyncRequest(BaseModel):
    ticker: str
    trade_date: str | None = None
    dag_config: dict | None = None
    language: str | None = None  # e.g. "en", "zh-TW"
    model: str | None = None  # e.g. "gemini", "ollama", "ollama:llama3"
    risk_style: str | None = None  # "conservative" | "balanced" | "aggressive"


@router.post("/sync")
async def analyze_sync(req: AnalyzeSyncRequest):
    """Run analysis synchronously without Celery/auth. For development use."""
    from app.strategies.compiler import compile_strategy, run_custom_analysis
    from app.agents.llm_router import set_model_override

    ticker = req.ticker.upper()
    trade_date = req.trade_date or date.today().isoformat()
    dag_config = req.dag_config
    language = req.language
    task_id = str(uuid.uuid4())

    set_model_override(req.model)
    try:
        if dag_config:
            result = await run_custom_analysis(
                dag_config=dag_config,
                ticker=ticker,
                trade_date=trade_date,
                user_tier="premium",
                task_id=task_id,
                language=language,
            )
        else:
            # Use default pipeline
            from app.agents.graph import create_analysis_graph
            graph = create_analysis_graph()
            result = await graph.ainvoke({
                "ticker": ticker,
                "trade_date": trade_date,
                "user_tier": "premium",
                "task_id": task_id,
                "language": language,
                "risk_style": req.risk_style or "balanced",
                "messages": [],
                "bull_arguments": [],
                "bear_arguments": [],
                "risk_debate": [],
            })

        # Extract serializable parts
        output = {}
        for key in ["market_report", "sentiment_report", "news_report",
                     "fundamentals_report", "research_verdict",
                     "trader_plan", "final_decision"]:
            if key in result:
                val = result[key]
                if hasattr(val, "model_dump"):
                    output[key] = val.model_dump()
                elif isinstance(val, (str, dict, list)):
                    output[key] = val
                else:
                    output[key] = str(val)

        return {"status": "completed", "result": output}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )
    finally:
        set_model_override(None)


STREAM_KEYS = [
    "market_report", "sentiment_report", "news_report",
    "fundamentals_report", "macro_report", "market_research_report",
    "research_verdict", "trader_plan",
    "final_decision", "bull_arguments", "bear_arguments",
    "risk_debate", "risk_verdict",
]


@router.post("/stream")
async def analyze_stream(req: AnalyzeSyncRequest):
    """SSE streaming analysis — sends each node's output as it completes."""
    from app.strategies.compiler import compile_strategy
    from app.agents.llm_router import set_model_override

    ticker = req.ticker.upper()
    trade_date = req.trade_date or date.today().isoformat()
    dag_config = req.dag_config
    language = req.language
    task_id = str(uuid.uuid4())

    set_model_override(req.model)

    async def event_generator():
        try:
            if dag_config:
                graph = compile_strategy(dag_config)
            else:
                from app.agents.graph import create_analysis_graph
                graph = create_analysis_graph()

            initial_state = {
                "ticker": ticker,
                "trade_date": trade_date,
                "user_tier": "premium",
                "task_id": task_id,
                "language": language,
                "risk_style": req.risk_style or "balanced",
                "messages": [],
                "bull_arguments": [],
                "bear_arguments": [],
                "risk_debate": [],
            }

            seen_keys: set[str] = set()

            async for event in graph.astream(initial_state, stream_mode="updates"):
                # event is {node_name: {state_updates}}
                for node_name, updates in event.items():
                    if not isinstance(updates, dict):
                        continue
                    for key in STREAM_KEYS:
                        if key in updates and key not in seen_keys:
                            val = updates[key]
                            if val is None:
                                continue
                            seen_keys.add(key)
                            if hasattr(val, "model_dump"):
                                serialized = val.model_dump()
                            elif isinstance(val, list):
                                serialized = [
                                    item.model_dump() if hasattr(item, "model_dump") else item
                                    for item in val
                                ]
                            elif isinstance(val, (str, dict)):
                                serialized = val
                            else:
                                serialized = str(val)
                            payload = json.dumps({
                                "node": node_name,
                                "key": key,
                                "value": serialized,
                            }, ensure_ascii=False)
                            yield f"data: {payload}\n\n"

            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as exc:
            error_payload = json.dumps({"error": str(exc)}, ensure_ascii=False)
            yield f"data: {error_payload}\n\n"
        finally:
            set_model_override(None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/quota")
async def quota_status(current_user = Depends(get_current_user)):
    return await get_quota_status(str(current_user.id), current_user.tier)
