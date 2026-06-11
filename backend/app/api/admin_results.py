from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from app.core.supabase import supabase
from app.services.scoring_service import recalculate_all_scores

router = APIRouter()

authorization_header = APIKeyHeader(
    name="Authorization",
    auto_error=False,
)

class SetGroupMatchOutcomeRequest(BaseModel):
    match_id: str
    actual_outcome: str


class SetMatchWinnerRequest(BaseModel):
    match_id: str
    actual_winner_team_id: str


class GroupStandingItem(BaseModel):
    team_id: str
    actual_position: int
    qualified_to_ro32: bool = False
    qualified_as_best_third: bool = False


class SaveGroupStandingsRequest(BaseModel):
    group_id: str
    standings: list[GroupStandingItem]


def is_valid_uuid(value: str | None) -> bool:
    if not value:
        return False

    try:
        UUID(str(value))
        return True
    except ValueError:
        return False


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


def get_admin_user_id_from_token(
    authorization: str | None = Depends(authorization_header),
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")

    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid auth token: {str(exc)}")

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


def normalize_round(value: Any) -> str | None:
    if not value:
        return None

    text = (
        str(value)
        .strip()
        .lower()
        .replace("_", " ")
        .replace("-", " ")
    )

    if "round of 32" in text or "last 32" in text or "ro32" in text or "round 32" in text:
        return "ROUND_OF_32"

    if "round of 16" in text or "last 16" in text or "ro16" in text or "round 16" in text:
        return "ROUND_OF_16"

    if "quarter" in text:
        return "QUARTER_FINAL"

    if "semi" in text:
        return "SEMI_FINAL"

    if text == "final" or " final" in text:
        return "FINAL"

    return None


def get_match_round(match: dict) -> str | None:
    for key in ["round_name", "stage", "round", "round_code", "match_type"]:
        normalized = normalize_round(match.get(key))

        if normalized:
            return normalized

    return None


def enrich_matches_with_teams(matches: list[dict]) -> list[dict]:
    team_ids = set()

    for match in matches:
        for key in ["team_a_id", "team_b_id", "actual_winner_team_id"]:
            team_id = match.get(key)

            if is_valid_uuid(team_id):
                team_ids.add(team_id)

    teams_by_id = {}

    if team_ids:
        teams_result = (
            supabase
            .table("teams")
            .select("*")
            .in_("id", list(team_ids))
            .execute()
        )

        teams_by_id = {
            team["id"]: team
            for team in teams_result.data or []
        }

    enriched = []

    for match in matches:
        enriched.append({
            **match,
            "match_round": get_match_round(match),
            "team_a": teams_by_id.get(match.get("team_a_id")),
            "team_b": teams_by_id.get(match.get("team_b_id")),
            "actual_winner_team": teams_by_id.get(match.get("actual_winner_team_id")),
        })

    return enriched


@router.get("/knockout-matches")
def get_knockout_matches(
    user_id: str = Depends(get_admin_user_id_from_token),
):
    result = (
        supabase
        .table("matches")
        .select("*")
        .order("match_date")
        .execute()
    )

    matches = result.data or []

    knockout_matches = []

    for match in matches:
        match_round = get_match_round(match)

        if not match_round:
            continue

        if not match.get("team_a_id") or not match.get("team_b_id"):
            continue

        knockout_matches.append(match)

    return {
        "count": len(knockout_matches),
        "data": enrich_matches_with_teams(knockout_matches),
    }


@router.post("/match-winner")
def set_match_winner(
    payload: SetMatchWinnerRequest,
    user_id: str = Depends(get_admin_user_id_from_token),
):
    if not is_valid_uuid(payload.match_id):
        raise HTTPException(status_code=400, detail="Invalid match id")

    if not is_valid_uuid(payload.actual_winner_team_id):
        raise HTTPException(status_code=400, detail="Invalid winner team id")

    match_result = (
        supabase
        .table("matches")
        .select("*")
        .eq("id", payload.match_id)
        .execute()
    )

    if not match_result.data:
        raise HTTPException(status_code=404, detail="Match not found")

    match = match_result.data[0]

    team_a_id = match.get("team_a_id")
    team_b_id = match.get("team_b_id")

    if payload.actual_winner_team_id not in [team_a_id, team_b_id]:
        raise HTTPException(
            status_code=400,
            detail="Winner must be one of the two teams in this match",
        )

    update_result = (
        supabase
        .table("matches")
        .update({
            "actual_winner_team_id": payload.actual_winner_team_id,
            "is_manual_override": True,
            "status": "FINISHED",
        })
        .eq("id", payload.match_id)
        .execute()
    )

    scoring_result = recalculate_all_scores()

    return {
        "message": "Match winner saved and scores recalculated successfully",
        "match": update_result.data[0] if update_result.data else None,
        "scoring": scoring_result,
    }


@router.get("/groups")
def get_groups_with_actual_standings(
    user_id: str = Depends(get_admin_user_id_from_token),
):
    groups_result = (
        supabase
        .table("groups")
        .select("*")
        .execute()
    )

    group_teams_result = (
        supabase
        .table("group_teams")
        .select("*")
        .execute()
    )

    teams_result = (
        supabase
        .table("teams")
        .select("*")
        .execute()
    )

    standings_result = (
        supabase
        .table("group_actual_standings")
        .select("*")
        .execute()
    )

    groups = groups_result.data or []
    group_teams = group_teams_result.data or []
    teams = teams_result.data or []
    standings = standings_result.data or []

    teams_by_id = {
        team["id"]: team
        for team in teams
    }

    standings_by_group_team = {
        f"{standing['group_id']}:{standing['team_id']}": standing
        for standing in standings
    }

    group_teams_by_group_id: dict[str, list[dict]] = {}

    for group_team in group_teams:
        group_id = group_team.get("group_id")
        team_id = group_team.get("team_id")

        if not group_id or not team_id:
            continue

        if group_id not in group_teams_by_group_id:
            group_teams_by_group_id[group_id] = []

        group_teams_by_group_id[group_id].append({
            **group_team,
            "team": teams_by_id.get(team_id),
            "actual_standing": standings_by_group_team.get(f"{group_id}:{team_id}"),
        })

    data = []

    for index, group in enumerate(groups):
        group_id = group.get("id")

        group_name = (
            group.get("name")
            or group.get("group_name")
            or group.get("group_code")
            or group.get("code")
            or group.get("letter")
            or f"Group {index + 1}"
        )

        teams_in_group = group_teams_by_group_id.get(group_id, [])

        teams_in_group.sort(
            key=lambda row: (
                row.get("position") or row.get("sort_order") or 999,
                row.get("team", {}).get("name", "") if row.get("team") else "",
            )
        )

        data.append({
            **group,
            "name": group_name,
            "teams": teams_in_group,
        })

    data.sort(key=lambda group: group.get("name", ""))

    return {
        "count": len(data),
        "data": data,
    }

@router.post("/group-standings")
def save_group_standings(
    payload: SaveGroupStandingsRequest,
    user_id: str = Depends(get_admin_user_id_from_token),
):
    if not is_valid_uuid(payload.group_id):
        raise HTTPException(status_code=400, detail="Invalid group id")

    if len(payload.standings) != 4:
        raise HTTPException(
            status_code=400,
            detail="Group standings must contain exactly 4 teams",
        )

    positions = [item.actual_position for item in payload.standings]
    team_ids = [item.team_id for item in payload.standings]

    if sorted(positions) != [1, 2, 3, 4]:
        raise HTTPException(
            status_code=400,
            detail="Positions must be exactly 1, 2, 3, and 4",
        )

    if len(set(team_ids)) != 4:
        raise HTTPException(
            status_code=400,
            detail="Teams must be unique",
        )

    for team_id in team_ids:
        if not is_valid_uuid(team_id):
            raise HTTPException(status_code=400, detail="Invalid team id")

    group_result = (
        supabase
        .table("groups")
        .select("id")
        .eq("id", payload.group_id)
        .execute()
    )

    if not group_result.data:
        raise HTTPException(status_code=404, detail="Group not found")

    group_teams_result = (
        supabase
        .table("group_teams")
        .select("team_id")
        .eq("group_id", payload.group_id)
        .execute()
    )

    valid_group_team_ids = {
        row["team_id"]
        for row in group_teams_result.data or []
    }

    for team_id in team_ids:
        if team_id not in valid_group_team_ids:
            raise HTTPException(
                status_code=400,
                detail="All teams must belong to this group",
            )

    rows = [
        {
            "group_id": payload.group_id,
            "team_id": item.team_id,
            "actual_position": item.actual_position,
            "qualified_to_ro32": item.qualified_to_ro32,
            "qualified_as_best_third": item.qualified_as_best_third,
        }
        for item in payload.standings
    ]

    (
        supabase
        .table("group_actual_standings")
        .delete()
        .eq("group_id", payload.group_id)
        .execute()
    )

    insert_result = (
        supabase
        .table("group_actual_standings")
        .insert(rows)
        .execute()
    )

    scoring_result = recalculate_all_scores()

    return {
        "message": "Group standings saved and scores recalculated successfully",
        "count": len(insert_result.data or []),
        "data": insert_result.data or rows,
        "scoring": scoring_result,
    }
    
@router.get("/group-matches")
def get_group_matches(
    user_id: str = Depends(get_admin_user_id_from_token),
):
    matches_result = (
        supabase
        .table("matches")
        .select("*")
        .order("match_date")
        .execute()
    )

    matches = matches_result.data or []

    group_matches = [
        match
        for match in matches
        if is_group_match(match)
        and match.get("team_a_id")
        and match.get("team_b_id")
    ]

    team_ids = set()
    group_ids = set()

    for match in group_matches:
        if is_valid_uuid(match.get("team_a_id")):
            team_ids.add(match["team_a_id"])

        if is_valid_uuid(match.get("team_b_id")):
            team_ids.add(match["team_b_id"])

        if is_valid_uuid(match.get("group_id")):
            group_ids.add(match["group_id"])

    teams_by_id = {}
    groups_by_id = {}

    if team_ids:
        teams_result = (
            supabase
            .table("teams")
            .select("*")
            .in_("id", list(team_ids))
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
            .in_("id", list(group_ids))
            .execute()
        )

        groups_by_id = {
            group["id"]: group
            for group in groups_result.data or []
        }

    data = []

    for match in group_matches:
        data.append({
            **match,
            "team_a": teams_by_id.get(match.get("team_a_id")),
            "team_b": teams_by_id.get(match.get("team_b_id")),
            "group": groups_by_id.get(match.get("group_id")),
        })

    return {
        "count": len(data),
        "data": data,
    }
    
    
@router.post("/group-match-outcome")
def set_group_match_outcome(
    payload: SetGroupMatchOutcomeRequest,
    user_id: str = Depends(get_admin_user_id_from_token),
):
    allowed_outcomes = {"TEAM_A_WIN", "DRAW", "TEAM_B_WIN"}

    if not is_valid_uuid(payload.match_id):
        raise HTTPException(status_code=400, detail="Invalid match id")

    if payload.actual_outcome not in allowed_outcomes:
        raise HTTPException(status_code=400, detail="Invalid actual outcome")

    match_result = (
        supabase
        .table("matches")
        .select("*")
        .eq("id", payload.match_id)
        .execute()
    )

    if not match_result.data:
        raise HTTPException(status_code=404, detail="Match not found")

    match = match_result.data[0]

    if not is_group_match(match):
        raise HTTPException(
            status_code=400,
            detail="This match is not a group-stage match",
        )

    update_result = (
        supabase
        .table("matches")
        .update({
            "actual_outcome": payload.actual_outcome,
            "is_manual_override": True,
            "status": "FINISHED",
        })
        .eq("id", payload.match_id)
        .execute()
    )

    scoring_result = recalculate_all_scores()

    return {
        "message": "Group match outcome saved and scores recalculated successfully",
        "match": update_result.data[0] if update_result.data else None,
        "scoring": scoring_result,
    }
