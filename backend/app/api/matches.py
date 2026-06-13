from fastapi import APIRouter
from app.core.supabase import supabase

router = APIRouter()


@router.get("/group-stage")
def get_group_stage_matches():
    matches_result = (
        supabase
        .table("matches")
        .select("*")
        .eq("stage", "GROUP")
        .execute()
    )

    teams_result = supabase.table("teams").select("*").execute()
    groups_result = supabase.table("groups").select("*").execute()

    teams_by_id = {team["id"]: team for team in teams_result.data}
    groups_by_id = {group["id"]: group for group in groups_result.data}

    matches = []

    for match in matches_result.data:
        team_a = teams_by_id.get(match.get("team_a_id"))
        team_b = teams_by_id.get(match.get("team_b_id"))
        group = groups_by_id.get(match.get("group_id"))

        if match.get("status") == "DUPLICATE":
            continue

        if not team_a or not team_b:
            continue

        matches.append({
            **match,
            "team_a": team_a,
            "team_b": team_b,
            "group": group,
        })

    matches.sort(
        key=lambda item: (
            item.get("match_date") or "",
            item["group"]["code"] if item.get("group") else "",
            item["team_a"]["name"] if item.get("team_a") else "",
            item["team_b"]["name"] if item.get("team_b") else "",
        )
    )

    return {
        "count": len(matches),
        "data": matches,
    }
