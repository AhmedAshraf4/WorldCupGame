import os
import sys
import types
import unittest
from pathlib import Path

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

supabase_module = types.ModuleType("app.core.supabase")
supabase_module.supabase = object()
sys.modules.setdefault("app.core.supabase", supabase_module)

from app.services.scoring_service import (  # noqa: E402
    GROUP_EXACT_POINTS,
    GROUP_MATCH_POINTS,
    ROUND_POINTS,
    build_group_standing_score_events,
    build_group_wildcard_score_events,
    build_group_match_prediction_score_events,
    build_knockout_prediction_score_events,
    build_knockout_wildcard_score_events,
    get_underdog_team_id,
)


class GroupMatchUnderdogScoringTests(unittest.TestCase):
    def setUp(self):
        self.teams_by_id = {
            "underdog": {"id": "underdog", "fifa_rank": 25},
            "favorite": {"id": "favorite", "fifa_rank": 5},
        }

    def score_for(self, actual_outcome):
        events = []
        build_group_match_prediction_score_events(
            events=events,
            group_match_predictions=[
                {
                    "user_id": "user-1",
                    "match_id": "match-1",
                    "predicted_outcome": "TEAM_A_WIN",
                }
            ],
            matches_by_id={
                "match-1": {
                    "id": "match-1",
                    "team_a_id": "underdog",
                    "team_b_id": "favorite",
                    "actual_outcome": actual_outcome,
                }
            },
            teams_by_id=self.teams_by_id,
        )

        self.assertEqual(len(events), 1)
        return events[0]

    def test_underdog_pick_loses_points_on_draw(self):
        event = self.score_for("DRAW")

        self.assertEqual(event["points"], GROUP_MATCH_POINTS * -1)

    def test_underdog_pick_loses_one_point_on_normalized_draw(self):
        event = self.score_for(" draw ")

        self.assertEqual(event["points"], GROUP_MATCH_POINTS * -1)

    def test_underdog_pick_loses_points_on_loss(self):
        event = self.score_for("TEAM_B_WIN")

        self.assertEqual(event["points"], GROUP_MATCH_POINTS * -2)

    def test_underdog_pick_wins_double_points_on_win(self):
        event = self.score_for("TEAM_A_WIN")

        self.assertEqual(event["points"], GROUP_MATCH_POINTS * 2)


class GroupWildcardScoringTests(unittest.TestCase):
    def score_for(self, actual_position):
        events = []
        build_group_wildcard_score_events(
            events=events,
            group_wildcards=[
                {
                    "user_id": "user-1",
                    "group_id": "group-a",
                    "team_id": "team-a",
                    "predicted_position": 1,
                }
            ],
            group_predictions=[
                {
                    "user_id": "user-1",
                    "group_id": "group-a",
                    "team_id": "team-a",
                    "predicted_position": 1,
                }
            ],
            actual_standings_by_group_team={
                ("group-a", "team-a"): {
                    "actual_position": actual_position,
                    "qualified_to_ro32": actual_position <= 2,
                    "qualified_as_best_third": False,
                }
            },
        )

        self.assertEqual(len(events), 1)
        return events[0]

    def test_group_wildcard_correct_gets_base_points_times_two_bonus(self):
        event = self.score_for(1)

        self.assertEqual(event["points"], GROUP_EXACT_POINTS * 2)

    def test_group_standing_plus_wildcard_total_is_base_points_times_three(self):
        events = []
        group_predictions = [
            {
                "user_id": "user-1",
                "group_id": "group-a",
                "team_id": "team-a",
                "predicted_position": 1,
            }
        ]
        actual_standings_by_group_team = {
            ("group-a", "team-a"): {
                "actual_position": 1,
                "qualified_to_ro32": True,
                "qualified_as_best_third": False,
            }
        }

        build_group_standing_score_events(
            events=events,
            group_predictions=group_predictions,
            actual_standings_by_group_team=actual_standings_by_group_team,
        )
        build_group_wildcard_score_events(
            events=events,
            group_wildcards=[
                {
                    "user_id": "user-1",
                    "group_id": "group-a",
                    "team_id": "team-a",
                    "predicted_position": 1,
                }
            ],
            group_predictions=group_predictions,
            actual_standings_by_group_team=actual_standings_by_group_team,
        )

        self.assertEqual(
            sum(event["points"] for event in events),
            GROUP_EXACT_POINTS * 3,
        )

    def test_group_wildcard_wrong_loses_base_points_times_three(self):
        event = self.score_for(4)

        self.assertEqual(event["points"], GROUP_EXACT_POINTS * -3)


class MeaningfulUnderdogDetectionTests(unittest.TestCase):
    def test_two_rank_gap_is_not_underdog_even_with_points_gap(self):
        underdog_team_id = get_underdog_team_id(
            match={
                "team_a_id": "rank-10",
                "team_b_id": "rank-12",
            },
            teams_by_id={
                "rank-10": {
                    "id": "rank-10",
                    "fifa_rank": 10,
                    "fifa_points": 1700,
                },
                "rank-12": {
                    "id": "rank-12",
                    "fifa_rank": 12,
                    "fifa_points": 1600,
                },
            },
        )

        self.assertIsNone(underdog_team_id)

    def test_points_gap_is_used_when_rank_is_missing(self):
        underdog_team_id = get_underdog_team_id(
            match={
                "team_a_id": "low-points",
                "team_b_id": "high-points",
            },
            teams_by_id={
                "low-points": {
                    "id": "low-points",
                    "fifa_rank": None,
                    "fifa_points": 1600,
                },
                "high-points": {
                    "id": "high-points",
                    "fifa_rank": 12,
                    "fifa_points": 1700,
                },
            },
        )

        self.assertEqual(underdog_team_id, "low-points")


class KnockoutWildcardScoringTests(unittest.TestCase):
    def score_for(self, actual_winner_team_id):
        events = [
            {
                "user_id": "user-1",
                "source_type": "KNOCKOUT_PREDICTION",
                "source_key": "match-1",
                "points": (
                    ROUND_POINTS["QUARTER_FINAL"]
                    if actual_winner_team_id == "team-a"
                    else 0
                ),
                "description": "Existing knockout prediction event.",
            }
        ]
        build_knockout_wildcard_score_events(
            events=events,
            knockout_wildcards=[
                {
                    "user_id": "user-1",
                    "wildcard_round": "QUARTER_FINAL",
                    "team_id": "team-a",
                }
            ],
            knockout_predictions=[
                {
                    "user_id": "user-1",
                    "match_id": "match-1",
                    "predicted_winner_team_id": "team-a",
                }
            ],
            matches_by_id={
                "match-1": {
                    "id": "match-1",
                    "stage": "QUARTER_FINAL",
                    "actual_winner_team_id": actual_winner_team_id,
                }
            },
        )

        self.assertEqual(len(events), 2)
        return events[1]

    def test_knockout_wildcard_correct_gets_round_points_times_two_bonus(self):
        event = self.score_for("team-a")

        self.assertEqual(event["points"], ROUND_POINTS["QUARTER_FINAL"] * 2)

    def test_knockout_prediction_plus_wildcard_total_is_round_points_times_three(self):
        events = []
        matches_by_id = {
            "match-1": {
                "id": "match-1",
                "stage": "QUARTER_FINAL",
                "team_a_id": "team-a",
                "team_b_id": "team-b",
                "actual_winner_team_id": "team-a",
            }
        }
        knockout_predictions = [
            {
                "user_id": "user-1",
                "match_id": "match-1",
                "predicted_winner_team_id": "team-a",
            }
        ]

        build_knockout_prediction_score_events(
            events=events,
            knockout_predictions=knockout_predictions,
            matches_by_id=matches_by_id,
            teams_by_id={
                "team-a": {"id": "team-a"},
                "team-b": {"id": "team-b"},
            },
        )
        build_knockout_wildcard_score_events(
            events=events,
            knockout_wildcards=[
                {
                    "user_id": "user-1",
                    "wildcard_round": "QUARTER_FINAL",
                    "team_id": "team-a",
                }
            ],
            knockout_predictions=knockout_predictions,
            matches_by_id=matches_by_id,
        )

        self.assertEqual(
            sum(event["points"] for event in events),
            ROUND_POINTS["QUARTER_FINAL"] * 3,
        )

    def test_knockout_underdog_prediction_plus_wildcard_total_is_round_points_times_three(self):
        events = []
        matches_by_id = {
            "match-1": {
                "id": "match-1",
                "stage": "QUARTER_FINAL",
                "team_a_id": "underdog",
                "team_b_id": "favorite",
                "actual_winner_team_id": "underdog",
            }
        }
        knockout_predictions = [
            {
                "user_id": "user-1",
                "match_id": "match-1",
                "predicted_winner_team_id": "underdog",
            }
        ]

        build_knockout_prediction_score_events(
            events=events,
            knockout_predictions=knockout_predictions,
            matches_by_id=matches_by_id,
            teams_by_id={
                "underdog": {"id": "underdog", "fifa_rank": 25},
                "favorite": {"id": "favorite", "fifa_rank": 5},
            },
        )
        build_knockout_wildcard_score_events(
            events=events,
            knockout_wildcards=[
                {
                    "user_id": "user-1",
                    "wildcard_round": "QUARTER_FINAL",
                    "team_id": "underdog",
                }
            ],
            knockout_predictions=knockout_predictions,
            matches_by_id=matches_by_id,
        )

        self.assertEqual(
            sum(event["points"] for event in events),
            ROUND_POINTS["QUARTER_FINAL"] * 3,
        )

    def test_knockout_wildcard_wrong_loses_round_points_times_three(self):
        event = self.score_for("team-b")

        self.assertEqual(event["points"], ROUND_POINTS["QUARTER_FINAL"] * -3)

    def test_correct_final_wildcard_uses_thirty_point_base(self):
        events = []
        matches_by_id = {
            "final-match": {
                "id": "final-match",
                "stage": "FINAL",
                "team_a_id": "team-a",
                "team_b_id": "team-b",
                "actual_winner_team_id": "team-a",
            }
        }
        predictions = [{
            "user_id": "user-1",
            "match_id": "final-match",
            "predicted_winner_team_id": "team-a",
        }]
        build_knockout_prediction_score_events(
            events=events,
            knockout_predictions=predictions,
            matches_by_id=matches_by_id,
            teams_by_id={
                "team-a": {"id": "team-a"},
                "team-b": {"id": "team-b"},
            },
        )
        build_knockout_wildcard_score_events(
            events=events,
            knockout_wildcards=[{
                "user_id": "user-1",
                "wildcard_round": "FINAL",
                "team_id": "team-a",
            }],
            knockout_predictions=predictions,
            matches_by_id=matches_by_id,
        )

        self.assertEqual(sum(event["points"] for event in events), 90)
        self.assertEqual(events[-1]["points"], 60)


class ThirdPlaceScoringTests(unittest.TestCase):
    def score_for(self, predicted_team_id, actual_team_id):
        events = []
        build_knockout_prediction_score_events(
            events=events,
            knockout_predictions=[{
                "user_id": "user-1",
                "match_id": "third-place-match",
                "predicted_winner_team_id": predicted_team_id,
            }],
            matches_by_id={
                "third-place-match": {
                    "id": "third-place-match",
                    "stage": "THIRD_PLACE",
                    "team_a_id": "underdog",
                    "team_b_id": "favorite",
                    "actual_winner_team_id": actual_team_id,
                }
            },
            teams_by_id={
                "underdog": {"id": "underdog", "fifa_rank": 25},
                "favorite": {"id": "favorite", "fifa_rank": 5},
            },
        )
        return events[0]

    def test_correct_third_place_pick_gets_ten_points_without_underdog_bonus(self):
        event = self.score_for("underdog", "underdog")

        self.assertEqual(event["points"], 10)

    def test_wrong_third_place_pick_gets_zero_points(self):
        event = self.score_for("underdog", "favorite")

        self.assertEqual(event["points"], 0)

    def wildcard_total_for(self, actual_team_id):
        events = []
        matches_by_id = {
            "third-place-match": {
                "id": "third-place-match",
                "stage": "THIRD_PLACE",
                "team_a_id": "team-a",
                "team_b_id": "team-b",
                "actual_winner_team_id": actual_team_id,
            }
        }
        predictions = [{
            "user_id": "user-1",
            "match_id": "third-place-match",
            "predicted_winner_team_id": "team-a",
        }]
        build_knockout_prediction_score_events(
            events=events,
            knockout_predictions=predictions,
            matches_by_id=matches_by_id,
            teams_by_id={
                "team-a": {"id": "team-a"},
                "team-b": {"id": "team-b"},
            },
        )
        build_knockout_wildcard_score_events(
            events=events,
            knockout_wildcards=[{
                "user_id": "user-1",
                "wildcard_round": "FINAL",
                "team_id": "team-a",
            }],
            knockout_predictions=predictions,
            matches_by_id=matches_by_id,
        )
        return events

    def test_correct_final_wildcard_on_third_place_pick_totals_thirty_points(self):
        events = self.wildcard_total_for("team-a")

        self.assertEqual(sum(event["points"] for event in events), 30)
        self.assertEqual(events[-1]["points"], 20)

    def test_wrong_final_wildcard_on_third_place_pick_loses_thirty_points(self):
        events = self.wildcard_total_for("team-b")

        self.assertEqual(events[-1]["points"], -30)


if __name__ == "__main__":
    unittest.main()
