import asyncio
import logging
import os
from contextlib import suppress

from app.services.football_data_service import sync_world_cup_matches
from app.services.scoring_service import recalculate_all_scores

logger = logging.getLogger(__name__)

AUTO_SYNC_ENABLED = os.getenv("AUTO_FOOTBALL_DATA_SYNC_ENABLED", "true").lower()
AUTO_SYNC_INTERVAL_SECONDS = int(
    os.getenv("AUTO_FOOTBALL_DATA_SYNC_INTERVAL_SECONDS", "1800")
)


async def sync_matches_and_scores() -> dict:
    sync_result = await sync_world_cup_matches()
    scoring_result = recalculate_all_scores()

    return {
        "sync": sync_result,
        "scoring": scoring_result,
    }


async def run_auto_sync_loop():
    if AUTO_SYNC_ENABLED not in {"1", "true", "yes", "on"}:
        logger.info("Automatic football-data sync is disabled.")
        return

    while True:
        try:
            result = await sync_matches_and_scores()
            logger.info("Automatic football-data sync completed: %s", result)
        except Exception:
            logger.exception("Automatic football-data sync failed.")

        await asyncio.sleep(AUTO_SYNC_INTERVAL_SECONDS)


def start_auto_sync_task() -> asyncio.Task:
    return asyncio.create_task(run_auto_sync_loop())


async def stop_auto_sync_task(task: asyncio.Task | None):
    if not task:
        return

    task.cancel()

    with suppress(asyncio.CancelledError):
        await task
