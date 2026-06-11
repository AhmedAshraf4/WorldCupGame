import asyncio
import logging
import os
from contextlib import suppress
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv

from app.services.football_data_service import sync_world_cup_matches
from app.services.scoring_service import recalculate_all_scores

load_dotenv()

logger = logging.getLogger("uvicorn.error")

AUTO_SYNC_ENABLED = os.getenv("AUTO_FOOTBALL_DATA_SYNC_ENABLED", "true").lower()
AUTO_SYNC_INTERVAL_SECONDS = int(
    os.getenv("AUTO_FOOTBALL_DATA_SYNC_INTERVAL_SECONDS", "1800")
)

LAST_AUTO_SYNC_STATUS: dict[str, Any] = {
    "enabled": AUTO_SYNC_ENABLED in {"1", "true", "yes", "on"},
    "interval_seconds": AUTO_SYNC_INTERVAL_SECONDS,
    "running": False,
    "last_started_at": None,
    "last_finished_at": None,
    "last_success": None,
    "last_error": None,
    "last_result": None,
    "attempt_count": 0,
}


async def sync_matches_and_scores() -> dict:
    logger.warning("Automatic football-data sync: syncing matches to Supabase.")
    sync_result = await sync_world_cup_matches()

    logger.warning(
        "Automatic football-data sync: match sync finished: %s",
        sync_result,
    )

    logger.warning("Automatic football-data sync: recalculating scores.")
    scoring_result = recalculate_all_scores()

    logger.warning(
        "Automatic football-data sync: score recalculation finished: %s",
        scoring_result,
    )

    return {
        "sync": sync_result,
        "scoring": scoring_result,
    }


async def run_auto_sync_loop():
    if AUTO_SYNC_ENABLED not in {"1", "true", "yes", "on"}:
        logger.warning("Automatic football-data sync is disabled.")
        return

    logger.warning(
        "Automatic football-data sync loop started. Interval: %s seconds.",
        AUTO_SYNC_INTERVAL_SECONDS,
    )

    while True:
        LAST_AUTO_SYNC_STATUS["attempt_count"] += 1
        LAST_AUTO_SYNC_STATUS["running"] = True
        LAST_AUTO_SYNC_STATUS["last_started_at"] = datetime.now(
            timezone.utc
        ).isoformat()

        try:
            logger.warning(
                "Automatic football-data sync attempt %s started.",
                LAST_AUTO_SYNC_STATUS["attempt_count"],
            )
            result = await sync_matches_and_scores()
            LAST_AUTO_SYNC_STATUS["last_success"] = True
            LAST_AUTO_SYNC_STATUS["last_error"] = None
            LAST_AUTO_SYNC_STATUS["last_result"] = result
            logger.warning("Automatic football-data sync completed: %s", result)
        except Exception as exc:
            LAST_AUTO_SYNC_STATUS["last_success"] = False
            LAST_AUTO_SYNC_STATUS["last_error"] = str(exc)
            LAST_AUTO_SYNC_STATUS["last_result"] = None
            logger.exception("Automatic football-data sync failed.")
        finally:
            LAST_AUTO_SYNC_STATUS["running"] = False
            LAST_AUTO_SYNC_STATUS["last_finished_at"] = datetime.now(
                timezone.utc
            ).isoformat()

        logger.warning(
            "Automatic football-data sync sleeping for %s seconds.",
            AUTO_SYNC_INTERVAL_SECONDS,
        )
        await asyncio.sleep(AUTO_SYNC_INTERVAL_SECONDS)


def start_auto_sync_task() -> asyncio.Task:
    logger.warning("Creating automatic football-data sync background task.")
    return asyncio.create_task(run_auto_sync_loop())


def get_auto_sync_status() -> dict[str, Any]:
    return dict(LAST_AUTO_SYNC_STATUS)


async def stop_auto_sync_task(task: asyncio.Task | None):
    if not task:
        return

    task.cancel()

    with suppress(asyncio.CancelledError):
        await task
