from fastapi import APIRouter
from app.core.supabase import supabase

router = APIRouter()

@router.get("/teams")
def get_teams():
    result = supabase.table("teams").select("*").execute()
    return {
        "count": len(result.data),
        "data": result.data,
    }

@router.get("/avatars")
def get_avatars():
    result = supabase.table("avatars").select("*").execute()
    return {
        "count": len(result.data),
        "data": result.data,
    }