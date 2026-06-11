from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from app.core.supabase import supabase
from app.services.lock_service import (
    assert_match_prediction_open,
    get_knockout_wildcard_lock_key,
)

router = APIRouter()

authorization_header = APIKeyHeader(
    name="Authorization",
    auto_error=False,
)

ROUND_ORDER = [
    "ROUND_OF_32",
    "ROUND_OF_16",
    "QUARTER_FINAL",
    "SEMI_FINAL",
    "FINAL",
]

ROUND_LABELS = {
    "ROUND_OF_32": "Round of 32",
    "ROUND_OF_16": "Round of 16",
    "QUARTER_FINAL": "Quarter Final",
    "SEMI_FINAL": "Semi Final",
    "FINAL": "Final",
}


class KnockoutWildcardItem(BaseModel):
    wildcard_round: str
    team_id: str


class SaveKnockoutWildcardsRequest(BaseModel):
    wildcards: list[KnockoutWildcardItem]


def is_valid_uuid(value: str | None) -> bool:
    if not value:
        return False

    try:
        UUID(str(value))
        return True
    except ValueError:
        return False


def get_user_id_from_token(
    authorization: str | None = Depends(authorization_header),
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")

    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        return user_response.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid auth token")


def normalize_round(value: str | None) -> str | None:
    if not value:
        return None

    text = (
        str(value)
        .strip()
        .lower()
        .replace("_", " ")
        .replace("-", " ")
    )

    if text in ["round of 32", "last 32", "ro32", "round 32"]:
        return "ROUND_OF_32"

    if text in ["round of 16", "last 16", "ro16", "round 16"]:
        return "ROUND_OF_16"

    if "round of 32" in text or "last 32" in text or "ro32" in text:
        return "ROUND_OF_32"

    if "round of 16" in text or "last 16" in text or "ro16" in text:
        return "ROUND_OF_16"

    if "quarter" in text:
        return "QUARTER_FINAL"

    if "semi" in text:
        return "SEMI_FINAL"

    if "final" in text:
        return "FINAL"

    return None


def get_match_round(match: dict | None) -> str | None:
    if not match:
        return None

    fields = [
        match.get("round_name"),
        match.get("stage"),
        match.get("round"),
        match.get("round_code"),
        match.get("match_type"),
    ]

    for field in fields:
        normalized = normalize_round(field)

        if normalized:
            return normalized

    return None


def sort_by_round(row: dict) -> int:
    wildcard_round = row.get("wildcard_round")

    if wildcard_round in ROUND_ORDER:
        return ROUND_ORDER.index(wildcard_round)

    return 999


def get_user_knockout_predictions_with_data(user_id: str) -> list[dict]:
    predictions_result = (
        supabase
        .table("knockout_predictions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    predictions = predictions_result.data or []

    if not predictions:
        return []

    match_ids = [
        prediction["match_id"]
        for prediction in predictions
        if is_valid_uuid(prediction.get("match_id"))
    ]

    team_ids = [
        prediction["predicted_winner_team_id"]
        for prediction in predictions
        if is_valid_uuid(prediction.get("predicted_winner_team_id"))
    ]

    matches_by_id = {}
    teams_by_id = {}

    if match_ids:
        matches_result = (
            supabase
            .table("matches")
            .select("*")
            .in_("id", list(set(match_ids)))
            .execute()
        )

        matches_by_id = {
            match["id"]: match
            for match in matches_result.data or []
        }

    if team_ids:
        teams_result = (
            supabase
            .table("teams")
            .select("*")
            .in_("id", list(set(team_ids)))
            .execute()
        )

        teams_by_id = {
            team["id"]: team
            for team in teams_result.data or []
        }

    enriched = []

    for prediction in predictions:
        match = matches_by_id.get(prediction.get("match_id"))
        team_id = prediction.get("predicted_winner_team_id")
        wildcard_round = get_match_round(match)

        if not wildcard_round:
            continue

        enriched.append({
            **prediction,
            "team_id": team_id,
            "wildcard_round": wildcard_round,
            "round_label": ROUND_LABELS.get(wildcard_round, wildcard_round),
            "team": teams_by_id.get(team_id),
            "match": match,
        })

    enriched.sort(key=sort_by_round)

    return enriched


def get_user_prediction_team_ids_by_round(user_id: str) -> dict[str, set[str]]:
    predictions = get_user_knockout_predictions_with_data(user_id)

    result: dict[str, set[str]] = {}

    for prediction in predictions:
        wildcard_round = prediction.get("wildcard_round")
        team_id = prediction.get("team_id")

        if not wildcard_round or not is_valid_uuid(team_id):
            continue

        if wildcard_round not in result:
            result[wildcard_round] = set()

        result[wildcard_round].add(team_id)

    return result


def enrich_wildcards_with_teams(
    wildcards: list[dict],
    user_id: str,
) -> list[dict]:
    if not wildcards:
        return []

    team_ids = [
        wildcard["team_id"]
        for wildcard in wildcards
        if is_valid_uuid(wildcard.get("team_id"))
    ]

    teams_by_id = {}

    if team_ids:
        teams_result = (
            supabase
            .table("teams")
            .select("*")
            .in_("id", list(set(team_ids)))
            .execute()
        )

        teams_by_id = {
            team["id"]: team
            for team in teams_result.data or []
        }

    predictions = get_user_knockout_predictions_with_data(user_id)

    predictions_by_round_team = {
        f"{prediction['wildcard_round']}:{prediction['team_id']}": prediction
        for prediction in predictions
    }

    enriched = []

    for wildcard in wildcards:
        wildcard_round = wildcard.get("wildcard_round")
        team_id = wildcard.get("team_id")
        key = f"{wildcard_round}:{team_id}"

        enriched.append({
            **wildcard,
            "round_label": ROUND_LABELS.get(wildcard_round, wildcard_round),
            "team": teams_by_id.get(team_id),
            "prediction": predictions_by_round_team.get(key),
        })

    enriched.sort(key=sort_by_round)

    return enriched


@router.get("/options")
def get_knockout_wildcard_options(
    user_id: str = Depends(get_user_id_from_token),
):
    predictions = get_user_knockout_predictions_with_data(user_id)

    grouped: dict[str, list[dict]] = {}

    for prediction in predictions:
        wildcard_round = prediction.get("wildcard_round")

        if not wildcard_round:
            continue

        if wildcard_round not in grouped:
            grouped[wildcard_round] = []

        grouped[wildcard_round].append(prediction)

    data = []

    for wildcard_round in ROUND_ORDER:
        data.append({
            "wildcard_round": wildcard_round,
            "round_label": ROUND_LABELS[wildcard_round],
            "options": grouped.get(wildcard_round, []),
        })

    return {
        "count": len(data),
        "data": data,
    }


@router.post("")
@router.post("/")
def save_knockout_wildcards(
    payload: SaveKnockoutWildcardsRequest,
    user_id: str = Depends(get_user_id_from_token),
):
    if not payload.wildcards:
        raise HTTPException(
            status_code=400,
            detail="No knockout wildcards provided",
        )

    normalized_items = []

    for item in payload.wildcards:
        wildcard_round = normalize_round(item.wildcard_round)

        if wildcard_round not in ROUND_ORDER:
            raise HTTPException(
                status_code=400,
                detail="Invalid wildcard round",
            )

        if not is_valid_uuid(item.team_id):
            raise HTTPException(status_code=400, detail="Invalid team id")

        normalized_items.append({
            "wildcard_round": wildcard_round,
            "team_id": item.team_id,
        })

    rounds = [item["wildcard_round"] for item in normalized_items]

    if len(set(rounds)) != len(rounds):
        raise HTTPException(
            status_code=400,
            detail="You can only select one wildcard per knockout round",
        )

    predictions = get_user_knockout_predictions_with_data(user_id)
    predictions_by_round_team = {
        f"{prediction['wildcard_round']}:{prediction['team_id']}": prediction
        for prediction in predictions
    }

    for item in normalized_items:
        wildcard_round = item["wildcard_round"]
        team_id = item["team_id"]
        prediction = predictions_by_round_team.get(f"{wildcard_round}:{team_id}")

        if not prediction:
            raise HTTPException(
                status_code=400,
                detail="Wildcard team must exist in your predictions for the same knockout round",
            )

        assert_match_prediction_open(
            match=prediction["match"],
            lock_key=get_knockout_wildcard_lock_key(wildcard_round),
            label="knockout wildcard",
        )

    now = datetime.now(timezone.utc).isoformat()

    rows = [
        {
            "user_id": user_id,
            "wildcard_round": item["wildcard_round"],
            "team_id": item["team_id"],
            "updated_at": now,
        }
        for item in normalized_items
    ]

    result = (
        supabase
        .table("knockout_wildcards")
        .upsert(
            rows,
            on_conflict="user_id,wildcard_round",
        )
        .execute()
    )

    return {
        "message": "Knockout wildcards saved successfully",
        "count": len(result.data or []),
        "data": result.data or rows,
    }


@router.get("")
@router.get("/")
def get_my_knockout_wildcards(
    user_id: str = Depends(get_user_id_from_token),
):
    result = (
        supabase
        .table("knockout_wildcards")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    wildcards = result.data or []
    wildcards.sort(key=sort_by_round)

    return {
        "count": len(wildcards),
        "data": wildcards,
    }


@router.get("/with-teams")
def get_my_knockout_wildcards_with_teams(
    user_id: str = Depends(get_user_id_from_token),
):
    result = (
        supabase
        .table("knockout_wildcards")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    wildcards = result.data or []

    enriched = enrich_wildcards_with_teams(wildcards, user_id)

    return {
        "count": len(enriched),
        "data": enriched,
    }
