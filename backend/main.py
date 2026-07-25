import os
import uuid
from datetime import datetime
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google.cloud import bigquery
import google.generativeai as genai

# ==========================================
# 1. SETUP & CONFIGURATION
# ==========================================

app = FastAPI(title="HealthyFood Companion API")

# Allow frontend to communicate with this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Change to your frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize BigQuery Client (Relies on GOOGLE_APPLICATION_CREDENTIALS)
bq_client = bigquery.Client(project="gradhack26jnb-408")
DATASET = "gradhack26jnb-408.HealthyFood"

# Initialize Gemini Client
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_API_KEY_HERE")
genai.configure(api_key=GEMINI_API_KEY)
# Use Gemini 1.5 Flash for multimodal (text + images) tasks
model = genai.GenerativeModel('gemini-1.5-flash')

# ==========================================
# 2. PYDANTIC MODELS (Request Schemas)
# ==========================================

class ClaimRewardRequest(BaseModel):
    user_id: str
    reward_id: str

class GenerateRecipeRequest(BaseModel):
    user_id: str

# ==========================================
# 3. API ENDPOINTS
# ==========================================

@app.get("/")
def read_root():
    return {"message": "HealthyFood Companion API is running!"}

# ------------------------------------------
# GET USER PROFILE & REWARD STATS
# ------------------------------------------
@app.get("/api/profile/{user_id}")
def get_user_profile(user_id: str):
    query = f"""
        SELECT 
            customer_id, customer_name, vitality_tier, total_lifetime_points,
            current_cycle_points, vouchers_unlocked, healthy_spend_pct
        FROM `{DATASET}.user_profiles`
        WHERE customer_id = @user_id
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("user_id", "STRING", user_id)]
    )
    
    results = list(bq_client.query(query, job_config=job_config))
    
    if not results:
        raise HTTPException(status_code=404, detail="User not found")
        
    user_data = dict(results[0])
    return {"status": "success", "data": user_data}


# ------------------------------------------
# SCAN RECEIPT OR PANTRY PHOTO (Gemini AI)
# ------------------------------------------
@app.post("/api/pantry/scan")
async def scan_receipt(user_id: str, file: UploadFile = File(...)):
    # 1. Read image bytes
    image_bytes = await file.read()
    
    # 2. Send image to Gemini to extract food items
    prompt = """
    Look at this image. Extract all food items. 
    Categorize each item and determine if it is healthy or unhealthy.
    Return ONLY a valid JSON list of objects in this exact format:
    [{"item_name": "Apples", "category": "Fruit", "status": "available"}]
    """
    
    # Note: In a real app, you'd pass the actual image bytes to Gemini. 
    # This assumes using google-generativeai standard image upload or blob format.
    response = model.generate_content([prompt, {"mime_type": file.content_type, "data": image_bytes}])
    
    # Extract JSON text from Gemini response (clean up markdown block if present)
    json_text = response.text.replace("```json", "").replace("```", "").strip()
    
    import json
    try:
        scanned_items = json.loads(json_text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse AI response")

    # 3. Insert items into BigQuery
    rows_to_insert = []
    current_date = datetime.now().strftime("%Y-%m-%d")
    
    for item in scanned_items:
        rows_to_insert.append({
            "pantry_item_id": str(uuid.uuid4()),
            "user_id": user_id,
            "item_name": item.get("item_name"),
            "category": item.get("category"),
            "date_added": current_date,
            "status": "available"
        })
        
    errors = bq_client.insert_rows_json(f"{DATASET}.user_pantry", rows_to_insert)
    
    if errors:
        return {"status": "error", "message": "Failed to insert into BigQuery", "errors": errors}
        
    return {"status": "success", "inserted_items": rows_to_insert}


# ------------------------------------------
# GENERATE RECIPE FROM PANTRY (Gemini AI)
# ------------------------------------------
@app.post("/api/recipes/generate")
def generate_recipe(request: GenerateRecipeRequest):
    # 1. Get available pantry items for this user
    query = f"""
        SELECT item_name 
        FROM `{DATASET}.user_pantry`
        WHERE user_id = @user_id AND status = 'available'
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("user_id", "STRING", request.user_id)]
    )
    items = list(bq_client.query(query, job_config=job_config))
    
    if not items:
        return {"message": "Pantry is empty. Scan a receipt first!"}
        
    ingredients = [row["item_name"] for row in items]
    
    # 2. Ask Gemini to create a recipe
    prompt = f"I have the following ingredients: {', '.join(ingredients)}. Create a quick, healthy recipe using some of these. Format as Markdown. Give it a catchy title."
    response = model.generate_content(prompt)
    recipe_text = response.text
    
    # 3. Save the recipe to BigQuery
    recipe_id = str(uuid.uuid4())
    rows_to_insert = [{
        "recipe_id": recipe_id,
        "user_id": request.user_id,
        "recipe_name": "AI Generated Healthy Meal",
        "recipe_text": recipe_text,
        "missing_ingredients": "", # Could prompt Gemini for this too!
        "is_favourite": False,
        "created_at": datetime.now().isoformat()
    }]
    
    bq_client.insert_rows_json(f"{DATASET}.saved_recipes", rows_to_insert)
    
    return {"status": "success", "recipe_id": recipe_id, "recipe": recipe_text}


# ------------------------------------------
# CLAIM REWARD VOUCHER
# ------------------------------------------
@app.post("/api/rewards/claim")
def claim_reward(request: ClaimRewardRequest):
    # 1. Verify user has unlocked vouchers
    query = f"""
        SELECT vouchers_unlocked
        FROM `{DATASET}.user_profiles`
        WHERE customer_id = @user_id
    """
    job_config = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("user_id", "STRING", request.user_id)
    ])
    results = list(bq_client.query(query, job_config=job_config))
    
    if not results or results[0]["vouchers_unlocked"] < 1:
        raise HTTPException(status_code=400, detail="Not enough unlocked vouchers to claim this reward.")

    # 2. Generate promo code and log claim
    claim_id = str(uuid.uuid4())
    voucher_code = f"HEALTHY-{str(uuid.uuid4())[:8].upper()}"
    
    claim_row = [{
        "claim_id": claim_id,
        "user_id": request.user_id,
        "reward_id": request.reward_id,
        "voucher_code": voucher_code,
        "claimed_at": datetime.now().isoformat(),
        "expires_at": None,
        "status": "active"
    }]
    bq_client.insert_rows_json(f"{DATASET}.user_claimed_rewards", claim_row)
    
    # 3. Deduct points / log milestone so cycle resets (mock logic: subtract 1000 points via milestone)
    milestone_row = [{
        "milestone_id": str(uuid.uuid4()),
        "user_id": request.user_id,
        "badge_name": "Voucher Claimed Deduction",
        "points_earned": -1000,
        "achieved_at": datetime.now().isoformat()
    }]
    bq_client.insert_rows_json(f"{DATASET}.user_milestones", milestone_row)

    return {"status": "success", "voucher_code": voucher_code, "message": "Reward claimed successfully!"}