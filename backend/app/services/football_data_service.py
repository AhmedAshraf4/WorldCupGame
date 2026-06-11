import os
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from dotenv import load_dotenv

from app.core.supabase import supabase

load_dotenv()

logger = logging.getLogger("uvicorn.error")

FOOTBALL_DATA_API_KEY = os.getenv("FOOTBALL_DATA_API_KEY")
FOOTBALL_DATA_BASE_URL = os.getenv(
    "FOOTBALL_DATA_BASE_URL",
    "https://api.football-data.org/v4",
)
FOOTBALL_DATA_COMPETITION_CODE = os.getenv("FOOTBALL_DATA_COMPETITION_CODE", "WC")
FOOTBALL_DATA_SEASON = os.getenv("FOOTBALL_DATA_SEASON", "2026")

API_PROVIDER = "football-data.org"


TEAM_NAME_ALIASES = {
    "USA": "United States",
    "United States of America": "United States",

    "Czech Republic": "Czechia",

    "Bosnia & Herzegovina": "Bosnia and Herzegovina",
    "Bosnia-Herzegovina": "Bosnia and Herzegovina",

    "Côte d’Ivoire": "Côte d'Ivoire",
    "Cote d'Ivoire": "Côte d'Ivoire",
    "Ivory Coast": "Côte d'Ivoire",

    "Curacao": "Curaçao",

    "Korea Republic": "South Korea",

    "IR Iran": "Iran",

    "DR Congo": "DR Congo",
    "Congo DR": "DR Congo",

    "Cape Verde Islands": "Cape Verde",
}


def normalize_team_name(name: str | None) -> str | None:
    if not name:
        return None

    clean_name = name.strip()
    return TEAM_NAME_ALIASES.get(clean_name, clean_name)


def get_team_id_by_name(team_name: str | None) -> str | None:
    normalized_name = normalize_team_name(team_name)

    if not normalized_name:
        return None

    result = (
        supabase
        .table("teams")
        .select("id,name")
        .eq("name", normalized_name)
        .execute()
    )

    if result.data:
        return result.data[0]["id"]

    return None


def get_outcome_from_api_match(match: dict[str, Any]) -> str | None:
    """
    We store outcome only:
    TEAM_A_WIN / DRAW / TEAM_B_WIN

    football-data.org calls them homeTeam and awayTeam.
    In our app:
    homeTeam -> team_a
    awayTeam -> team_b
    """
    status = match.get("status")

    if status != "FINISHED":
        return None

    score = match.get("score") or {}
    full_time = score.get("fullTime") or {}

    team_a_goals = full_time.get("home")
    team_b_goals = full_time.get("away")

    if team_a_goals is None or team_b_goals is None:
        return None

    if team_a_goals > team_b_goals:
        return "TEAM_A_WIN"

    if team_a_goals < team_b_goals:
        return "TEAM_B_WIN"

    return "DRAW"


def get_winner_team_id_from_api_match(
    match: dict[str, Any],
    team_a_id: str | None,
    team_b_id: str | None,
) -> str | None:
    status = match.get("status")

    if status != "FINISHED":
        return None

    score = match.get("score") or {}
    winner = score.get("winner") or match.get("winner")

    if winner in {"HOME_TEAM", "TEAM_A"}:
        return team_a_id

    if winner in {"AWAY_TEAM", "TEAM_B"}:
        return team_b_id

    return None


def map_api_stage_to_app_stage(api_stage: str | None) -> str:
    if not api_stage:
        return "UNKNOWN"

    if api_stage == "GROUP_STAGE":
        return "GROUP"

    if api_stage in {"LAST_32", "ROUND_OF_32"}:
        return "RO32"

    if api_stage == "ROUND_OF_16":
        return "R16"

    if api_stage == "QUARTER_FINALS":
        return "QF"

    if api_stage == "SEMI_FINALS":
        return "SF"

    if api_stage == "FINAL":
        return "FINAL"

    return api_stage


def extract_group_code(api_group: Any) -> str | None:
    """
    Handles values like:
    Group A
    GROUP_A
    A
    """
    if not api_group:
        return None

    group_text = str(api_group).strip()

    if group_text.startswith("Group "):
        return group_text.replace("Group ", "").strip()

    if group_text.startswith("GROUP_"):
        return group_text.replace("GROUP_", "").strip()

    if len(group_text) == 1:
        return group_text

    return None


def get_group_id_by_code(group_code: str | None) -> str | None:
    if not group_code:
        return None

    result = (
        supabase
        .table("groups")
        .select("id,code")
        .eq("code", group_code)
        .execute()
    )

    if result.data:
        return result.data[0]["id"]

    return None


async def fetch_world_cup_matches_from_api() -> list[dict[str, Any]]:
    if not FOOTBALL_DATA_API_KEY:
        raise RuntimeError("FOOTBALL_DATA_API_KEY is missing from backend/.env")

    url = (
        f"{FOOTBALL_DATA_BASE_URL}"
        f"/competitions/{FOOTBALL_DATA_COMPETITION_CODE}/matches"
    )

    headers = {
        "X-Auth-Token": FOOTBALL_DATA_API_KEY,
    }

    params = {
        "season": FOOTBALL_DATA_SEASON,
    }

    logger.warning(
        "Requesting football-data.org matches: url=%s params=%s",
        url,
        params,
    )

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, headers=headers, params=params)

    logger.warning(
        "football-data.org response received: status=%s",
        response.status_code,
    )

    if response.status_code >= 400:
        logger.warning(
            "football-data.org error response body: %s",
            response.text[:1000],
        )
        raise RuntimeError(
            f"football-data.org error {response.status_code}: {response.text}"
        )

    data = response.json()
    matches = data.get("matches", [])

    logger.warning(
        "football-data.org response parsed: matches=%s competition=%s season=%s",
        len(matches),
        FOOTBALL_DATA_COMPETITION_CODE,
        FOOTBALL_DATA_SEASON,
    )

    return matches


async def sync_world_cup_matches() -> dict[str, Any]:
    api_matches = await fetch_world_cup_matches_from_api()

    synced = 0
    skipped_missing_team = 0
    skipped_manual_override = 0
    skipped_missing_api_id = 0

    missing_teams: list[dict[str, str | None]] = []

    for api_match in api_matches:
        raw_api_match_id = api_match.get("id")

        if raw_api_match_id is None:
            skipped_missing_api_id += 1
            continue

        api_match_id = str(raw_api_match_id)

        api_team_a = api_match.get("homeTeam") or {}
        api_team_b = api_match.get("awayTeam") or {}

        api_team_a_name = api_team_a.get("name")
        api_team_b_name = api_team_b.get("name")

        team_a_id = get_team_id_by_name(api_team_a_name)
        team_b_id = get_team_id_by_name(api_team_b_name)

        if not team_a_id or not team_b_id:
            skipped_missing_team += 1
            missing_teams.append({
                "api_match_id": api_match_id,
                "team_a_api_name": api_team_a_name,
                "team_b_api_name": api_team_b_name,
                "team_a_normalized": normalize_team_name(api_team_a_name),
                "team_b_normalized": normalize_team_name(api_team_b_name),
            })
            continue

        existing_result = (
            supabase
            .table("matches")
            .select("*")
            .eq("api_provider", API_PROVIDER)
            .eq("api_match_id", api_match_id)
            .execute()
        )

        existing_match = existing_result.data[0] if existing_result.data else None

        if existing_match and existing_match.get("is_manual_override"):
            skipped_manual_override += 1
            continue

        api_stage = api_match.get("stage")
        app_stage = map_api_stage_to_app_stage(api_stage)
        actual_outcome = get_outcome_from_api_match(api_match)
        actual_winner_team_id = get_winner_team_id_from_api_match(
            api_match,
            team_a_id,
            team_b_id,
        )

        group_code = extract_group_code(api_match.get("group"))
        group_id = get_group_id_by_code(group_code) if app_stage == "GROUP" else None

        row = {
            "stage": app_stage,
            "group_id": group_id,
            "team_a_id": team_a_id,
            "team_b_id": team_b_id,
            "api_provider": API_PROVIDER,
            "api_match_id": api_match_id,
            "api_raw_data": api_match,
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "match_date": api_match.get("utcDate"),
            "status": api_match.get("status") or "SCHEDULED",
            "round_name": api_stage,
            "venue": api_match.get("venue"),
            "actual_outcome": actual_outcome if app_stage == "GROUP" else None,
            "actual_winner_team_id": (
                actual_winner_team_id if app_stage != "GROUP" else None
            ),
        }

        if existing_match:
            (
                supabase
                .table("matches")
                .update(row)
                .eq("id", existing_match["id"])
                .execute()
            )
        else:
            supabase.table("matches").insert(row).execute()

        synced += 1

    return {
        "provider": API_PROVIDER,
        "api_matches_found": len(api_matches),
        "synced": synced,
        "skipped_missing_team": skipped_missing_team,
        "skipped_manual_override": skipped_manual_override,
        "skipped_missing_api_id": skipped_missing_api_id,
        "missing_teams": missing_teams,
    }
