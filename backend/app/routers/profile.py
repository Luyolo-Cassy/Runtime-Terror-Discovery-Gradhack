from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def get_profile():
    return {"message": "profile router stub"}
