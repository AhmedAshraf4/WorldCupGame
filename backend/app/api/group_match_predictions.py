from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.core.supabase import supabase
from app.services.lock_service import (
    assert_prediction_open,
    get_group_matchday_lock_key,
)

router = APIRouter()


class GroupMatchPredictionItem(BaseModel):
    match_id: str
    predicted_outcome: str


class SaveGroupMatchPredictionsRequest(BaseModel):
    predictions: list[GroupMatchPredictionItem]


def is_valid_uuid(value: str | None) -> bool:
    if not value:
        return False

    try:
        UUID(str(value))
        return True
    except ValueError:
        return False


def get_user_id_from_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")

    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        return user_response.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid auth token")


def is_group_match(match: dict) -> bool:
    text = " ".join(
        str(match.get(key) or "")
        for key in ["round_name", "stage", "round", "round_code", "match_type"]
    ).lower()

    if "group" in text:
        return True

    if match.get("group_id"):
        return True

    return False


def get_matchday(match: dict) -> int | None:
    possible_values = [
        match.get("matchday"),
        match.get("group_matchday"),
        match.get("game_round"),
        match.get("round_number"),
    ]

    for value in possible_values:
        if value is None:
            continue

        try:
            matchday = int(value)

            if matchday in [1, 2, 3]:
                return matchday
        except Exception:
            pass

    text = " ".join(
        str(match.get(key) or "")
        for key in ["round_name", "stage", "round", "round_code", "match_type"]
    ).lower()

    if "matchday 1" in text or "match day 1" in text or "md1" in text:
        return 1

    if "matchday 2" in text or "match day 2" in text or "md2" in text:
        return 2

    if "matchday 3" in text or "match day 3" in text or "md3" in text:
        return 3

    return None


def enrich_predictions_with_matches(predictions: list[dict]) -> list[dict]:
    if not predictions:
        return []

    match_ids = [
        prediction["match_id"]
        for prediction in predictions
        if is_valid_uuid(prediction.get("match_id"))
    ]

    matches_by_id = {}

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

    enriched = []

    for prediction in predictions:
        match = matches_by_id.get(prediction.get("match_id"))

        enriched.append({
            **prediction,
            "match": match,
            "matchday": get_matchday(match) if match else None,
        })

    return enriched


@router.post("")
@router.post("/")
def save_group_match_predictions(
    payload: SaveGroupMatchPredictionsRequest,
    authorization: str | None = Header(default=None),
):
    user_id = get_user_id_from_token(authorization)

    allowed_outcomes = {"TEAM_A_WIN", "DRAW", "TEAM_B_WIN"}

    if not payload.predictions:
        raise HTTPException(status_code=400, detail="No predictions provided")

    match_ids = [item.match_id for item in payload.predictions]

    if len(set(match_ids)) != len(match_ids):
        raise HTTPException(
            status_code=400,
            detail="Duplicate match prediction found",
        )

    for prediction in payload.predictions:
        if not is_valid_uuid(prediction.match_id):
            raise HTTPException(status_code=400, detail="Invalid match id")

        if prediction.predicted_outcome not in allowed_outcomes:
            raise HTTPException(
                status_code=400,
                detail="Invalid predicted outcome",
            )

    matches_result = (
        supabase
        .table("matches")
        .select("*")
        .in_("id", match_ids)
        .execute()
    )

    matches = matches_result.data or []

    matches_by_id = {
        match["id"]: match
        for match in matches
    }

    rows = []

    for item in payload.predictions:
        match = matches_by_id.get(item.match_id)

        if not match:
            raise HTTPException(status_code=404, detail="Match not found")

        if not is_group_match(match):
            raise HTTPException(
                status_code=400,
                detail="This match is not a group-stage match",
            )

        matchday = get_matchday(match)

        if matchday not in [1, 2, 3]:
            raise HTTPException(
                status_code=400,
                detail="Could not detect group matchday for this match",
            )

        assert_prediction_open(
            get_group_matchday_lock_key(matchday)
        )

        rows.append({
            "user_id": user_id,
            "match_id": item.match_id,
            "predicted_outcome": item.predicted_outcome,
        })

    for match_id in match_ids:
        (
            supabase
            .table("group_match_predictions")
            .delete()
            .eq("user_id", user_id)
            .eq("match_id", match_id)
            .execute()
        )

    insert_result = (
        supabase
        .table("group_match_predictions")
        .insert(rows)
        .execute()
    )

    return {
        "message": "Group match predictions saved successfully",
        "count": len(insert_result.data or rows),
        "data": insert_result.data or rows,
    }


@router.get("")
@router.get("/")
def get_my_group_match_predictions(
    authorization: str | None = Header(default=None),
):
    user_id = get_user_id_from_token(authorization)

    result = (
        supabase
        .table("group_match_predictions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    predictions = result.data or []

    return {
        "count": len(predictions),
        "data": predictions,
    }


@router.get("/with-matches")
def get_my_group_match_predictions_with_matches(
    authorization: str | None = Header(default=None),
):
    user_id = get_user_id_from_token(authorization)

    result = (
        supabase
        .table("group_match_predictions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    predictions = result.data or []

    enriched = enrich_predictions_with_matches(predictions)

    return {
        "count": len(enriched),
        "data": enriched,
    }