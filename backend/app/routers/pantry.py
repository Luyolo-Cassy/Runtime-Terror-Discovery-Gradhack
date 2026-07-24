from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def get_pantry():
    return {"message": "pantry router stub"}
