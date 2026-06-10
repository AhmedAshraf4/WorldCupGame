from fastapi import APIRouter, Header, HTTPException
from app.core.supabase import supabase

router = APIRouter()


def get_user_id_from_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")

    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        return user_response.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid auth token")


@router.get("/")
def get_current_user_profile(authorization: str | None = Header(default=None)):
    user_id = get_user_id_from_token(authorization)

    profile_result = (
        supabase
        .table("profiles")
        .select("*")
        .eq("id", user_id)
        .execute()
    )

    if not profile_result.data:
        return {
            "onboarding_completed": False,
            "profile": None,
            "avatar": None,
            "champion": None,
            "total_points": 0,
        }

    profile = profile_result.data[0]

    avatar = None
    if profile.get("avatar_id"):
        avatar_result = (
            supabase
            .table("avatars")
            .select("*")
            .eq("id", profile["avatar_id"])
            .execute()
        )
        avatar = avatar_result.data[0] if avatar_result.data else None

    champion_result = (
        supabase
        .table("champion_predictions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    champion = None

    if champion_result.data:
        champion_prediction = champion_result.data[0]

        team_result = (
            supabase
            .table("teams")
            .select("*")
            .eq("id", champion_prediction["team_id"])
            .execute()
        )

        if team_result.data:
            champion = {
                "prediction": champion_prediction,
                "team": team_result.data[0],
            }

    return {
        "onboarding_completed": True,
        "profile": profile,
        "avatar": avatar,
        "champion": champion,
        "total_points": int(profile.get("total_points") or 0),
    }
