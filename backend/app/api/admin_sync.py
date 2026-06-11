from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import APIKeyHeader

from app.core.supabase import supabase
from app.services.football_data_service import (
    fetch_world_cup_matches_from_api,
    normalize_team_name,
)
from app.services.auto_sync_service import sync_matches_and_scores
from app.services.scoring_service import recalculate_all_scores

router = APIRouter()

authorization_header = APIKeyHeader(
    name="Authorization",
    auto_error=False,
)


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


@router.post("/football-data")
async def sync_football_data(
    user_id: str = Depends(get_admin_user_id_from_token),
):
    try:
        result = await sync_matches_and_scores()

        return {
            "message": "Football data synced and scores recalculated successfully",
            **result,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Football data sync failed: {str(exc)}",
        )


@router.post("/recalculate-scores")
async def recalculate_scores_after_manual_update(
    user_id: str = Depends(get_admin_user_id_from_token),
):
    try:
        scoring_result = recalculate_all_scores()

        return {
            "message": "Scores recalculated successfully",
            "scoring": scoring_result,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Score recalculation failed: {str(exc)}",
        )


@router.get("/football-data-team-names")
async def get_football_data_team_names(
    user_id: str = Depends(get_admin_user_id_from_token),
):
    try:
        api_matches = await fetch_world_cup_matches_from_api()

        api_names = set()
        null_team_matches = 0

        for match in api_matches:
            home_team = match.get("homeTeam") or {}
            away_team = match.get("awayTeam") or {}

            home_name = home_team.get("name")
            away_name = away_team.get("name")

            if not home_name or not away_name:
                null_team_matches += 1

            if home_name:
                api_names.add(home_name)

            if away_name:
                api_names.add(away_name)

        teams_result = (
            supabase
            .table("teams")
            .select("id,name")
            .execute()
        )

        db_teams = teams_result.data or []
        db_names = {team["name"] for team in db_teams}

        comparison = []

        for api_name in sorted(api_names):
            normalized_name = normalize_team_name(api_name)

            comparison.append({
                "api_name": api_name,
                "normalized_name": normalized_name,
                "exists_in_database": normalized_name in db_names,
            })

        missing = [
            item for item in comparison
            if not item["exists_in_database"]
        ]

        matched = [
            item for item in comparison
            if item["exists_in_database"]
        ]

        return {
            "api_unique_team_names_count": len(api_names),
            "database_team_names_count": len(db_names),
            "matched_count": len(matched),
            "missing_count": len(missing),
            "null_team_matches": null_team_matches,
            "missing": missing,
            "matched": matched,
            "all_api_names": comparison,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get football-data team names: {str(exc)}",
        )
