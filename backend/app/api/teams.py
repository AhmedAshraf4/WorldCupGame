from fastapi import APIRouter
from app.core.supabase import supabase

router = APIRouter()

@router.get("/")
def get_teams():
    result = (
        supabase
        .table("teams")
        .select("*")
        .order("fifa_rank")
        .execute()
    )

    return {
        "count": len(result.data),
        "data": result.data,
    }