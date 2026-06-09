import secrets
import string
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from app.core.supabase import supabase

router = APIRouter()

authorization_header = APIKeyHeader(
    name="Authorization",
    auto_error=False,
)


class CreateClubRequest(BaseModel):
    name: str


class JoinClubRequest(BaseModel):
    invite_code: str


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


def generate_invite_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_unique_invite_code() -> str:
    for _ in range(10):
        invite_code = generate_invite_code()

        result = (
            supabase
            .table("clubs")
            .select("id")
            .eq("invite_code", invite_code)
            .execute()
        )

        if not result.data:
            return invite_code

    raise HTTPException(
        status_code=500,
        detail="Could not generate unique invite code",
    )


@router.post("")
@router.post("/")
def create_club(
    payload: CreateClubRequest,
    user_id: str = Depends(get_user_id_from_token),
):
    club_name = payload.name.strip()

    if len(club_name) < 3:
        raise HTTPException(
            status_code=400,
            detail="Club name must be at least 3 characters",
        )

    invite_code = generate_unique_invite_code()

    club_result = (
        supabase
        .table("clubs")
        .insert({
            "name": club_name,
            "invite_code": invite_code,
            "created_by": user_id,
        })
        .execute()
    )

    if not club_result.data:
        raise HTTPException(status_code=500, detail="Failed to create club")

    club = club_result.data[0]

    supabase.table("club_members").insert({
        "club_id": club["id"],
        "user_id": user_id,
        "role": "owner",
    }).execute()

    return {
        "message": "Club created successfully",
        "data": club,
    }


@router.post("/join")
def join_club(
    payload: JoinClubRequest,
    user_id: str = Depends(get_user_id_from_token),
):
    invite_code = payload.invite_code.strip().upper()

    if not invite_code:
        raise HTTPException(status_code=400, detail="Invite code is required")

    club_result = (
        supabase
        .table("clubs")
        .select("*")
        .eq("invite_code", invite_code)
        .execute()
    )

    if not club_result.data:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    club = club_result.data[0]

    existing_member_result = (
        supabase
        .table("club_members")
        .select("*")
        .eq("club_id", club["id"])
        .eq("user_id", user_id)
        .execute()
    )

    if existing_member_result.data:
        return {
            "message": "You are already a member of this club",
            "data": club,
        }

    supabase.table("club_members").insert({
        "club_id": club["id"],
        "user_id": user_id,
        "role": "member",
    }).execute()

    return {
        "message": "Joined club successfully",
        "data": club,
    }


@router.get("/my")
def get_my_clubs(
    user_id: str = Depends(get_user_id_from_token),
):
    memberships_result = (
        supabase
        .table("club_members")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    memberships = memberships_result.data or []

    if not memberships:
        return {
            "count": 0,
            "data": [],
        }

    club_ids = [
        membership["club_id"]
        for membership in memberships
        if is_valid_uuid(membership.get("club_id"))
    ]

    if not club_ids:
        return {
            "count": 0,
            "data": [],
        }

    clubs_result = (
        supabase
        .table("clubs")
        .select("*")
        .in_("id", club_ids)
        .execute()
    )

    members_result = (
        supabase
        .table("club_members")
        .select("*")
        .in_("club_id", club_ids)
        .execute()
    )

    member_counts: dict[str, int] = {}

    for member in members_result.data or []:
        club_id = member.get("club_id")

        if not club_id:
            continue

        member_counts[club_id] = member_counts.get(club_id, 0) + 1

    role_by_club_id = {
        membership["club_id"]: membership.get("role", "member")
        for membership in memberships
        if membership.get("club_id")
    }

    clubs = []

    for club in clubs_result.data or []:
        clubs.append({
            **club,
            "my_role": role_by_club_id.get(club["id"], "member"),
            "members_count": member_counts.get(club["id"], 0),
        })

    clubs.sort(key=lambda item: item.get("created_at") or "", reverse=True)

    return {
        "count": len(clubs),
        "data": clubs,
    }


@router.get("/{club_id}/members")
def get_club_members(
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

    members_result = (
        supabase
        .table("club_members")
        .select("*")
        .eq("club_id", club_id)
        .execute()
    )

    members = members_result.data or []

    if not members:
        return {
            "count": 0,
            "data": [],
        }

    user_ids = [
        member["user_id"]
        for member in members
        if is_valid_uuid(member.get("user_id"))
    ]

    if not user_ids:
        return {
            "count": 0,
            "data": [],
        }

    profiles_result = (
        supabase
        .table("profiles")
        .select("id,display_name,total_points,avatar_id")
        .in_("id", user_ids)
        .execute()
    )

    profiles = profiles_result.data or []

    profiles_by_id = {
        profile["id"]: profile
        for profile in profiles
    }

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

    enriched_members = []

    for member in members:
        profile = profiles_by_id.get(member.get("user_id"))

        avatar = None

        if profile and is_valid_uuid(profile.get("avatar_id")):
            avatar = avatars_by_id.get(profile["avatar_id"])

        enriched_members.append({
            **member,
            "profile": {
                **profile,
                "avatar": avatar,
            } if profile else None,
        })

    enriched_members.sort(
        key=lambda item: (
            item["profile"].get("total_points") or 0
            if item.get("profile")
            else 0
        ),
        reverse=True,
    )

    return {
        "count": len(enriched_members),
        "data": enriched_members,
    }