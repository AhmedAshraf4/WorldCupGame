from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from app.core.supabase import supabase
from app.services.lock_service import (
    assert_match_prediction_open,
    get_knockout_prediction_lock_key,
    get_match_round,
)

router = APIRouter()

authorization_header = APIKeyHeader(
    name="Authorization",
    auto_error=False,
)


class KnockoutPredictionItem(BaseModel):
    match_id: str
    predicted_winner_team_id: str


class SaveKnockoutPredictionsRequest(BaseModel):
    predictions: list[KnockoutPredictionItem]


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


def get_match_text(match: dict) -> str:
    fields = [
        match.get("round_name"),
        match.get("round"),
        match.get("stage"),
        match.get("round_code"),
        match.get("match_type"),
    ]

    return (
        " ".join(str(field or "") for field in fields)
        .lower()
        .replace("-", " ")
    )


def is_knockout_match(match: dict) -> bool:
    text = get_match_text(match)

    knockout_keywords = [
        "round of 32",
        "last 32",
        "last_32",
        "ro32",
        "round 32",
        "round_32",
        "round of 16",
        "last 16",
        "last_16",
        "ro16",
        "round 16",
        "round_16",
        "quarter",
        "quarter final",
        "quarter_final",
        "semi",
        "semi final",
        "semi_final",
        "third",
        "bronze",
        "final",
        "knockout",
    ]

    if any(keyword in text for keyword in knockout_keywords):
        return True

    if "group" in text:
        return False

    return False


def sort_match_key(match: dict):
    match_date = match.get("match_date") or match.get("utc_date") or ""
    round_name = match.get("round_name") or ""
    return (match_date, round_name, match.get("id") or "")


def enrich_matches_with_teams(matches: list[dict]) -> list[dict]:
    team_ids = []

    for match in matches:
        if is_valid_uuid(match.get("team_a_id")):
            team_ids.append(match["team_a_id"])

        if is_valid_uuid(match.get("team_b_id")):
            team_ids.append(match["team_b_id"])

    team_ids = list(set(team_ids))

    teams_by_id = {}

    if team_ids:
        teams_result = (
            supabase
            .table("teams")
            .select("*")
            .in_("id", team_ids)
            .execute()
        )

        teams_by_id = {
            team["id"]: team
            for team in teams_result.data or []
        }

    enriched = []

    for match in matches:
        match_round = get_match_round(match)

        enriched.append({
            **match,
            "match_round": match_round,
            "team_a": teams_by_id.get(match.get("team_a_id")),
            "team_b": teams_by_id.get(match.get("team_b_id")),
        })

    return enriched


def enrich_predictions_with_data(predictions: list[dict]) -> list[dict]:
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

        matches = matches_result.data or []
        enriched_matches = enrich_matches_with_teams(matches)

        matches_by_id = {
            match["id"]: match
            for match in enriched_matches
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
        team = teams_by_id.get(prediction.get("predicted_winner_team_id"))

        enriched.append({
            **prediction,
            "match": match,
            "team": team,
            "team_id": prediction.get("predicted_winner_team_id"),
            "match_round": match.get("match_round") if match else None,
            "round_name": match.get("round_name") if match else None,
            "stage": match.get("stage") if match else None,
            "round": match.get("round") if match else None,
            "round_code": match.get("round_code") if match else None,
            "predicted_round": match.get("round_name") if match else None,
        })

    return enriched


@router.get("/matches")
def get_knockout_matches(
    user_id: str = Depends(get_user_id_from_token),
):
    matches_result = (
        supabase
        .table("matches")
        .select("*")
        .execute()
    )

    all_matches = matches_result.data or []

    knockout_matches = [
        match
        for match in all_matches
        if is_knockout_match(match)
        and is_valid_uuid(match.get("team_a_id"))
        and is_valid_uuid(match.get("team_b_id"))
    ]

    knockout_matches.sort(key=sort_match_key)

    enriched_matches = enrich_matches_with_teams(knockout_matches)

    match_ids = [match["id"] for match in enriched_matches]

    predictions_by_match_id = {}

    if match_ids:
        predictions_result = (
            supabase
            .table("knockout_predictions")
            .select("*")
            .eq("user_id", user_id)
            .in_("match_id", match_ids)
            .execute()
        )

        predictions_by_match_id = {
            prediction["match_id"]: prediction
            for prediction in predictions_result.data or []
        }

    data = []

    for match in enriched_matches:
        data.append({
            **match,
            "my_prediction": predictions_by_match_id.get(match["id"]),
        })

    return {
        "count": len(data),
        "data": data,
    }


@router.post("")
@router.post("/")
def save_knockout_predictions(
    payload: SaveKnockoutPredictionsRequest,
    user_id: str = Depends(get_user_id_from_token),
):
    if not payload.predictions:
        raise HTTPException(
            status_code=400,
            detail="No knockout predictions provided",
        )

    match_ids = [item.match_id for item in payload.predictions]

    if len(set(match_ids)) != len(match_ids):
        raise HTTPException(
            status_code=400,
            detail="Duplicate match prediction found",
        )

    for item in payload.predictions:
        if not is_valid_uuid(item.match_id):
            raise HTTPException(status_code=400, detail="Invalid match id")

        if not is_valid_uuid(item.predicted_winner_team_id):
            raise HTTPException(status_code=400, detail="Invalid team id")

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
    now = datetime.now(timezone.utc).isoformat()

    for item in payload.predictions:
        match = matches_by_id.get(item.match_id)

        if not match:
            raise HTTPException(status_code=404, detail="Match not found")

        if not is_knockout_match(match):
            raise HTTPException(
                status_code=400,
                detail="This match is not a knockout match",
            )

        match_round = get_match_round(match)

        if not match_round:
            raise HTTPException(
                status_code=400,
                detail="Could not detect knockout round for this match",
            )

        assert_match_prediction_open(
            match=match,
            lock_key=get_knockout_prediction_lock_key(match_round),
            label="knockout match",
        )

        team_a_id = match.get("team_a_id")
        team_b_id = match.get("team_b_id")

        if not is_valid_uuid(team_a_id) or not is_valid_uuid(team_b_id):
            raise HTTPException(
                status_code=400,
                detail="This knockout match is not ready for predictions yet",
            )

        if item.predicted_winner_team_id not in [team_a_id, team_b_id]:
            raise HTTPException(
                status_code=400,
                detail="Predicted winner must be one of the two match teams",
            )

        rows.append({
            "user_id": user_id,
            "match_id": item.match_id,
            "predicted_winner_team_id": item.predicted_winner_team_id,
            "updated_at": now,
        })

    result = (
        supabase
        .table("knockout_predictions")
        .upsert(
            rows,
            on_conflict="user_id,match_id",
        )
        .execute()
    )

    return {
        "message": "Knockout predictions saved successfully",
        "count": len(result.data or []),
        "data": result.data or rows,
    }


@router.get("")
@router.get("/")
def get_my_knockout_predictions(
    user_id: str = Depends(get_user_id_from_token),
):
    result = (
        supabase
        .table("knockout_predictions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    predictions = result.data or []

    return {
        "count": len(predictions),
        "data": predictions,
    }


@router.get("/with-teams")
def get_my_knockout_predictions_with_teams(
    user_id: str = Depends(get_user_id_from_token),
):
    result = (
        supabase
        .table("knockout_predictions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    predictions = result.data or []

    enriched = enrich_predictions_with_data(predictions)

    return {
        "count": len(enriched),
        "data": enriched,
    }
