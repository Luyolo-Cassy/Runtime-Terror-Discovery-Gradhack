"""
HealthyFood Companion API
-------------------------
FastAPI backend for the Discovery Gradhack HealthyFood Companion.

Key changes from the scaffold:
  * BigQuery + Gemini clients are LAZILY initialised (get_bq / get_model), so the
    app imports and boots even without GCP credentials on the machine. Endpoints
    only touch the clients when actually called. (Fixes the import-time crash.)
  * /api/pantry/scan classifies items against the real foodCatalogue via
    catalogue_service, instead of trusting the LLM's healthy/unhealthy guess.
  * /api/recipes/generate is personalised + catalogue-grounded via recipe_service.
  * /api/profile returns the full computed profile.
  * New GET endpoints for pantry, saved recipes, and the rewards catalogue.
"""

import os
import json
import uuid
from datetime import datetime

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import recipe_service
import catalogue_service

# ==========================================
# 1. CONFIG
# ==========================================
PROJECT_ID = "gradhack26jnb-408"
DATASET = "gradhack26jnb-408.HealthyFood"
# Gemini runs through Vertex AI using the SAME service account as BigQuery.
# No API key. Override region/model via env if needed.
LOCATION = os.getenv("VERTEX_LOCATION", "us-central1")
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

app = FastAPI(title="HealthyFood Companion API")

app.add_middleware(
    CORSMiddleware,
    # NOTE: with credentials you cannot use "*". For the hackathon we allow the
    # common Expo dev origins; add your tunnel URL if you use one.
    allow_origins=[
        "http://localhost:8081", "http://localhost:19006",
        "http://10.0.2.2:8081", "*",
    ],
    allow_credentials=False,   # keep False while origins includes "*"
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 2. LAZY CLIENTS  (so import never needs credentials)
# ==========================================
_bq_client = None
_model = None


def get_bq():
    global _bq_client
    if _bq_client is None:
        from google.cloud import bigquery
        _bq_client = bigquery.Client(project=PROJECT_ID)
    return _bq_client


def get_model():
    global _model
    if _model is None:
        import gemini_client
        _model = gemini_client.VertexGemini(PROJECT_ID, LOCATION, MODEL_NAME)
    return _model


# ==========================================
# 3. SCHEMAS
# ==========================================
class ClaimRewardRequest(BaseModel):
    user_id: str
    reward_id: str


class GenerateRecipeRequest(BaseModel):
    user_id: str


# ==========================================
# 4. ENDPOINTS
# ==========================================
@app.get("/")
def read_root():
    return {"message": "HealthyFood Companion API is running!"}


# ---------- PROFILE (full computed profile from the 15k dataset) ----------
@app.get("/api/profile/{user_id}")
def get_user_profile(user_id: str):
    query = f"""
        SELECT *
        FROM `{DATASET}.user_profiles`
        WHERE customer_id = @user_id
    """
    from google.cloud import bigquery
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id)
    ])
    rows = list(get_bq().query(query, job_config=cfg))
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")

    profile = dict(rows[0])

    # small human-readable insights the UI can show directly
    pct = profile.get("healthy_spend_pct")
    insights = {
        "headline_category": profile.get("preferred_category"),
        "budget_tier": profile.get("budget_tier"),
        "healthy_spend_label": (f"{float(pct):.0%}" if isinstance(pct, (int, float)) else None),
        "nudge": _profile_nudge(pct),
    }
    return {"status": "success", "data": profile, "insights": insights}


def _profile_nudge(pct):
    if not isinstance(pct, (int, float)):
        return "Scan a receipt to start building your healthy-eating profile."
    if pct >= 0.6:
        return "Great work — most of your basket is HealthyFood. Keep it up!"
    if pct >= 0.3:
        return "You're on your way. A few healthy swaps could push you higher."
    return "There's room to grow your HealthyFood share — try a recipe below."


# ---------- PANTRY: list ----------
@app.get("/api/pantry/{user_id}")
def get_pantry(user_id: str):
    query = f"""
        SELECT pantry_item_id, item_name, category, date_added, status
        FROM `{DATASET}.user_pantry`
        WHERE user_id = @user_id AND status = 'available'
        ORDER BY date_added DESC
    """
    from google.cloud import bigquery
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id)
    ])
    items = [dict(r) for r in get_bq().query(query, job_config=cfg)]
    return {"status": "success", "items": items}


# ---------- PANTRY: scan a receipt / photo ----------
@app.post("/api/pantry/scan")
async def scan_receipt(user_id: str, file: UploadFile = File(...)):
    image_bytes = await file.read()

    # 1. Gemini does ONLY what it's good at: reading item names off the image.
    prompt = """
    Look at this image (a grocery receipt or a photo of food).
    Extract every distinct food item you can see.
    Return ONLY a valid JSON list of strings, e.g.: ["Apples", "Full Cream Milk"]
    No markdown, no extra text.
    """
    import gemini_client
    image_part = gemini_client.build_image_part(image_bytes, file.content_type)
    response = get_model().generate_content([prompt, image_part])
    raw = response.text.replace("```json", "").replace("```", "").strip()
    try:
        names = json.loads(raw)
        if not isinstance(names, list):
            raise ValueError
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=500, detail="Failed to parse AI response")

    # 2. Catalogue decides which items are HealthyFood (source of truth).
    classified = catalogue_service.classify_items(get_bq(), DATASET, names)

    # 3. Insert into user_pantry (category comes from the catalogue when matched).
    current_date = datetime.now().strftime("%Y-%m-%d")
    rows = []
    for c in classified:
        rows.append({
            "pantry_item_id": str(uuid.uuid4()),
            "user_id": user_id,
            "item_name": c["matched_item"] or c["input_name"],
            "category": c["category"] or "Uncategorised",
            "date_added": current_date,
            "status": "available",
            # NOTE: to persist health status, add an `is_healthy` BOOL column to
            # user_pantry and include it here. For now it's returned to the UI below.
        })

    errors = get_bq().insert_rows_json(f"{DATASET}.user_pantry", rows)
    if errors:
        return {"status": "error", "message": "Failed to insert into BigQuery", "errors": errors}

    healthy_count = sum(1 for c in classified if c["is_healthy"])
    return {
        "status": "success",
        "inserted_items": rows,
        "classified": classified,             # per-item is_healthy for the UI to badge
        "healthy_count": healthy_count,
        "total_count": len(classified),
    }


# ---------- RECIPES: generate (personalised + catalogue-grounded) ----------
@app.post("/api/recipes/generate")
def generate_recipe(request: GenerateRecipeRequest):
    result = recipe_service.generate_personalized_recipe(
        get_bq(), get_model(), DATASET, request.user_id
    )
    if result.get("empty"):
        return {"message": result["message"]}

    recipe_id = str(uuid.uuid4())
    get_bq().insert_rows_json(f"{DATASET}.saved_recipes", [{
        "recipe_id": recipe_id,
        "user_id": request.user_id,
        "recipe_name": result["recipe_name"],
        "recipe_text": result["recipe_markdown"],
        "missing_ingredients": json.dumps(result["missing_ingredients"]),
        "is_favourite": False,
        "created_at": datetime.now().isoformat(),
    }])

    return {
        "status": "success",
        "recipe_id": recipe_id,
        "recipe_name": result["recipe_name"],
        "recipe": result["recipe_markdown"],
        "missing_ingredients": result["missing_ingredients"],
        "personalized_for": result["personalized_for"],
    }


# ---------- RECIPES: list saved ----------
@app.get("/api/recipes/{user_id}")
def list_recipes(user_id: str):
    query = f"""
        SELECT recipe_id, recipe_name, recipe_text, missing_ingredients,
               is_favourite, created_at
        FROM `{DATASET}.saved_recipes`
        WHERE user_id = @user_id
        ORDER BY created_at DESC
    """
    from google.cloud import bigquery
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id)
    ])
    recipes = []
    for r in get_bq().query(query, job_config=cfg):
        row = dict(r)
        # missing_ingredients is stored as a JSON string; hydrate it for the UI
        try:
            row["missing_ingredients"] = json.loads(row.get("missing_ingredients") or "[]")
        except (json.JSONDecodeError, TypeError):
            row["missing_ingredients"] = []
        recipes.append(row)
    return {"status": "success", "recipes": recipes}


# ---------- REWARDS: list catalogue ----------
@app.get("/api/rewards")
def list_rewards():
    query = f"""
        SELECT reward_id, reward_name, partner_name, points_required,
               vouchers_required, reward_type, is_active
        FROM `{DATASET}.rewards_catalog`
        WHERE is_active = TRUE
        ORDER BY points_required
    """
    rewards = [dict(r) for r in get_bq().query(query)]
    return {"status": "success", "rewards": rewards}


# ---------- REWARDS: claim ----------
@app.post("/api/rewards/claim")
def claim_reward(request: ClaimRewardRequest):
    from google.cloud import bigquery
    query = f"""
        SELECT vouchers_unlocked
        FROM `{DATASET}.user_profiles`
        WHERE customer_id = @user_id
    """
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("user_id", "STRING", request.user_id)
    ])
    results = list(get_bq().query(query, job_config=cfg))
    if not results or (results[0]["vouchers_unlocked"] or 0) < 1:
        raise HTTPException(status_code=400,
                            detail="Not enough unlocked vouchers to claim this reward.")

    claim_id = str(uuid.uuid4())
    voucher_code = f"HEALTHY-{str(uuid.uuid4())[:8].upper()}"
    get_bq().insert_rows_json(f"{DATASET}.user_claimed_rewards", [{
        "claim_id": claim_id,
        "user_id": request.user_id,
        "reward_id": request.reward_id,
        "voucher_code": voucher_code,
        "claimed_at": datetime.now().isoformat(),
        "expires_at": None,
        "status": "active",
    }])

    # mock deduction so the cycle resets (same behaviour as the scaffold)
    get_bq().insert_rows_json(f"{DATASET}.user_milestones", [{
        "milestone_id": str(uuid.uuid4()),
        "user_id": request.user_id,
        "badge_name": "Voucher Claimed Deduction",
        "points_earned": -1000,
        "achieved_at": datetime.now().isoformat(),
    }])

    return {"status": "success", "voucher_code": voucher_code,
            "message": "Reward claimed successfully!"}