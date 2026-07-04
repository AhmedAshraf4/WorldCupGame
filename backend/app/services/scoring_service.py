from collections import defaultdict
import logging
from typing import Any

from app.core.supabase import supabase

logger = logging.getLogger("uvicorn.error")

PAGE_SIZE = 1000

GROUP_EXACT_POINTS = 5
GROUP_DIRECT_QUALIFIED_WRONG_POSITION_POINTS = 2
GROUP_BEST_THIRD_POINTS = 1
GROUP_WILDCARD_MULTIPLIER = 3
WILDCARD_BONUS_MULTIPLIER = GROUP_WILDCARD_MULTIPLIER - 1
GROUP_MATCH_POINTS = 1
MEANINGFUL_UNDERDOG_RANK_GAP = 3
MEANINGFUL_UNDERDOG_POINTS_GAP = 10

CHAMPION_POINTS = 50

ROUND_POINTS = {
    "ROUND_OF_32": 5,
    "ROUND_OF_16": 10,
    "QUARTER_FINAL": 15,
    "SEMI_FINAL": 20,
    "FINAL": 30,
}

SCORE_SOURCE_TYPES = [
    "GROUP_MATCH_PREDICTION",
    "GROUP_STANDING",
    "GROUP_WILDCARD",
    "KNOCKOUT_PREDICTION",
    "KNOCKOUT_WILDCARD",
    "CHAMPION_PICK",
]


def to_int_or_none(value: Any) -> int | None:
    if value is None or value == "":
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def to_float_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def normalize_outcome(value: Any) -> str | None:
    if not value:
        return None

    return str(value).strip().upper()


def get_underdog_team_id(
    match: dict[str, Any],
    teams_by_id: dict[str, dict[str, Any]],
) -> str | None:
    team_a_id = match.get("team_a_id")
    team_b_id = match.get("team_b_id")

    if not team_a_id or not team_b_id:
        return None

    team_a = teams_by_id.get(team_a_id)
    team_b = teams_by_id.get(team_b_id)

    if not team_a or not team_b:
        return None

    team_a_rank = to_int_or_none(team_a.get("fifa_rank"))
    team_b_rank = to_int_or_none(team_b.get("fifa_rank"))

    if team_a_rank is not None and team_b_rank is not None:
        if abs(team_a_rank - team_b_rank) > MEANINGFUL_UNDERDOG_RANK_GAP:
            return team_a_id if team_a_rank > team_b_rank else team_b_id

        return None

    team_a_points = to_float_or_none(team_a.get("fifa_points"))
    team_b_points = to_float_or_none(team_b.get("fifa_points"))

    if team_a_points is not None and team_b_points is not None:
        if abs(team_a_points - team_b_points) >= MEANINGFUL_UNDERDOG_POINTS_GAP:
            return team_a_id if team_a_points < team_b_points else team_b_id

    return None


def get_group_predicted_team_id(
    predicted_outcome: str,
    match: dict[str, Any],
) -> str | None:
    if predicted_outcome == "TEAM_A_WIN":
        return match.get("team_a_id")

    if predicted_outcome == "TEAM_B_WIN":
        return match.get("team_b_id")

    return None


def get_group_actual_winner_team_id(
    actual_outcome: str,
    match: dict[str, Any],
) -> str | None:
    if actual_outcome == "TEAM_A_WIN":
        return match.get("team_a_id")

    if actual_outcome == "TEAM_B_WIN":
        return match.get("team_b_id")

    return None



def build_group_match_prediction_score_events(
    events: list[dict[str, Any]],
    group_match_predictions: list[dict[str, Any]],
    matches_by_id: dict[str, dict[str, Any]],
    teams_by_id: dict[str, dict[str, Any]],
):
    for prediction in group_match_predictions:
        user_id = prediction.get("user_id")
        match_id = prediction.get("match_id")
        predicted_outcome = normalize_outcome(prediction.get("predicted_outcome"))

        if not user_id or not match_id or not predicted_outcome:
            continue

        match = matches_by_id.get(match_id)

        if not match:
            continue

        actual_outcome = normalize_outcome(match.get("actual_outcome"))

        if not actual_outcome:
            continue

        if predicted_outcome == "DRAW":
            points = GROUP_MATCH_POINTS if actual_outcome == "DRAW" else 0
            description = (
                "Group match prediction correct."
                if points > 0
                else "Group match prediction wrong."
            )
        else:
            predicted_team_id = get_group_predicted_team_id(
                predicted_outcome,
                match,
            )
            actual_winner_team_id = get_group_actual_winner_team_id(
                actual_outcome,
                match,
            )
            underdog_team_id = get_underdog_team_id(match, teams_by_id)

            if predicted_team_id and predicted_team_id == underdog_team_id:
                underdog_won = (
                    actual_winner_team_id is not None
                    and actual_winner_team_id == underdog_team_id
                )

                if underdog_won:
                    points = GROUP_MATCH_POINTS * 2
                    description = (
                        f"Group match underdog prediction correct. "
                        f"Base {GROUP_MATCH_POINTS} x2."
                    )
                elif actual_outcome == "DRAW":
                    points = GROUP_MATCH_POINTS * -1
                    description = (
                        f"Group match underdog prediction drew. "
                        f"Lost {GROUP_MATCH_POINTS}."
                    )
                else:
                    points = GROUP_MATCH_POINTS * -2
                    description = (
                        f"Group match underdog prediction wrong. "
                        f"Lost {GROUP_MATCH_POINTS} x2."
                    )
            else:
                points = (
                    GROUP_MATCH_POINTS
                    if predicted_outcome == actual_outcome
                    else 0
                )
                description = (
                    "Group match prediction correct."
                    if points > 0
                    else "Group match prediction wrong."
                )

        add_score_event(
            events=events,
            user_id=user_id,
            source_type="GROUP_MATCH_PREDICTION",
            source_key=match_id,
            points=points,
            description=description,
        )

def fetch_all(table_name: str) -> list[dict[str, Any]]:
    logger.warning("Scoring fetch started: table=%s", table_name)

    rows: list[dict[str, Any]] = []
    start = 0

    while True:
        result = (
            supabase
            .table(table_name)
            .select("*")
            .range(start, start + PAGE_SIZE - 1)
            .execute()
        )

        batch = result.data or []
        rows.extend(batch)

        if len(batch) < PAGE_SIZE:
            break

        start += PAGE_SIZE

    logger.warning(
        "Scoring fetch completed: table=%s rows=%s",
        table_name,
        len(rows),
    )

    return rows


def chunk_list(items: list[dict[str, Any]], size: int = 500):
    for index in range(0, len(items), size):
        yield items[index:index + size]


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


def get_match_round(match: dict[str, Any] | None) -> str | None:
    if not match:
        return None

    for key in ["round_name", "stage", "round", "round_code", "match_type"]:
        normalized = normalize_round(match.get(key))

        if normalized:
            return normalized

    return None


def get_profile_user_id(profile: dict[str, Any]) -> str | None:
    return profile.get("user_id") or profile.get("id")


def calculate_group_prediction_points(
    predicted_position: int,
    actual_standing: dict[str, Any],
) -> int:
    actual_position = int(actual_standing.get("actual_position") or 0)
    qualified_to_ro32 = bool(actual_standing.get("qualified_to_ro32"))
    qualified_as_best_third = bool(actual_standing.get("qualified_as_best_third"))

    if predicted_position == actual_position:
        return GROUP_EXACT_POINTS

    if predicted_position in [1, 2] and actual_position in [1, 2]:
        return GROUP_DIRECT_QUALIFIED_WRONG_POSITION_POINTS

    if (
        predicted_position in [1, 2]
        and actual_position == 3
        and qualified_to_ro32
        and qualified_as_best_third
    ):
        return GROUP_BEST_THIRD_POINTS

    return 0


def add_score_event(
    events: list[dict[str, Any]],
    user_id: str | None,
    source_type: str,
    source_key: str,
    points: int,
    description: str,
):
    if not user_id:
        return

    events.append({
        "user_id": user_id,
        "source_type": source_type,
        "source_key": source_key,
        "points": points,
        "description": description,
    })


def build_group_standing_score_events(
    events: list[dict[str, Any]],
    group_predictions: list[dict[str, Any]],
    actual_standings_by_group_team: dict[tuple[str, str], dict[str, Any]],
):
    for prediction in group_predictions:
        user_id = prediction.get("user_id")
        group_id = prediction.get("group_id")
        team_id = prediction.get("team_id")
        predicted_position = int(prediction.get("predicted_position") or 0)

        if not user_id or not group_id or not team_id or not predicted_position:
            continue

        actual_standing = actual_standings_by_group_team.get((group_id, team_id))

        if not actual_standing:
            continue

        points = calculate_group_prediction_points(
            predicted_position,
            actual_standing,
        )

        actual_position = actual_standing.get("actual_position")

        add_score_event(
            events=events,
            user_id=user_id,
            source_type="GROUP_STANDING",
            source_key=f"{group_id}:{team_id}",
            points=points,
            description=(
                f"Group standing prediction: predicted position "
                f"{predicted_position}, actual position {actual_position}."
            ),
        )


def build_group_wildcard_score_events(
    events: list[dict[str, Any]],
    group_wildcards: list[dict[str, Any]],
    group_predictions: list[dict[str, Any]],
    actual_standings_by_group_team: dict[tuple[str, str], dict[str, Any]],
):
    prediction_lookup: dict[tuple[str, str, int], dict[str, Any]] = {}

    for prediction in group_predictions:
        user_id = prediction.get("user_id")
        team_id = prediction.get("team_id")
        predicted_position = int(prediction.get("predicted_position") or 0)

        if user_id and team_id and predicted_position:
            prediction_lookup[(user_id, team_id, predicted_position)] = prediction

    for wildcard in group_wildcards:
        user_id = wildcard.get("user_id")
        team_id = wildcard.get("team_id")
        predicted_position = int(wildcard.get("predicted_position") or 0)

        if not user_id or not team_id or not predicted_position:
            continue

        related_prediction = prediction_lookup.get(
            (user_id, team_id, predicted_position)
        )

        group_id = wildcard.get("group_id") or (
            related_prediction.get("group_id") if related_prediction else None
        )

        if not group_id:
            continue

        actual_standing = actual_standings_by_group_team.get((group_id, team_id))

        if not actual_standing:
            continue

        base_points = calculate_group_prediction_points(
            predicted_position,
            actual_standing,
        )

        if base_points > 0:
            points = base_points * WILDCARD_BONUS_MULTIPLIER
            description = (
                "Group wildcard correct/partially correct. "
                f"Bonus {base_points} x{WILDCARD_BONUS_MULTIPLIER}."
            )
        else:
            points = -GROUP_EXACT_POINTS * GROUP_WILDCARD_MULTIPLIER
            description = "Group wildcard wrong. Lost x3."

        add_score_event(
            events=events,
            user_id=user_id,
            source_type="GROUP_WILDCARD",
            source_key=f"{group_id}:{team_id}:{predicted_position}",
            points=points,
            description=description,
        )


def build_knockout_prediction_score_events(
    events: list[dict[str, Any]],
    knockout_predictions: list[dict[str, Any]],
    matches_by_id: dict[str, dict[str, Any]],
    teams_by_id: dict[str, dict[str, Any]],
):
    for prediction in knockout_predictions:
        user_id = prediction.get("user_id")
        match_id = prediction.get("match_id")
        predicted_winner_team_id = prediction.get("predicted_winner_team_id")

        if not user_id or not match_id or not predicted_winner_team_id:
            continue

        match = matches_by_id.get(match_id)

        if not match:
            continue

        actual_winner_team_id = match.get("actual_winner_team_id")

        if not actual_winner_team_id:
            continue

        match_round = get_match_round(match)

        if not match_round:
            continue

        round_points = ROUND_POINTS.get(match_round, 0)

        underdog_team_id = get_underdog_team_id(match, teams_by_id)

        if predicted_winner_team_id == underdog_team_id:
            if actual_winner_team_id == underdog_team_id:
                points = round_points * 2
                description = (
                    f"Knockout underdog prediction correct for {match_round}. "
                    f"Base {round_points} x2."
                )
            else:
                points = round_points * -2
                description = (
                    f"Knockout underdog prediction wrong for {match_round}. "
                    f"Lost {round_points} x2."
                )
        else:
            points = (
                round_points
                if predicted_winner_team_id == actual_winner_team_id
                else 0
            )
            description = (
                f"Knockout prediction correct for {match_round}."
                if points > 0
                else f"Knockout prediction wrong for {match_round}."
            )

        add_score_event(
            events=events,
            user_id=user_id,
            source_type="KNOCKOUT_PREDICTION",
            source_key=match_id,
            points=points,
            description=description,
        )


def build_knockout_wildcard_score_events(
    events: list[dict[str, Any]],
    knockout_wildcards: list[dict[str, Any]],
    knockout_predictions: list[dict[str, Any]],
    matches_by_id: dict[str, dict[str, Any]],
):
    prediction_lookup: dict[tuple[str, str, str], dict[str, Any]] = {}

    for prediction in knockout_predictions:
        user_id = prediction.get("user_id")
        team_id = prediction.get("predicted_winner_team_id")
        match = matches_by_id.get(prediction.get("match_id"))
        match_round = get_match_round(match)

        if user_id and team_id and match_round:
            prediction_lookup[(user_id, match_round, team_id)] = prediction

    for wildcard in knockout_wildcards:
        user_id = wildcard.get("user_id")
        wildcard_round = normalize_round(wildcard.get("wildcard_round"))
        team_id = wildcard.get("team_id")

        if not user_id or not wildcard_round or not team_id:
            continue

        related_prediction = prediction_lookup.get(
            (user_id, wildcard_round, team_id)
        )

        if not related_prediction:
            continue

        match = matches_by_id.get(related_prediction.get("match_id"))

        if not match:
            continue

        actual_winner_team_id = match.get("actual_winner_team_id")

        if not actual_winner_team_id:
            continue

        round_points = ROUND_POINTS.get(wildcard_round, 0)
        wildcard_bonus_points = round_points * WILDCARD_BONUS_MULTIPLIER
        wildcard_penalty_points = round_points * GROUP_WILDCARD_MULTIPLIER

        if actual_winner_team_id == team_id:
            points = wildcard_bonus_points
            description = (
                f"Knockout wildcard correct for {wildcard_round}. "
                f"Bonus {round_points} x{WILDCARD_BONUS_MULTIPLIER}."
            )
        else:
            points = -wildcard_penalty_points
            description = f"Knockout wildcard wrong for {wildcard_round}. Lost {round_points} x3."

        add_score_event(
            events=events,
            user_id=user_id,
            source_type="KNOCKOUT_WILDCARD",
            source_key=wildcard_round,
            points=points,
            description=description,
        )


def get_actual_champion_team_id(matches: list[dict[str, Any]]) -> str | None:
    for match in matches:
        match_round = get_match_round(match)

        if match_round == "FINAL" and match.get("actual_winner_team_id"):
            return match["actual_winner_team_id"]

    return None


def build_champion_score_events(
    events: list[dict[str, Any]],
    champion_predictions: list[dict[str, Any]],
    actual_champion_team_id: str | None,
):
    if not actual_champion_team_id:
        return

    for prediction in champion_predictions:
        user_id = prediction.get("user_id")
        champion_team_id = prediction.get("team_id")

        if not user_id or not champion_team_id:
            continue

        points = (
            CHAMPION_POINTS
            if champion_team_id == actual_champion_team_id
            else 0
        )

        add_score_event(
            events=events,
            user_id=user_id,
            source_type="CHAMPION_PICK",
            source_key="WORLD_CUP_2026_CHAMPION",
            points=points,
            description=(
                "Champion pick correct."
                if points > 0
                else "Champion pick incorrect."
            ),
        )
        

def replace_score_events(events: list[dict[str, Any]]):
    logger.warning("Scoring replace events started: events=%s", len(events))

    (
        supabase
        .table("user_score_events")
        .delete()
        .in_("source_type", SCORE_SOURCE_TYPES)
        .execute()
    )

    for batch in chunk_list(events):
        (
            supabase
            .table("user_score_events")
            .insert(batch)
            .execute()
        )

    logger.warning("Scoring replace events completed: events=%s", len(events))


def update_profile_totals(
    events: list[dict[str, Any]],
    profiles: list[dict[str, Any]],
) -> int:
    logger.warning("Scoring profile total update started: profiles=%s", len(profiles))

    totals = defaultdict(int)

    for event in events:
        totals[event["user_id"]] += int(event.get("points") or 0)

    updated_count = 0

    for profile in profiles:
        profile_id = profile.get("id")
        user_id = get_profile_user_id(profile)

        if not user_id:
            continue

        total_points = totals[user_id]

        query = (
            supabase
            .table("profiles")
            .update({"total_points": total_points})
        )

        if profile_id:
            query.eq("id", profile_id).execute()
        else:
            query.eq("user_id", user_id).execute()

        updated_count += 1

    logger.warning(
        "Scoring profile total update completed: updated_profiles=%s",
        updated_count,
    )

    return updated_count


def recalculate_all_scores() -> dict[str, Any]:
    logger.warning("Scoring recalculation started.")

    profiles = fetch_all("profiles")
    matches = fetch_all("matches")
    teams = fetch_all("teams")
    group_match_predictions = fetch_all("group_match_predictions")
    group_predictions = fetch_all("group_predictions")
    group_wildcards = fetch_all("group_wildcards")
    knockout_predictions = fetch_all("knockout_predictions")
    knockout_wildcards = fetch_all("knockout_wildcards")
    group_actual_standings = fetch_all("group_actual_standings")
    champion_predictions = fetch_all("champion_predictions")

    matches_by_id = {
        match["id"]: match
        for match in matches
        if match.get("id")
    }

    teams_by_id = {
        team["id"]: team
        for team in teams
        if team.get("id")
    }

    actual_standings_by_group_team = {
        (standing["group_id"], standing["team_id"]): standing
        for standing in group_actual_standings
        if standing.get("group_id") and standing.get("team_id")
    }

    events: list[dict[str, Any]] = []

    build_group_match_prediction_score_events(
        events=events,
        group_match_predictions=group_match_predictions,
        matches_by_id=matches_by_id,
        teams_by_id=teams_by_id,
    )

    build_group_standing_score_events(
        events=events,
        group_predictions=group_predictions,
        actual_standings_by_group_team=actual_standings_by_group_team,
    )
    

    build_group_wildcard_score_events(
        events=events,
        group_wildcards=group_wildcards,
        group_predictions=group_predictions,
        actual_standings_by_group_team=actual_standings_by_group_team,
    )

    build_knockout_prediction_score_events(
        events=events,
        knockout_predictions=knockout_predictions,
        matches_by_id=matches_by_id,
        teams_by_id=teams_by_id,
    )

    build_knockout_wildcard_score_events(
        events=events,
        knockout_wildcards=knockout_wildcards,
        knockout_predictions=knockout_predictions,
        matches_by_id=matches_by_id,
    )

    actual_champion_team_id = get_actual_champion_team_id(matches)

    build_champion_score_events(
        events=events,
        champion_predictions=champion_predictions,
        actual_champion_team_id=actual_champion_team_id,
    )

    replace_score_events(events)

    updated_profiles = update_profile_totals(
        events=events,
        profiles=profiles,
    )

    result = {
        "message": "Scores recalculated successfully",
        "score_events_count": len(events),
        "updated_profiles_count": updated_profiles,
        "score_sum": sum(int(event.get("points") or 0) for event in events),
        "actual_champion_team_id": actual_champion_team_id,
    }

    logger.warning("Scoring recalculation completed: %s", result)

    return result
