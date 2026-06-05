import uuid

import pandas as pd
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import get_current_user
from app.backtest.engine import BacktestConfig, BacktestResult, run_backtest
from app.tasks.celery_app import celery_app
from pydantic import BaseModel

router = APIRouter()


class BacktestRequest(BaseModel):
    ticker: str
    start_date: str
    end_date: str
    algorithm_code: str
    initial_capital: float = 100_000.0
    commission_pct: float = 0.001
    slippage_pct: float = 0.0005


@router.post("/rule")
async def run_rule_backtest(
    req: BacktestRequest,
    current_user=Depends(get_current_user),
):
    """Dispatch a rule-based backtest. Returns task_id for async polling."""
    config = BacktestConfig(
        ticker=req.ticker.upper(),
        start_date=req.start_date,
        end_date=req.end_date,
        initial_capital=req.initial_capital,
        commission_pct=req.commission_pct,
        slippage_pct=req.slippage_pct,
    )

    task_id = str(uuid.uuid4())
    celery_app.send_task(
        "app.tasks.backtest_task.run_backtest_task",
        args=[task_id, config.model_dump(), req.algorithm_code],
        queue="premium_queue",
        task_id=task_id,
    )
    return {"task_id": task_id, "status": "pending"}


@router.post("/rule/sync")
async def run_rule_backtest_sync(req: BacktestRequest):
    """Run a rule-based backtest synchronously. Returns result and OHLCV data."""
    config = BacktestConfig(
        ticker=req.ticker.upper(),
        start_date=req.start_date,
        end_date=req.end_date,
        initial_capital=req.initial_capital,
        commission_pct=req.commission_pct,
        slippage_pct=req.slippage_pct,
    )
    try:
        result: BacktestResult = run_backtest(config, req.algorithm_code)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
        )

    try:
        ticker_obj = yf.Ticker(req.ticker.upper())
        df: pd.DataFrame = ticker_obj.history(
            start=req.start_date, end=req.end_date, auto_adjust=True
        )
        ohlcv = [
            {
                "time": index.strftime("%Y-%m-%d"),
                "open": row["Open"],
                "high": row["High"],
                "low": row["Low"],
                "close": row["Close"],
                "volume": row["Volume"],
            }
            for index, row in df.iterrows()
        ]
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch OHLCV data: {exc}",
        )

    return {"result": result.model_dump(), "ohlcv": ohlcv}


@router.get("/{task_id}")
async def backtest_result(
    task_id: str,
    current_user=Depends(get_current_user),
):
    """Poll for backtest result by task_id."""
    result = celery_app.AsyncResult(task_id)
    if result.failed():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(result.result),
        )
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }
