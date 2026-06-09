from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import APIKeyHeader

from app.core.supabase import supabase
from app.services.lock_service import get_prediction_lock_status

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


@router.get("/status")
def get_locks_status(
    user_id: str = Depends(get_user_id_from_token),
):
    result = (
        supabase
        .table("prediction_locks")
        .select("*")
        .order("created_at")
        .execute()
    )

    locks = result.data or []

    data = [
        get_prediction_lock_status(lock_item["lock_key"])
        for lock_item in locks
    ]

    return {
        "count": len(data),
        "data": data,
    }