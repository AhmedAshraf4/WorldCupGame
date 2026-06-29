from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from app.core.supabase import supabase

router = APIRouter()

authorization_header = APIKeyHeader(
    name="Authorization",
    auto_error=False,
)

BADGE_BASE_URL = (
    "https://zouxaewahijwrrguxebi.supabase.co/storage/v1/object/public/badges"
)

BADGES = {
    "wc26": {
        "key": "wc26",
        "name": "World Cup 26",
        "description": "Joined the Road to 26 game.",
        "image_url": f"{BADGE_BASE_URL}/wc26.png",
    },
    "veteran": {
        "key": "veteran",
        "name": "Veteran",
        "description": "Part of the original tournament crew.",
        "image_url": f"{BADGE_BASE_URL}/veteran.png",
    },
    "67p": {
        "key": "67p",
        "name": "67 Points",
        "description": "Reached 67 points.",
        "image_url": f"{BADGE_BASE_URL}/67p.png",
        "points_required": 67,
    },
    "100p": {
        "key": "100p",
        "name": "100 Points",
        "description": "Reached 100 points.",
        "image_url": f"{BADGE_BASE_URL}/100p.png",
        "points_required": 100,
    },
    "500p": {
        "key": "500p",
        "name": "500 Points",
        "description": "Reached 500 points.",
        "image_url": f"{BADGE_BASE_URL}/500p.png",
        "points_required": 500,
    },
    "1000p": {
        "key": "1000p",
        "name": "1000 Points",
        "description": "Reached 1000 points.",
        "image_url": f"{BADGE_BASE_URL}/1000p.png",
        "points_required": 1000,
    },
    "winner": {
        "key": "winner",
        "name": "Winner",
        "description": "Declared tournament winner.",
        "image_url": f"{BADGE_BASE_URL}/winner.png",
    },
}

POINT_BADGE_KEYS = ["67p", "100p", "500p", "1000p"]
BASE_BADGE_KEYS = ["wc26"]


class WinnerBadgeRequest(BaseModel):
    user_id: str


class SelectedBadgeRequest(BaseModel):
    badge_key: str


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


def get_admin_user_id_from_token(
    authorization: str | None = Depends(authorization_header),
) -> str:
    user_id = get_user_id_from_token(authorization)

    profile_result = (
        supabase
        .table("profiles")
        .select("id,is_admin")
        .eq("id", user_id)
        .execute()
    )

    if not profile_result.data or not profile_result.data[0].get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    return user_id


def get_manual_badge_keys(user_id: str) -> set[str]:
    try:
        result = (
            supabase
            .table("user_badges")
            .select("badge_key")
            .eq("user_id", user_id)
            .execute()
        )
    except Exception:
        return set()

    return {
        row["badge_key"]
        for row in result.data or []
        if row.get("badge_key") in BADGES
    }


def build_badges_for_profile(profile: dict, manual_badge_keys: set[str] | None = None):
    total_points = int(profile.get("total_points") or 0)
    badge_keys = [*BASE_BADGE_KEYS]

    for badge_key in POINT_BADGE_KEYS:
        points_required = int(BADGES[badge_key]["points_required"])

        if total_points >= points_required:
            badge_keys.append(badge_key)

    for badge_key in sorted(manual_badge_keys or set()):
        if badge_key not in badge_keys and badge_key in BADGES:
            badge_keys.append(badge_key)

    return [BADGES[badge_key] for badge_key in badge_keys]


def get_global_top_profiles(limit: int = 3) -> list[dict]:
    result = (
        supabase
        .table("profiles")
        .select("id,display_name,total_points,avatar_id")
        .order("total_points", desc=True)
        .limit(limit)
        .execute()
    )

    profiles = result.data or []
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

    enriched = []

    for index, profile in enumerate(profiles):
        enriched.append({
            **profile,
            "rank": index + 1,
            "avatar": avatars_by_id.get(profile.get("avatar_id")),
        })

    return enriched


@router.get("/me")
def get_my_badges(user_id: str = Depends(get_user_id_from_token)):
    profile_result = (
        supabase
        .table("profiles")
        .select("id,display_name,total_points,avatar_id,selected_badge_key")
        .eq("id", user_id)
        .execute()
    )

    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = profile_result.data[0]
    badges = build_badges_for_profile(profile, get_manual_badge_keys(user_id))
    owned_badge_keys = {badge["key"] for badge in badges}
    selected_badge_key = profile.get("selected_badge_key")
    selected_badge = (
        BADGES.get(selected_badge_key)
        if selected_badge_key in owned_badge_keys
        else None
    )

    return {
        "count": len(badges),
        "data": badges,
        "selected_badge_key": selected_badge_key if selected_badge else None,
        "selected_badge": selected_badge,
    }


@router.post("/selected")
def select_badge(
    payload: SelectedBadgeRequest,
    user_id: str = Depends(get_user_id_from_token),
):
    if payload.badge_key not in BADGES:
        raise HTTPException(status_code=400, detail="Invalid badge")

    profile_result = (
        supabase
        .table("profiles")
        .select("id,display_name,total_points,avatar_id")
        .eq("id", user_id)
        .execute()
    )

    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = profile_result.data[0]
    owned_badge_keys = {
        badge["key"]
        for badge in build_badges_for_profile(profile, get_manual_badge_keys(user_id))
    }

    if payload.badge_key not in owned_badge_keys:
        raise HTTPException(
            status_code=400,
            detail="You can only select a badge you own",
        )

    update_result = (
        supabase
        .table("profiles")
        .update({"selected_badge_key": payload.badge_key})
        .eq("id", user_id)
        .execute()
    )

    return {
        "message": "Selected badge updated successfully",
        "data": {
            "selected_badge_key": payload.badge_key,
            "selected_badge": BADGES[payload.badge_key],
            "profile": update_result.data[0] if update_result.data else None,
        },
    }


@router.get("/announcement")
def get_winner_announcement(
    authorization: str | None = Header(default=None),
):
    get_user_id_from_token(authorization)
    manual_winner_keys = get_manual_winner_user_ids()

    if not manual_winner_keys:
        return {
            "is_active": False,
            "top_three": [],
            "winner_user_ids": [],
        }

    return {
        "is_active": True,
        "message": (
            "thank you for making this worldcup an unforgettable experience. "
            "If you see this know that I love you"
        ),
        "top_three": get_global_top_profiles(3),
        "winner_user_ids": manual_winner_keys,
    }


def get_manual_winner_user_ids() -> list[str]:
    try:
        result = (
            supabase
            .table("user_badges")
            .select("user_id")
            .eq("badge_key", "winner")
            .execute()
        )
    except Exception:
        return []

    return [
        row["user_id"]
        for row in result.data or []
        if is_valid_uuid(row.get("user_id"))
    ]


@router.get("/admin/profiles")
def get_profiles_for_badge_admin(
    user_id: str = Depends(get_admin_user_id_from_token),
):
    profiles_result = (
        supabase
        .table("profiles")
        .select("id,display_name,total_points,avatar_id")
        .order("total_points", desc=True)
        .execute()
    )

    profiles = profiles_result.data or []
    winner_user_ids = set(get_manual_winner_user_ids())

    data = [
        {
            **profile,
            "has_winner_badge": profile.get("id") in winner_user_ids,
            "badges": build_badges_for_profile(
                profile,
                {"winner"} if profile.get("id") in winner_user_ids else set(),
            ),
        }
        for profile in profiles
    ]

    return {
        "count": len(data),
        "data": data,
    }


@router.post("/admin/winner")
def set_winner_badge(
    payload: WinnerBadgeRequest,
    admin_user_id: str = Depends(get_admin_user_id_from_token),
):
    if not is_valid_uuid(payload.user_id):
        raise HTTPException(status_code=400, detail="Invalid user id")

    profile_result = (
        supabase
        .table("profiles")
        .select("id")
        .eq("id", payload.user_id)
        .execute()
    )

    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    now = datetime.now(timezone.utc).isoformat()

    try:
        (
            supabase
            .table("user_badges")
            .delete()
            .eq("badge_key", "winner")
            .execute()
        )
        supabase.table("user_badges").upsert(
            {
                "user_id": payload.user_id,
                "badge_key": "winner",
                "awarded_by": admin_user_id,
                "awarded_at": now,
            },
            on_conflict="user_id,badge_key",
        ).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not award winner badge. Make sure the user_badges "
                "table exists in Supabase."
            ),
        ) from exc

    return {
        "message": "Winner badge awarded successfully",
        "data": {
            "user_id": payload.user_id,
            "badge": BADGES["winner"],
        },
    }
