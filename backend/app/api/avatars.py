from fastapi import APIRouter, HTTPException
from app.core.supabase import supabase

router = APIRouter()

@router.get("/")
def get_avatars():
    result = (
        supabase
        .table("avatars")
        .select("*")
        .eq("is_active", True)
        .order("name")
        .execute()
    )

    return {
        "count": len(result.data),
        "data": result.data,
    }