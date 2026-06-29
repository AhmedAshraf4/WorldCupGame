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
    GROUP_MATCH_POINTS,
    ROUND_POINTS,
    build_group_match_prediction_score_events,
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
        events = []
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

        self.assertEqual(len(events), 1)
        return events[0]

    def test_knockout_wildcard_correct_gets_round_points_times_three(self):
        event = self.score_for("team-a")

        self.assertEqual(event["points"], ROUND_POINTS["QUARTER_FINAL"] * 3)

    def test_knockout_wildcard_wrong_loses_round_points_times_three(self):
        event = self.score_for("team-b")

        self.assertEqual(event["points"], ROUND_POINTS["QUARTER_FINAL"] * -3)


if __name__ == "__main__":
    unittest.main()
