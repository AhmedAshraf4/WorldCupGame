from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import APIKeyHeader

from app.core.supabase import supabase
from app.api.badges import BADGES, build_badges_for_profile, get_manual_badge_keys

router = APIRouter()

authorization_header = APIKeyHeader(
    name="Authorization",
    auto_error=False,
)


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


def enrich_profiles_with_avatars(profiles: list[dict]) -> list[dict]:
    avatar_ids = [
        profile["avatar_id"]
        for profile in profiles
        if is_valid_uuid(profile.get("avatar_id"))
    ]

    avatars_by_id = {}

    if avatar_ids:
        avatars_result = (
            supabase
            .table("avatars")
            .select("*")
            .in_("id", avatar_ids)
            .execute()
        )

        avatars_by_id = {
            avatar["id"]: avatar
            for avatar in avatars_result.data or []
        }

    enriched_profiles = []

    for index, profile in enumerate(profiles):
        avatar = None

        if is_valid_uuid(profile.get("avatar_id")):
            avatar = avatars_by_id.get(profile["avatar_id"])

        enriched_profiles.append({
            **profile,
            "rank": index + 1,
            "avatar": avatar,
            "selected_badge": get_selected_badge(profile),
        })

    return enriched_profiles


def get_selected_badge(profile: dict) -> dict | None:
    selected_badge_key = profile.get("selected_badge_key")

    if selected_badge_key not in BADGES:
        return None

    owned_badge_keys = {
        badge["key"]
        for badge in build_badges_for_profile(
            profile,
            get_manual_badge_keys(profile.get("id")),
        )
    }

    if selected_badge_key not in owned_badge_keys:
        return None

    return BADGES[selected_badge_key]


@router.get("/global")
def get_global_scoreboard(
    user_id: str = Depends(get_user_id_from_token),
):
    profiles_result = (
        supabase
        .table("profiles")
        .select("id,display_name,total_points,avatar_id,selected_badge_key")
        .order("total_points", desc=True)
        .limit(100)
        .execute()
    )

    profiles = profiles_result.data or []

    enriched_profiles = enrich_profiles_with_avatars(profiles)

    return {
        "count": len(enriched_profiles),
        "data": enriched_profiles,
    }


@router.get("/club/{club_id}")
def get_club_scoreboard(
    club_id: str,
    user_id: str = Depends(get_user_id_from_token),
):
    if not is_valid_uuid(club_id):
        raise HTTPException(status_code=400, detail="Invalid club id")

    my_membership_result = (
        supabase
        .table("club_members")
        .select("*")
        .eq("club_id", club_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not my_membership_result.data:
        raise HTTPException(
            status_code=403,
            detail="You are not a member of this club",
        )

    club_result = (
        supabase
        .table("clubs")
        .select("*")
        .eq("id", club_id)
        .execute()
    )

    if not club_result.data:
        raise HTTPException(status_code=404, detail="Club not found")

    club = club_result.data[0]

    members_result = (
        supabase
        .table("club_members")
        .select("*")
        .eq("club_id", club_id)
        .execute()
    )

    members = members_result.data or []

    user_ids = [
        member["user_id"]
        for member in members
        if is_valid_uuid(member.get("user_id"))
    ]

    if not user_ids:
        return {
            "club": club,
            "count": 0,
            "data": [],
        }

    profiles_result = (
        supabase
        .table("profiles")
        .select("id,display_name,total_points,avatar_id,selected_badge_key")
        .in_("id", user_ids)
        .order("total_points", desc=True)
        .execute()
    )

    profiles = profiles_result.data or []

    enriched_profiles = enrich_profiles_with_avatars(profiles)

    return {
        "club": club,
        "count": len(enriched_profiles),
        "data": enriched_profiles,
    }
