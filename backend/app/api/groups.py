from fastapi import APIRouter
from app.core.supabase import supabase

router = APIRouter()


@router.get("")
@router.get("/")
def get_groups():
    result = (
        supabase
        .table("groups")
        .select("*")
        .order("code")
        .execute()
    )

    return {
        "count": len(result.data),
        "data": result.data,
    }


@router.get("/with-teams")
def get_groups_with_teams():
    groups_result = (
        supabase
        .table("groups")
        .select("*")
        .order("code")
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

    teams_by_id = {team["id"]: team for team in teams_result.data}

    teams_by_group_id = {}

    for link in group_teams_result.data:
        group_id = link["group_id"]
        team_id = link["team_id"]

        if group_id not in teams_by_group_id:
            teams_by_group_id[group_id] = []

        team = teams_by_id.get(team_id)

        if team:
            teams_by_group_id[group_id].append(team)

    groups = []

    for group in groups_result.data:
        group_teams = teams_by_group_id.get(group["id"], [])

        group_teams.sort(
            key=lambda team: team["fifa_rank"] if team["fifa_rank"] is not None else 999
        )

        groups.append({
            **group,
            "teams": group_teams,
        })

    return {
        "count": len(groups),
        "data": groups,
    }