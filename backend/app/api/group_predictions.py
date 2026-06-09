from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.core.supabase import supabase
from app.services.lock_service import assert_prediction_open

router = APIRouter()


class GroupPredictionItem(BaseModel):
    group_id: str
    team_id: str
    predicted_position: int


class SaveGroupPredictionsRequest(BaseModel):
    predictions: list[GroupPredictionItem]


def get_user_id_from_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")

    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        return user_response.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid auth token")


@router.post("")
@router.post("/")
def save_group_predictions(
    payload: SaveGroupPredictionsRequest,
    authorization: str | None = Header(default=None),
):
    user_id = get_user_id_from_token(authorization)

    assert_prediction_open("GROUP_STANDINGS")

    if not payload.predictions:
        raise HTTPException(status_code=400, detail="No predictions provided")

    grouped_predictions: dict[str, list[GroupPredictionItem]] = {}

    for prediction in payload.predictions:
        if prediction.predicted_position < 1 or prediction.predicted_position > 4:
            raise HTTPException(
                status_code=400,
                detail="Predicted position must be between 1 and 4",
            )

        grouped_predictions.setdefault(prediction.group_id, []).append(prediction)

    for group_id, group_items in grouped_predictions.items():
        if len(group_items) != 4:
            raise HTTPException(
                status_code=400,
                detail=f"Group {group_id} must have exactly 4 predictions",
            )

        positions = [item.predicted_position for item in group_items]
        team_ids = [item.team_id for item in group_items]

        if sorted(positions) != [1, 2, 3, 4]:
            raise HTTPException(
                status_code=400,
                detail=f"Group {group_id} must contain positions 1, 2, 3, and 4",
            )

        if len(set(team_ids)) != 4:
            raise HTTPException(
                status_code=400,
                detail=f"Group {group_id} has duplicate teams",
            )

    group_ids = list(grouped_predictions.keys())

    for group_id in group_ids:
        (
            supabase
            .table("group_predictions")
            .delete()
            .eq("user_id", user_id)
            .eq("group_id", group_id)
            .execute()
        )

    rows = [
        {
            "user_id": user_id,
            "group_id": prediction.group_id,
            "team_id": prediction.team_id,
            "predicted_position": prediction.predicted_position,
        }
        for prediction in payload.predictions
    ]

    supabase.table("group_predictions").insert(rows).execute()

    return {
        "message": "Group predictions saved successfully",
        "count": len(rows),
    }


@router.get("")
@router.get("/")
def get_my_group_predictions(
    authorization: str | None = Header(default=None),
):
    user_id = get_user_id_from_token(authorization)

    result = (
        supabase
        .table("group_predictions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    return {
        "count": len(result.data or []),
        "data": result.data or [],
    }


@router.get("/with-teams")
def get_my_group_predictions_with_teams(
    authorization: str | None = Header(default=None),
):
    user_id = get_user_id_from_token(authorization)

    predictions_result = (
        supabase
        .table("group_predictions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    predictions = predictions_result.data or []

    if not predictions:
        return {
            "count": 0,
            "data": [],
        }

    teams_result = supabase.table("teams").select("*").execute()
    groups_result = supabase.table("groups").select("*").execute()

    teams = teams_result.data or []
    groups = groups_result.data or []

    teams_by_id = {team["id"]: team for team in teams}
    groups_by_id = {group["id"]: group for group in groups}

    enriched_predictions = []

    for prediction in predictions:
        enriched_predictions.append({
            **prediction,
            "team": teams_by_id.get(prediction["team_id"]),
            "group": groups_by_id.get(prediction["group_id"]),
        })

    enriched_predictions.sort(
        key=lambda item: (
            item["group"].get("code", "") if item["group"] else "",
            item["predicted_position"],
        )
    )

    return {
        "count": len(enriched_predictions),
        "data": enriched_predictions,
    }