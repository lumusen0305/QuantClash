from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "stockapp",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.analysis_task", "app.tasks.watch_task"],
)

celery_app.conf.update(
    task_routes={
        "app.tasks.analysis_task.run_analysis_free": {"queue": "free_queue"},
        "app.tasks.analysis_task.run_analysis_premium": {"queue": "premium_queue"},
        "app.tasks.watch_task.run_watch_check": {"queue": "premium_queue"},
        "app.tasks.watch_task.run_daily_digest": {"queue": "premium_queue"},
    },
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,
    timezone="UTC",
    beat_schedule={
        "watch-poll": {
            "task": "app.tasks.watch_task.run_watch_check",
            "schedule": 600.0,  # every 10 minutes — trigger-based (news/anomaly)
            "options": {"queue": "premium_queue"},
        },
        **({
            "daily-digest": {
                "task": "app.tasks.watch_task.run_daily_digest",
                # fixed-time daily report regardless of triggers
                "schedule": crontab(hour=settings.DAILY_DIGEST_HOUR_UTC, minute=0),
                "options": {"queue": "premium_queue"},
            },
        } if settings.DAILY_DIGEST_ENABLED else {}),
    },
)
