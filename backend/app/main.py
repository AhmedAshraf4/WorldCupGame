from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.avatars import router as avatars_router
from app.api.groups import router as groups_router
from app.api.test import router as test_router
from app.api.teams import router as teams_router
from app.api.onboarding import router as onboarding_router
from app.api.me import router as me_router
from app.api.group_predictions import router as group_predictions_router
from app.api.group_wildcards import router as group_wildcards_router
from app.api.admin_sync import router as admin_sync_router
from app.api.matches import router as matches_router
from app.api.group_match_predictions import router as group_match_predictions_router
from app.api.clubs import router as clubs_router
from app.api.scoreboard import router as scoreboard_router
from app.api.group_wildcards import router as group_wildcards_router
from app.api.knockout_wildcards import router as knockout_wildcards_router
from app.api.knockout_predictions import router as knockout_predictions_router
from app.api.scoring import router as scoring_router
from app.api.admin_results import router as admin_results_router
from app.api.admin_locks import router as admin_locks_router
from app.api.locks import router as locks_router

app = FastAPI(title="World Cup Challenge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(locks_router, prefix="/locks", tags=["Locks"])
app.include_router(test_router, prefix="/test", tags=["Test"])
app.include_router(avatars_router, prefix="/avatars", tags=["Avatars"])
app.include_router(groups_router, prefix="/groups", tags=["Groups"])
app.include_router(teams_router, prefix="/teams", tags=["Teams"])
app.include_router(onboarding_router, prefix="/onboarding", tags=["Onboarding"])
app.include_router(me_router, prefix="/me", tags=["Me"])
app.include_router(
    group_predictions_router,
    prefix="/group-predictions",
    tags=["Group Predictions"],
)
app.include_router(admin_sync_router, prefix="/admin/sync", tags=["Admin Sync"])


app.include_router(matches_router, prefix="/matches", tags=["Matches"])

app.include_router(
    admin_locks_router,
    prefix="/admin/locks",
    tags=["Admin Locks"],
)

app.include_router(
    group_match_predictions_router,
    prefix="/group-match-predictions",
    tags=["Group Match Predictions"],
)

app.include_router(
    knockout_wildcards_router,
    prefix="/knockout-wildcards",
    tags=["Knockout Wildcards"],
)

app.include_router(clubs_router, prefix="/clubs", tags=["Clubs"])
app.include_router(
    group_wildcards_router,
    prefix="/group-wildcards",
    tags=["Group Wildcards"],
)
app.include_router(scoreboard_router, prefix="/scoreboard", tags=["Scoreboard"])

app.include_router(
    knockout_predictions_router,
    prefix="/knockout-predictions",
    tags=["Knockout Predictions"],
)

app.include_router(
    admin_results_router,
    prefix="/admin/results",
    tags=["Admin Results"],
)

app.include_router(scoring_router, prefix="/scoring", tags=["Scoring"])

@app.get("/")
def root():
    return {"message": "World Cup Challenge API is running"}