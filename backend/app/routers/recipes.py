from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def get_recipes():
    return {"message": "recipes router stub"}
