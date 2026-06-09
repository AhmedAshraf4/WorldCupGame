from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.core.supabase import supabase
from app.services.lock_service import assert_prediction_open

router = APIRouter()


class OnboardingRequest(BaseModel):
    display_name: str
    avatar_id: str
    champion_team_id: str


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


@router.get("/status")
def get_onboarding_status(
    authorization: str | None = Header(default=None),
):
    user_id = get_user_id_from_token(authorization)

    profile_result = (
        supabase
        .table("profiles")
        .select("*")
        .eq("id", user_id)
        .execute()
    )

    champion_result = (
        supabase
        .table("champion_predictions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    profile = profile_result.data[0] if profile_result.data else None
    champion_prediction = (
        champion_result.data[0] if champion_result.data else None
    )

    has_display_name = bool(profile and profile.get("display_name"))
    has_avatar = bool(profile and profile.get("avatar_id"))
    has_champion = bool(champion_prediction)

    is_complete = has_display_name and has_avatar and has_champion

    return {
        "is_complete": is_complete,
        "has_display_name": has_display_name,
        "has_avatar": has_avatar,
        "has_champion": has_champion,
        "profile": profile,
        "champion_prediction": champion_prediction,
    }


@router.post("/")
def complete_onboarding(
    payload: OnboardingRequest,
    authorization: str | None = Header(default=None),
):
    user_id = get_user_id_from_token(authorization)

    display_name = payload.display_name.strip()

    if not display_name:
        raise HTTPException(status_code=400, detail="Display name is required")

    if not is_valid_uuid(payload.avatar_id):
        raise HTTPException(status_code=400, detail="Invalid avatar id")

    if not is_valid_uuid(payload.champion_team_id):
        raise HTTPException(status_code=400, detail="Invalid champion team id")

    existing_champion = (
        supabase
        .table("champion_predictions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    if existing_champion.data:
        raise HTTPException(
            status_code=400,
            detail="Champion prediction already exists and cannot be changed",
        )

    assert_prediction_open("CHAMPION_PICK")

    team_result = (
        supabase
        .table("teams")
        .select("id")
        .eq("id", payload.champion_team_id)
        .execute()
    )

    if not team_result.data:
        raise HTTPException(status_code=404, detail="Champion team not found")

    avatar_result = (
        supabase
        .table("avatars")
        .select("id")
        .eq("id", payload.avatar_id)
        .execute()
    )

    if not avatar_result.data:
        raise HTTPException(status_code=404, detail="Avatar not found")

    supabase.table("profiles").upsert({
        "id": user_id,
        "display_name": display_name,
        "avatar_id": payload.avatar_id,
    }).execute()

    supabase.table("champion_predictions").insert({
        "user_id": user_id,
        "team_id": payload.champion_team_id,
    }).execute()

    return {
        "message": "Onboarding completed successfully",
        "user_id": user_id,
    }