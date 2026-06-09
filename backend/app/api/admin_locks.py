from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from app.core.supabase import supabase
from app.services.lock_service import get_prediction_lock_status

router = APIRouter()

authorization_header = APIKeyHeader(
    name="Authorization",
    auto_error=False,
)


class UpdatePredictionLockRequest(BaseModel):
    lock_key: str
    open_at: str | None = None
    deadline_at: str | None = None
    is_locked: bool = False


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


def normalize_datetime(value: str | None) -> str | None:
    if not value:
        return None

    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc).isoformat()


@router.get("")
@router.get("/")
def get_prediction_locks(
    user_id: str = Depends(get_admin_user_id_from_token),
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


@router.post("")
@router.post("/")
def update_prediction_lock(
    payload: UpdatePredictionLockRequest,
    user_id: str = Depends(get_admin_user_id_from_token),
):
    existing_result = (
        supabase
        .table("prediction_locks")
        .select("*")
        .eq("lock_key", payload.lock_key)
        .execute()
    )

    if not existing_result.data:
        raise HTTPException(status_code=404, detail="Prediction lock not found")

    open_at = normalize_datetime(payload.open_at)
    deadline_at = normalize_datetime(payload.deadline_at)

    if open_at and deadline_at:
        parsed_open_at = datetime.fromisoformat(open_at)
        parsed_deadline_at = datetime.fromisoformat(deadline_at)

        if parsed_open_at >= parsed_deadline_at:
            raise HTTPException(
                status_code=400,
                detail="Open time must be before deadline time",
            )

    update_result = (
        supabase
        .table("prediction_locks")
        .update({
            "open_at": open_at,
            "deadline_at": deadline_at,
            "is_locked": payload.is_locked,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("lock_key", payload.lock_key)
        .execute()
    )

    updated_lock = update_result.data[0] if update_result.data else None

    return {
        "message": "Prediction lock updated successfully",
        "data": get_prediction_lock_status(payload.lock_key) if updated_lock else None,
    }