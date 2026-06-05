import asyncio
import json
import redis
from app.tasks.celery_app import celery_app
from app.core.config import settings

redis_client = redis.from_url(settings.REDIS_URL)

def publish_progress(user_id: str, task_id: str, stage: str, message: str, data=None, pct: float = 0):
    """Publish analysis progress to Redis for WebSocket forwarding."""
    payload = {
        "type": "analysis_progress",
        "task_id": task_id,
        "stage": stage,
        "message": message,
        "data": data,
        "progress_pct": pct,
    }
    redis_client.publish(f"analysis:{user_id}:{task_id}", json.dumps(payload))

@celery_app.task(
    name="app.tasks.analysis_task.run_analysis_free",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def run_analysis_free(self, task_id: str, ticker: str, trade_date: str, user_id: str, dag_config: dict | None = None):
    """Run analysis using free tier (local Ollama/vLLM)."""
    return _run_analysis(self, task_id, ticker, trade_date, user_id, tier="free", dag_config=dag_config)

@celery_app.task(
    name="app.tasks.analysis_task.run_analysis_premium",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
)
def run_analysis_premium(self, task_id: str, ticker: str, trade_date: str, user_id: str, dag_config: dict | None = None):
    """Run analysis using premium tier (Cloud LLM)."""
    return _run_analysis(self, task_id, ticker, trade_date, user_id, tier="premium", dag_config=dag_config)

def _run_analysis(task, task_id, ticker, trade_date, user_id, tier, dag_config=None):
    if dag_config is not None:
        from app.strategies.compiler import run_custom_analysis
        _runner = run_custom_analysis
    else:
        from app.agents.graph import run_analysis as _runner

    publish_progress(user_id, task_id, "starting", f"Starting analysis for {ticker}", pct=5)

    async def progress_cb(progress):
        publish_progress(
            user_id, task_id,
            progress.stage, progress.message,
            progress.data, progress.progress_pct
        )

    try:
        kwargs = dict(
            ticker=ticker,
            trade_date=trade_date,
            user_tier=tier,
            task_id=task_id,
            progress_callback=progress_cb,
        )
        if dag_config is not None:
            kwargs["dag_config"] = dag_config
        result = asyncio.run(_runner(**kwargs))

        # Store result in Redis cache (24h TTL)
        cache_key = f"analysis:{ticker}:{trade_date}"
        redis_client.setex(cache_key, 86400, json.dumps({
            "ticker": ticker,
            "trade_date": trade_date,
            "final_decision": result.get("final_decision", {}),
            "market_report": result.get("market_report", {}),
            "sentiment_report": result.get("sentiment_report", {}),
            "news_report": result.get("news_report", {}),
            "fundamentals_report": result.get("fundamentals_report", {}),
            "bull_arguments": result.get("bull_arguments", []),
            "bear_arguments": result.get("bear_arguments", []),
        }))

        publish_progress(user_id, task_id, "done", "Analysis complete!", pct=100)

        return {"status": "done", "result": result.get("final_decision")}

    except Exception as exc:
        publish_progress(user_id, task_id, "error", f"Analysis failed: {str(exc)}", pct=0)
        raise task.retry(exc=exc)
