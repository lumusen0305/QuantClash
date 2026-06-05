from app.tasks.celery_app import celery_app
from app.backtest.engine import BacktestConfig, run_backtest


@celery_app.task(
    name="app.tasks.backtest_task.run_backtest_task",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
)
def run_backtest_task(self, task_id: str, config_dict: dict, algorithm_code: str):
    """Execute a rule-based backtest and return serialised BacktestResult."""
    try:
        config = BacktestConfig(**config_dict)
        result = run_backtest(config, algorithm_code)
        return result.model_dump()
    except Exception as exc:
        raise self.retry(exc=exc)
