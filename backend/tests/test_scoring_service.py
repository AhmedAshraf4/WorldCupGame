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
    build_group_match_prediction_score_events,
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

    def test_underdog_pick_loses_points_on_loss(self):
        event = self.score_for("TEAM_B_WIN")

        self.assertEqual(event["points"], GROUP_MATCH_POINTS * -2)

    def test_underdog_pick_wins_double_points_on_win(self):
        event = self.score_for("TEAM_A_WIN")

        self.assertEqual(event["points"], GROUP_MATCH_POINTS * 2)


if __name__ == "__main__":
    unittest.main()
