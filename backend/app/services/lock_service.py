from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from app.core.supabase import supabase


GROUP_MATCHDAY_LOCK_KEYS = {
    1: "GROUP_MATCHDAY_1",
    2: "GROUP_MATCHDAY_2",
    3: "GROUP_MATCHDAY_3",
}


KNOCKOUT_PREDICTION_LOCK_KEYS = {
    "ROUND_OF_32": "KNOCKOUT_PREDICTIONS_ROUND_OF_32",
    "ROUND_OF_16": "KNOCKOUT_PREDICTIONS_ROUND_OF_16",
    "QUARTER_FINAL": "KNOCKOUT_PREDICTIONS_QUARTER_FINAL",
    "SEMI_FINAL": "KNOCKOUT_PREDICTIONS_SEMI_FINAL",
    "FINAL": "KNOCKOUT_PREDICTIONS_FINAL",
}


KNOCKOUT_WILDCARD_LOCK_KEYS = {
    "ROUND_OF_32": "KNOCKOUT_WILDCARD_ROUND_OF_32",
    "ROUND_OF_16": "KNOCKOUT_WILDCARD_ROUND_OF_16",
    "QUARTER_FINAL": "KNOCKOUT_WILDCARD_QUARTER_FINAL",
    "SEMI_FINAL": "KNOCKOUT_WILDCARD_SEMI_FINAL",
    "FINAL": "KNOCKOUT_WILDCARD_FINAL",
}


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None

    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def normalize_round(value: Any) -> str | None:
    if not value:
        return None

    text = (
        str(value)
        .strip()
        .lower()
        .replace("_", " ")
        .replace("-", " ")
    )

    if (
        "round of 32" in text
        or "last 32" in text
        or "ro32" in text
        or "round 32" in text
    ):
        return "ROUND_OF_32"

    if (
        "round of 16" in text
        or "last 16" in text
        or "ro16" in text
        or "round 16" in text
    ):
        return "ROUND_OF_16"

    if "quarter" in text:
        return "QUARTER_FINAL"

    if "semi" in text:
        return "SEMI_FINAL"

    if text == "final" or " final" in text:
        return "FINAL"

    return None


def get_match_round(match: dict[str, Any] | None) -> str | None:
    if not match:
        return None

    for key in ["round_name", "stage", "round", "round_code", "match_type"]:
        round_key = normalize_round(match.get(key))

        if round_key:
            return round_key

    return None


def get_prediction_lock(lock_key: str) -> dict[str, Any] | None:
    result = (
        supabase
        .table("prediction_locks")
        .select("*")
        .eq("lock_key", lock_key)
        .execute()
    )

    if not result.data:
        return None

    return result.data[0]


def get_prediction_lock_status(lock_key: str) -> dict[str, Any]:
    prediction_lock = get_prediction_lock(lock_key)

    if not prediction_lock:
        return {
            "lock_key": lock_key,
            "exists": False,
            "is_open": True,
            "is_locked": False,
            "reason": None,
        }

    now = datetime.now(timezone.utc)

    open_at = parse_datetime(prediction_lock.get("open_at"))
    deadline_at = parse_datetime(prediction_lock.get("deadline_at"))
    manually_locked = bool(prediction_lock.get("is_locked"))

    if manually_locked:
        return {
            **prediction_lock,
            "exists": True,
            "is_open": False,
            "reason": "MANUALLY_LOCKED",
        }

    if open_at and now < open_at:
        return {
            **prediction_lock,
            "exists": True,
            "is_open": False,
            "reason": "NOT_OPEN_YET",
        }

    if deadline_at and now >= deadline_at:
        return {
            **prediction_lock,
            "exists": True,
            "is_open": False,
            "reason": "DEADLINE_PASSED",
        }

    return {
        **prediction_lock,
        "exists": True,
        "is_open": True,
        "reason": None,
    }


def assert_prediction_open(lock_key: str):
    status = get_prediction_lock_status(lock_key)

    if status.get("is_open"):
        return

    lock_name = status.get("lock_name") or lock_key
    reason = status.get("reason")

    if reason == "NOT_OPEN_YET":
        raise HTTPException(
            status_code=403,
            detail=f"{lock_name} are not open yet.",
        )

    if reason == "DEADLINE_PASSED":
        raise HTTPException(
            status_code=403,
            detail=f"{lock_name} deadline has passed.",
        )

    raise HTTPException(
        status_code=403,
        detail=f"{lock_name} are locked.",
    )


def get_group_matchday_lock_key(matchday: int) -> str:
    if matchday not in GROUP_MATCHDAY_LOCK_KEYS:
        raise HTTPException(
            status_code=400,
            detail="Invalid group matchday",
        )

    return GROUP_MATCHDAY_LOCK_KEYS[matchday]


def get_knockout_prediction_lock_key(round_key: str) -> str:
    if round_key not in KNOCKOUT_PREDICTION_LOCK_KEYS:
        raise HTTPException(
            status_code=400,
            detail="Invalid knockout prediction round",
        )

    return KNOCKOUT_PREDICTION_LOCK_KEYS[round_key]


def get_knockout_wildcard_lock_key(round_key: str) -> str:
    if round_key not in KNOCKOUT_WILDCARD_LOCK_KEYS:
        raise HTTPException(
            status_code=400,
            detail="Invalid knockout wildcard round",
        )

    return KNOCKOUT_WILDCARD_LOCK_KEYS[round_key]