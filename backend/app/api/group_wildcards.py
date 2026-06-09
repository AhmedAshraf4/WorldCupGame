from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from app.core.supabase import supabase
from app.services.lock_service import assert_prediction_open

router = APIRouter()

authorization_header = APIKeyHeader(
    name="Authorization",
    auto_error=False,
)


class GroupWildcardItem(BaseModel):
    team_id: str
    predicted_position: int


class SaveGroupWildcardsRequest(BaseModel):
    wildcards: list[GroupWildcardItem]


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


@router.post("")
@router.post("/")
def save_group_wildcards(
    payload: SaveGroupWildcardsRequest,
    user_id: str = Depends(get_user_id_from_token),
):
    assert_prediction_open("GROUP_WILDCARDS")

    if len(payload.wildcards) != 4:
        raise HTTPException(
            status_code=400,
            detail="You must select exactly 4 group wildcards",
        )

    positions = [item.predicted_position for item in payload.wildcards]
    team_ids = [item.team_id for item in payload.wildcards]

    if sorted(positions) != [1, 2, 3, 4]:
        raise HTTPException(
            status_code=400,
            detail="You must select one wildcard for positions 1, 2, 3, and 4",
        )

    if len(set(team_ids)) != 4:
        raise HTTPException(
            status_code=400,
            detail="You cannot select the same team more than once",
        )

    for team_id in team_ids:
        if not is_valid_uuid(team_id):
            raise HTTPException(status_code=400, detail="Invalid team id")

    predictions_result = (
        supabase
        .table("group_predictions")
        .select("*")
        .eq("user_id", user_id)
        .in_("team_id", team_ids)
        .execute()
    )

    predictions = predictions_result.data or []

    predictions_by_team_id = {
        prediction["team_id"]: prediction
        for prediction in predictions
    }

    rows = []

    for wildcard in payload.wildcards:
        saved_prediction = predictions_by_team_id.get(wildcard.team_id)

        if not saved_prediction:
            raise HTTPException(
                status_code=400,
                detail="Wildcard team must exist in your saved group standings",
            )

        if saved_prediction["predicted_position"] != wildcard.predicted_position:
            raise HTTPException(
                status_code=400,
                detail="Wildcard team must match the selected predicted position",
            )

        rows.append({
            "user_id": user_id,
            "group_id": saved_prediction["group_id"],
            "team_id": wildcard.team_id,
            "predicted_position": wildcard.predicted_position,
        })

    (
        supabase
        .table("group_wildcards")
        .delete()
        .eq("user_id", user_id)
        .execute()
    )

    insert_result = (
        supabase
        .table("group_wildcards")
        .insert(rows)
        .execute()
    )

    return {
        "message": "Group wildcards saved successfully",
        "count": len(insert_result.data or rows),
        "data": insert_result.data or rows,
    }


@router.get("")
@router.get("/")
def get_my_group_wildcards(
    user_id: str = Depends(get_user_id_from_token),
):
    result = (
        supabase
        .table("group_wildcards")
        .select("*")
        .eq("user_id", user_id)
        .order("predicted_position")
        .execute()
    )

    return {
        "count": len(result.data or []),
        "data": result.data or [],
    }


@router.get("/with-teams")
def get_my_group_wildcards_with_teams(
    user_id: str = Depends(get_user_id_from_token),
):
    wildcards_result = (
        supabase
        .table("group_wildcards")
        .select("*")
        .eq("user_id", user_id)
        .order("predicted_position")
        .execute()
    )

    wildcards = wildcards_result.data or []

    if not wildcards:
        return {
            "count": 0,
            "data": [],
        }

    team_ids = [
        wildcard["team_id"]
        for wildcard in wildcards
        if is_valid_uuid(wildcard.get("team_id"))
    ]

    group_ids = [
        wildcard["group_id"]
        for wildcard in wildcards
        if is_valid_uuid(wildcard.get("group_id"))
    ]

    teams_by_id = {}
    groups_by_id = {}

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

    if group_ids:
        groups_result = (
            supabase
            .table("groups")
            .select("*")
            .in_("id", list(set(group_ids)))
            .execute()
        )

        groups_by_id = {
            group["id"]: group
            for group in groups_result.data or []
        }

    enriched = []

    for wildcard in wildcards:
        enriched.append({
            **wildcard,
            "team": teams_by_id.get(wildcard.get("team_id")),
            "group": groups_by_id.get(wildcard.get("group_id")),
        })

    return {
        "count": len(enriched),
        "data": enriched,
    }