import os
import uuid
import requests
from typing import Optional
from datetime import datetime, timezone, date
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google.cloud import bigquery
from google.cloud import documentai_v1 as documentai

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ID = os.getenv("GCP_PROJECT_ID", "gradhack26jnb-408")
DATASET_ID = "HealthyFood"
DEMO_USER_ID = "team-demo"

LOCATION = os.getenv("DOC_AI_LOCATION", "us")
PROCESSOR_ID = os.getenv("DOC_AI_PROCESSOR_ID", "your-processor-id")
PERSON_2_URL = os.getenv("PERSON_2_URL", "https://person2-service-url.run.app/api/recompute")

bq_client = bigquery.Client(project=PROJECT_ID)
doc_ai_client = documentai.DocumentProcessorServiceClient()

# Matches the REAL saved_recipes schema: recipe_id, user_id, recipe_name,
# recipe_text, missing_ingredients, is_favourite, created_at
class RecipeSaveRequest(BaseModel):
    recipe_id: str
    recipe_name: str
    recipe_text: Optional[str] = ""
    missing_ingredients: Optional[str] = ""
    is_favourite: bool = False


def process_receipt_image(file_bytes: bytes, mime_type: str):
    """Calls Document AI and pulls out item names from the receipt.
    Note: quantity is intentionally NOT extracted here, because
    user_pantry has no quantity column to store it in."""
    name = f"projects/{PROJECT_ID}/locations/{LOCATION}/processors/{PROCESSOR_ID}"
    raw_doc = documentai.RawDocument(content=file_bytes, mime_type=mime_type)
    result = doc_ai_client.process_document(
        request=documentai.ProcessRequest(name=name, raw_document=raw_doc)
    )

    items = []
    for entity in result.document.entities:
        if entity.type_ == "line_item":
            item_name = ""
            for prop in entity.properties:
                if prop.type_ == "line_item/description":
                    item_name = prop.mention_text
            if item_name:
                items.append({"name": item_name})
    return items or [{"name": "Grocery Item"}]


# 1. READ PANTRY
@app.get("/api/pantry")
def get_pantry():
    query = f"""
        SELECT pantry_item_id, item_name, category, date_added, status
        FROM `{PROJECT_ID}.{DATASET_ID}.user_pantry`
        WHERE user_id = @u AND status = 'bought'
        ORDER BY date_added DESC
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("u", "STRING", DEMO_USER_ID)]
    )
    rows = [dict(row) for row in bq_client.query(query, job_config=job_config)]
    for r in rows:
        if r.get("date_added") is not None:
            r["date_added"] = str(r["date_added"])
    return {"success": True, "items": rows}


# 2. OCR SCAN & WRITE TO user_pantry
@app.post("/api/scan-receipt")
async def scan_receipt(file: UploadFile = File(...)):
    contents = await file.read()
    parsed_items = process_receipt_image(contents, file.content_type or "image/jpeg")

    today_iso = date.today().isoformat()
    rows = [
        {
            "pantry_item_id": str(uuid.uuid4()),
            "user_id": DEMO_USER_ID,
            "item_name": i["name"],
            "category": "Uncategorized",  # TODO: replace once a real category source exists
            "date_added": today_iso,
            "status": "bought",
        }
        for i in parsed_items
    ]

    errors = bq_client.insert_rows_json(f"{PROJECT_ID}.{DATASET_ID}.user_pantry", rows)
    if errors:
        raise HTTPException(status_code=500, detail=str(errors))

    try:
        requests.post(PERSON_2_URL, json={"userId": DEMO_USER_ID}, timeout=3)
    except Exception:
        pass

    return {"success": True, "items": parsed_items}


# 3. SAVE RECIPE TO saved_recipes
@app.post("/api/recipes/save")
def save_recipe(payload: RecipeSaveRequest):
    row = [
        {
            "recipe_id": payload.recipe_id,
            "user_id": DEMO_USER_ID,
            "recipe_name": payload.recipe_name,
            "recipe_text": payload.recipe_text,
            "missing_ingredients": payload.missing_ingredients,
            "is_favourite": payload.is_favourite,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    ]
    errors = bq_client.insert_rows_json(f"{PROJECT_ID}.{DATASET_ID}.saved_recipes", row)
    if errors:
        raise HTTPException(status_code=500, detail=str(errors))
    return {"success": True}


# 4. READ SAVED RECIPES
@app.get("/api/recipes/saved")
def get_saved():
    query = f"""
        SELECT recipe_id, recipe_name, recipe_text, missing_ingredients, is_favourite, created_at
        FROM `{PROJECT_ID}.{DATASET_ID}.saved_recipes`
        WHERE user_id = @u
        ORDER BY created_at DESC
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("u", "STRING", DEMO_USER_ID)]
    )
    rows = [dict(row) for row in bq_client.query(query, job_config=job_config)]
    for r in rows:
        if r.get("created_at") is not None:
            r["created_at"] = str(r["created_at"])
    return {"success": True, "recipes": rows}