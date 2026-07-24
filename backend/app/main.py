from fastapi import FastAPI

from app.routers import users, profile, recipes, pantry, rewards

app = FastAPI(title="HealthyFood Companion API")

app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(profile.router, prefix="/profile", tags=["profile"])
app.include_router(recipes.router, prefix="/recipes", tags=["recipes"])
app.include_router(pantry.router, prefix="/pantry", tags=["pantry"])
app.include_router(rewards.router, prefix="/rewards", tags=["rewards"])


@app.get("/health")
def health_check():
    return {"status": "ok"}
