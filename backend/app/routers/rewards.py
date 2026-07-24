from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def get_rewards():
    return {"message": "rewards router stub"}
