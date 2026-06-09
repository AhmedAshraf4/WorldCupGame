from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import APIKeyHeader

from app.core.supabase import supabase
from app.services.scoring_service import recalculate_all_scores

router = APIRouter()

authorization_header = APIKeyHeader(
    name="Authorization",
    auto_error=False,
)


def get_user_id_from_token(
    authorization: str | None = Depends(authorization_header),
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")

    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        return user_response.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid auth token")


@router.post("/recalculate")
def recalculate_scores(
    user_id: str = Depends(get_user_id_from_token),
):
    return recalculate_all_scores()


@router.get("/me")
def get_my_score_breakdown(
    user_id: str = Depends(get_user_id_from_token),
):
    result = (
        supabase
        .table("user_score_events")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at")
        .execute()
    )

    events = result.data or []

    return {
        "total_points": sum(int(event.get("points") or 0) for event in events),
        "count": len(events),
        "data": events,
    }