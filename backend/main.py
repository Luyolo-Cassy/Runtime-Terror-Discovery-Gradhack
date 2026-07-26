"""
HealthyFood Companion API
-------------------------
FastAPI backend for the Discovery Gradhack HealthyFood Companion.

Design notes for the team:

  * Clients are LAZY (bq.get_client / get_model), so the app imports and boots
    with no GCP credentials on the machine. Nothing calls Google Cloud until an
    endpoint that needs data is hit.

  * The catalogue is the source of truth for "is this healthy", not the LLM.
    Gemini reads item names off a photo (what it's good at); catalogue_service
    decides which of those names are HealthyFood.

  * Every read path that is nice-to-have rather than essential is wrapped so a
    missing table degrades one card in the UI instead of failing the screen.
    A live demo should never show a stack trace.

  * GET /api/home/{user_id} hydrates the entire app in one round trip. The
    frontend calls that on load rather than firing eight requests.
"""

import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import bootstrap
import bq
import catalogue_service
import config
import insights_service
import pantry_service
import points_service
import receipts_service
import recipe_service
import shopping_service

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("healthyfood")

app = FastAPI(
    title="HealthyFood Companion API",
    description="Discovery Gradhack 2026 - Theme 2, AI for Smarter Everyday Living",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    # With credentials off we can safely allow any origin, which saves the team
    # from chasing CORS errors when the demo moves to a tunnel or Cloud Run URL.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# LAZY GEMINI CLIENT
# ==========================================
_model = None


def get_model():
    global _model
    if _model is None:
        log.info("Initialising Vertex Gemini client (first use this process)")  # LOG
        import gemini_client
        _model = gemini_client.VertexGemini(
            config.PROJECT_ID, config.LOCATION, config.MODEL_NAME
        )
        log.info("Gemini client ready: project=%s location=%s model=%s",  # LOG
                  config.PROJECT_ID, config.LOCATION, config.MODEL_NAME)
    return _model


@app.on_event("startup")
def _startup():
    """Create the tables we write to, if they're missing. Never fatal."""
    log.info("App startup: ensuring BigQuery tables exist")  # LOG
    try:
        bootstrap.ensure_tables()
        log.info("Bootstrap complete: tables verified/created")  # LOG
    except Exception as exc:  # noqa: BLE001
        log.warning("bootstrap skipped: %s", exc)


# ==========================================
# SCHEMAS
# ==========================================
class GenerateRecipeRequest(BaseModel):
    user_id: str = config.DEFAULT_USER
    # When true, the recipe is built around items that are about to expire.
    zero_waste: bool = False
    recipe_length: str = "standard"  


class ClaimRewardRequest(BaseModel):
    user_id: str = config.DEFAULT_USER
    reward_id: str


class PantryItemRequest(BaseModel):
    user_id: str = config.DEFAULT_USER
    item_name: str
    category: Optional[str] = None


class PantryIdRequest(BaseModel):
    user_id: str = config.DEFAULT_USER
    pantry_item_id: str


class SubstituteRequest(BaseModel):
    user_id: str = config.DEFAULT_USER
    pantry_item_id: str
    new_name: str
    new_category: Optional[str] = None


class ImportBasketRequest(BaseModel):
    user_id: str = config.DEFAULT_USER
    basket_id: str
    healthy_only: bool = True


class ShoppingAddRequest(BaseModel):
    user_id: str = config.DEFAULT_USER
    items: list = []
    recipe_name: Optional[str] = None
    for_future: bool = False


class ShoppingIdRequest(BaseModel):
    user_id: str = config.DEFAULT_USER
    shopping_item_id: str


class AwardPointsRequest(BaseModel):
    user_id: str = config.DEFAULT_USER
    reason: str
    amount: Optional[int] = None


# ==========================================
# HEALTH
# ==========================================
@app.get("/")
def read_root():
    log.info("Health check hit")  # LOG
    return {
        "message": "HealthyFood Companion API is running!",
        "dataset": config.DATASET,
        "model": config.MODEL_NAME,
    }


# ==========================================
# PROFILE
# ==========================================
def _profile_nudge(pct):
    if not isinstance(pct, (int, float)):
        return "Scan a receipt to start building your healthy-eating profile."
    if pct >= 0.6:
        return "Great work - most of your basket is HealthyFood. Keep it up!"
    if pct >= 0.3:
        return "You're on your way. A few healthy swaps could push you higher."
    return "There's room to grow your HealthyFood share - try a recipe below."


def _load_profile(user_id: str):
    """The computed profile row, or None. Shared by /api/profile and /api/home."""
    rows = bq.select(
        f"SELECT * FROM `{config.USER_PROFILES}` WHERE customer_id = @user_id",
        user_id=user_id,
    )
    return rows[0] if rows else None


@app.get("/api/profile/{user_id}")
def get_user_profile(user_id: str):
    log.info("GET /api/profile/%s", user_id)  # LOG
    profile = _load_profile(user_id)
    if not profile:
        log.warning("Profile not found for user_id=%s", user_id)  # LOG
        raise HTTPException(status_code=404, detail="User not found")

    pct = profile.get("healthy_spend_pct")
    log.info("Profile loaded for user_id=%s (healthy_spend_pct=%s)", user_id, pct)  # LOG
    return {
        "status": "success",
        "data": profile,
        "insights": {
            "headline_category": profile.get("preferred_category"),
            "budget_tier": profile.get("budget_tier"),
            "healthy_spend_label": (f"{float(pct):.0%}" if isinstance(pct, (int, float)) else None),
            "nudge": _profile_nudge(pct),
        },
    }


@app.get("/api/profile/{user_id}/evolution")
def get_profile_evolution(user_id: str, first_n_baskets: int = Query(3, ge=1, le=20)):
    """
    The same profile computed two ways: on the customer's first few baskets
    ("new user") versus their whole history ("established").

    This is requirement 4.4 made visible - it shows the judges that the profile
    genuinely develops with data rather than being a static field on a row.
    """
    log.info("GET /api/profile/%s/evolution (first_n_baskets=%d)", user_id, first_n_baskets)  # LOG

    def _profile_over(limit_baskets=None):
        limit_clause = ""
        params = {"user_id": user_id, "unhealthy": config.UNHEALTHY_CATEGORY}
        if limit_baskets:
            limit_clause = f"""
                AND `Basket ID` IN (
                    SELECT basket_id FROM (
                        SELECT `Basket ID` AS basket_id,
                               MIN(`Purchase date`) AS first_seen
                        FROM `{config.RAW_TRANSACTIONS}`
                        WHERE `Customer ID` = @user_id
                        GROUP BY basket_id
                        ORDER BY first_seen ASC
                        LIMIT @basket_limit
                    )
                )
            """
            params["basket_limit"] = limit_baskets

        rows = bq.select(
            f"""
            SELECT
                COUNT(DISTINCT `Basket ID`)                    AS basket_count,
                SUM(`Line total (ZAR)`)                        AS total_spend,
                SUM(CASE WHEN `Main category` != @unhealthy
                         THEN `Line total (ZAR)` ELSE 0 END)   AS healthy_spend
            FROM `{config.RAW_TRANSACTIONS}`
            WHERE `Customer ID` = @user_id {limit_clause}
            """,
            **params,
        )
        agg = rows[0] if rows else {}

        total = float(agg.get("total_spend") or 0)
        healthy = float(agg.get("healthy_spend") or 0)
        baskets = int(agg.get("basket_count") or 0)
        avg_basket = round(total / baskets, 2) if baskets else 0.0

        if avg_basket < 400:
            tier = "budget"
        elif avg_basket < 900:
            tier = "mid"
        else:
            tier = "premium"

        top = bq.safe(
            lambda: bq.select(
                f"""
                SELECT `Main category` AS category, SUM(`Line total (ZAR)`) AS spend
                FROM `{config.RAW_TRANSACTIONS}`
                WHERE `Customer ID` = @user_id {limit_clause}
                GROUP BY category ORDER BY spend DESC LIMIT 1
                """,
                **params,
            ),
            [], "evolution_top_category",
        )

        return {
            "basket_count": baskets,
            "avg_basket_spend": avg_basket,
            "healthy_spend_pct": round(healthy / total, 3) if total else None,
            "budget_tier": tier,
            "preferred_category": top[0]["category"] if top else None,
        }

    new_user = bq.safe(lambda: _profile_over(first_n_baskets), {}, "evolution_new")
    established = bq.safe(lambda: _profile_over(None), {}, "evolution_established")
    log.info("Profile evolution computed for user_id=%s: new=%s established=%s",  # LOG
              user_id, new_user, established)

    return {
        "status": "success",
        "user_id": user_id,
        "new_user_profile": new_user,
        "established_profile": established,
    }


# ==========================================
# PANTRY
# ==========================================
@app.get("/api/pantry/{user_id}")
def get_pantry(user_id: str):
    log.info("GET /api/pantry/%s", user_id)  # LOG
    items = bq.safe(lambda: pantry_service.list_pantry(user_id), [], "list_pantry")
    log.info("Pantry for user_id=%s: %d item(s)", user_id, len(items))  # LOG
    return {"status": "success", "items": items}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    """
    Last line of defence.

    An unhandled 500 is returned by Starlette as plain text with no CORS
    headers, so the browser reports a misleading CORS violation and the real
    cause stays hidden in the server log. Returning JSON with the exception
    type and message makes every failure self-describing.
    """
    from fastapi.responses import JSONResponse

    log.exception("unhandled error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "detail": f"{type(exc).__name__}: {str(exc)[:500]}",
            "path": str(request.url.path),
        },
    )


@app.post("/api/pantry/scan")
async def scan_receipt(
    file: UploadFile = File(...),
    user_id: str = Query(config.DEFAULT_USER),
):
    """
    The second ingestion route: a photo of a slip from a non-partner shop, or a
    photo of the food itself.

    Split of responsibility is deliberate - Gemini extracts item NAMES only, the
    catalogue decides which of those are HealthyFood. The model never gets to
    assert that something is healthy.
    """
    log.info("POST /api/pantry/scan user_id=%s filename=%s content_type=%s",  # LOG
              user_id, file.filename, file.content_type)

    image_bytes = await file.read()
    if not image_bytes:
        log.warning("scan_receipt: empty file uploaded (user_id=%s)", user_id)  # LOG
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    prompt = """
    Look at this image (a grocery receipt or a photo of food).
    Extract every distinct food item you can see.
    Return ONLY a valid JSON list of strings, e.g.: ["Apples", "Full Cream Milk"]
    No markdown, no extra text.
    """
    import gemini_client

    try:
        log.info("scan_receipt: sending image to Gemini for item extraction")  # LOG
        image_part = gemini_client.build_image_part(image_bytes, file.content_type)
        response = get_model().generate_content([prompt, image_part])
        raw = (response.text or "").replace("```json", "").replace("```", "").strip()
        names = json.loads(raw)
        if not isinstance(names, list):
            raise ValueError("model did not return a list")
        names = [str(n) for n in names if str(n).strip()]
        log.info("scan_receipt: Gemini extracted %d item name(s): %s", len(names), names)  # LOG
    except (json.JSONDecodeError, ValueError) as exc:
        log.error("scan_receipt: could not parse Gemini output: %s", exc)  # LOG
        raise HTTPException(status_code=502, detail=f"Could not read items off the image: {exc}")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error("scan_receipt: vision model call failed: %s", exc)  # LOG
        raise HTTPException(status_code=502, detail=f"Vision model unavailable: {str(exc)[:200]}")

    if not names:
        log.info("scan_receipt: no food items recognised in image (user_id=%s)", user_id)  # LOG
        return {"status": "success", "classified": [], "inserted_items": [],
                "healthy_count": 0, "total_count": 0,
                "message": "No food items were recognised in that image."}

    # Everything past this point talks to BigQuery, and none of it is allowed to
    # lose the user's scan. Gemini has already done the hard part - reading the
    # slip - so a BigQuery problem downgrades the response rather than binning it.
    classified, catalogue_available = catalogue_service.classify_items(
        bq.get_client(), config.DATASET, names,
    )
    log.info("scan_receipt: classified %d item(s) against catalogue", len(classified))  # LOG

    # Only verified-healthy items go into the pantry. Exempt items are shown to
    # the user but not stored, because we can't stand behind them.
    to_store = [{
        "item_name": c["matched_item"] or c["input_name"],
        "category": c["category"] or "Uncategorised",
    } for c in classified if c["is_healthy"]]
    log.info("scan_receipt: %d of %d item(s) classified healthy, storing to pantry",  # LOG
              len(to_store), len(classified))

    saved = 0
    pantry_error = None
    if to_store:
        try:
            rows, errors = pantry_service.add_items(user_id, to_store)
            saved = 0 if errors else len(rows)
            if errors:
                pantry_error = "BigQuery rejected the pantry rows."
        except Exception as exc:  # noqa: BLE001
            log.exception("pantry insert failed")
            pantry_error = f"Could not save to your pantry: {str(exc)[:200]}"

    # Points are a nice-to-have; never fail a successful scan over them.
    points_awarded = 0
    try:
        points_service.award(user_id, "slip_scanned")
        points_awarded = points_service.POINT_VALUES["slip_scanned"]
    except Exception:  # noqa: BLE001
        log.warning("points award failed after scan (continuing)")

    healthy_count = sum(1 for c in classified if c["status"] == "healthy")
    unhealthy_count = sum(1 for c in classified if c["status"] == "unhealthy")
    exempt_count = sum(1 for c in classified if c["status"] == "exempt")

    notes = []
    if not catalogue_available:
        notes.append(
            "The HealthyFood catalogue was unreachable, so nothing could be verified. "
            "Every item is marked exempt rather than guessed at."
        )
    elif exempt_count:
        notes.append(
            f"{exempt_count} item(s) aren't in the HealthyFood catalogue, "
            "so they're exempt rather than judged."
        )
    if pantry_error:
        notes.append(pantry_error)

    rows, errors = pantry_service.add_items(user_id, to_store)
    if errors:
        log.error("scan_receipt: BigQuery insert failed for user_id=%s: %s", user_id, errors)  # LOG
        return {"status": "error", "message": "Failed to insert into BigQuery", "errors": errors}

    points_service.award(user_id, "slip_scanned")
    log.info("scan_receipt: awarded 'slip_scanned' points to user_id=%s", user_id)  # LOG

    healthy_count = sum(1 for c in classified if c["is_healthy"])
    log.info("scan_receipt: complete for user_id=%s (healthy_count=%d, total_count=%d)",  # LOG
              user_id, healthy_count, len(classified))
    return {
        "status": "success",
        "classified": classified,
        "inserted_items": [{"item_name": t["item_name"], "category": t["category"]}
                           for t in to_store] if saved else [],
        "healthy_count": healthy_count,
        "unhealthy_count": unhealthy_count,
        "exempt_count": exempt_count,
        "total_count": len(classified),
        "saved_to_pantry": saved,
        "catalogue_available": catalogue_available,
        "points_awarded": points_awarded,
        "message": " ".join(notes) or None,
    }


@app.post("/api/pantry/item")
def add_pantry_item(req: PantryItemRequest):
    """Manually add something the user has at home but never bought on a slip."""
    log.info("POST /api/pantry/item user_id=%s item_name=%s", req.user_id, req.item_name)  # LOG
    category = req.category
    if not category:
        # Try to place it in the catalogue so it gets a real category.
        matched = bq.safe(
            lambda: catalogue_service.classify_items(
                bq.get_client(), config.DATASET, [req.item_name]
            ),
            ([], False), "classify_manual_item",
        )
        results = matched[0] if isinstance(matched, tuple) else matched
        if results and results[0].get("category"):
            category = results[0]["category"]
            log.info("add_pantry_item: catalogue matched category=%s for item_name=%s",  # LOG
                      category, req.item_name)

    rows, errors = pantry_service.add_items(
        req.user_id, [{"item_name": req.item_name, "category": category}]
    )
    if errors:
        log.error("add_pantry_item: insert failed for user_id=%s: %s", req.user_id, errors)  # LOG
        raise HTTPException(status_code=500, detail="Failed to add pantry item")
    log.info("add_pantry_item: added item_name=%s for user_id=%s", req.item_name, req.user_id)  # LOG
    return {"status": "success", "items": rows}


@app.post("/api/pantry/remove")
def remove_pantry_item(req: PantryIdRequest):
    log.info("POST /api/pantry/remove user_id=%s pantry_item_id=%s",  # LOG
              req.user_id, req.pantry_item_id)
    return pantry_service.remove_item(req.user_id, req.pantry_item_id)


@app.post("/api/pantry/substitute")
def substitute_pantry_item(req: SubstituteRequest):
    """Accept a suggested healthier swap, and bank the points for it."""
    log.info("POST /api/pantry/substitute user_id=%s pantry_item_id=%s new_name=%s",  # LOG
              req.user_id, req.pantry_item_id, req.new_name)
    result = pantry_service.substitute_item(
        req.user_id, req.pantry_item_id, req.new_name, req.new_category
    )
    points_service.award(req.user_id, "swap_accepted")
    result["points_awarded"] = points_service.POINT_VALUES["swap_accepted"]
    log.info("substitute_pantry_item: swap accepted for user_id=%s, points awarded", req.user_id)  # LOG
    return result


# ==========================================
# RECEIPTS (partner baskets)
# ==========================================
@app.get("/api/receipts/{user_id}")
def get_receipts(user_id: str, limit: int = Query(8, ge=1, le=30)):
    log.info("GET /api/receipts/%s (limit=%d)", user_id, limit)  # LOG
    receipts = bq.safe(
        lambda: receipts_service.list_receipts(user_id, limit), [], "list_receipts"
    )
    log.info("get_receipts: returning %d receipt(s) for user_id=%s", len(receipts), user_id)  # LOG
    return {"status": "success", "receipts": receipts}


@app.post("/api/receipts/import")
def import_basket(req: ImportBasketRequest):
    """Pull a partner basket's HealthyFood lines into the pantry."""
    log.info("POST /api/receipts/import user_id=%s basket_id=%s healthy_only=%s",  # LOG
              req.user_id, req.basket_id, req.healthy_only)
    items = bq.safe(
        lambda: receipts_service.basket_items(req.user_id, req.basket_id, req.healthy_only),
        [], "basket_items",
    )
    if not items:
        log.info("import_basket: no HealthyFood items in basket_id=%s", req.basket_id)  # LOG
        return {"status": "empty", "message": "No HealthyFood items in that basket.",
                "items": [], "points_awarded": 0}

    rows, errors = pantry_service.add_items(req.user_id, items)
    if errors:
        log.error("import_basket: pantry insert failed for user_id=%s: %s", req.user_id, errors)  # LOG
        raise HTTPException(status_code=500, detail="Failed to import basket")

    points_service.award(req.user_id, "basket_imported")
    log.info("import_basket: imported %d item(s) for user_id=%s", len(rows), req.user_id)  # LOG
    return {
        "status": "success",
        "items": rows,
        "count": len(rows),
        "points_awarded": points_service.POINT_VALUES["basket_imported"],
    }


# ==========================================
# RECIPES
# ==========================================
@app.post("/api/recipes/generate")
def generate_recipe(req: GenerateRecipeRequest):
    """
    Personalised, catalogue-grounded recipe.

    With `zero_waste` on, the prompt is steered at whatever is closest to
    expiring, which is the pantry screen's headline action.
    """
    log.info("POST /api/recipes/generate user_id=%s zero_waste=%s recipe_length=%s",  # LOG
              req.user_id, req.zero_waste, req.recipe_length)

    focus = []
    if req.zero_waste:
        focus = [i["name"] for i in bq.safe(
            lambda: pantry_service.expiring_soon(req.user_id), [], "expiring_soon"
        )]
        log.info("generate_recipe: zero_waste focus items for user_id=%s: %s",  # LOG
                  req.user_id, focus)

    try:
        log.info("generate_recipe: calling recipe_service for user_id=%s", req.user_id)  # LOG
        result = recipe_service.generate_personalized_recipe(
            bq.get_client(), get_model(), config.DATASET, req.user_id,
            focus_items=focus, recipe_length=req.recipe_length   # NEW
        )
    except Exception as exc:  # noqa: BLE001
        log.error("generate_recipe: recipe generation failed for user_id=%s: %s",  # LOG
                   req.user_id, exc)
        raise HTTPException(status_code=502, detail=f"Recipe generation failed: {str(exc)[:200]}")

    if result.get("empty"):
        log.info("generate_recipe: empty result for user_id=%s (%s)",  # LOG
                  req.user_id, result["message"])
        return {"status": "empty", "message": result["message"]}

    log.info("generate_recipe: Gemini returned recipe_name=%s for user_id=%s",  # LOG
              result["recipe_name"], req.user_id)

    recipe_id = str(uuid.uuid4())
    bq.insert(config.SAVED_RECIPES, [{
        "recipe_id": recipe_id,
        "user_id": req.user_id,
        "recipe_name": result["recipe_name"],
        "recipe_text": result["recipe_markdown"],
        "missing_ingredients": json.dumps(result["missing_ingredients"]),
        "is_favourite": False,
        "created_at": datetime.now().isoformat(),
    }])
    log.info("generate_recipe: saved recipe_id=%s for user_id=%s", recipe_id, req.user_id)  # LOG

    reason = "zero_waste_save" if req.zero_waste else "recipe_generated"
    points_service.award(req.user_id, reason)
    log.info("generate_recipe: awarded '%s' points to user_id=%s", reason, req.user_id)  # LOG

    return {
        "status": "success",
        "recipe_id": recipe_id,
        "recipe_name": result["recipe_name"],
        "recipe": result["recipe_markdown"],
        "missing_ingredients": result["missing_ingredients"],
        "used_pantry_items": result.get("used_pantry_items", []),
        "focus_items": focus,
        "recipe_length": result.get("recipe_length"),   # NEW — echo it back
        "personalized_for": result["personalized_for"],
        "points_awarded": points_service.POINT_VALUES[reason],
    }


@app.get("/api/recipes/{user_id}")
def list_recipes(user_id: str):
    log.info("GET /api/recipes/%s", user_id)  # LOG
    rows = bq.safe(
        lambda: bq.select(
            f"""
            SELECT recipe_id, recipe_name, recipe_text, missing_ingredients,
                   is_favourite, created_at
            FROM `{config.SAVED_RECIPES}`
            WHERE user_id = @user_id
            ORDER BY created_at DESC
            LIMIT 20
            """,
            user_id=user_id,
        ),
        [], "list_recipes",
    )

    recipes = []
    for row in rows:
        try:
            row["missing_ingredients"] = json.loads(row.get("missing_ingredients") or "[]")
        except (json.JSONDecodeError, TypeError):
            row["missing_ingredients"] = []
        recipes.append(row)
    log.info("list_recipes: returning %d saved recipe(s) for user_id=%s", len(recipes), user_id)  # LOG
    return {"status": "success", "recipes": recipes}


# ==========================================
# SHOPPING LIST
# ==========================================
@app.get("/api/shopping/{user_id}")
def get_shopping(user_id: str):
    log.info("GET /api/shopping/%s", user_id)  # LOG
    items = bq.safe(lambda: shopping_service.list_shopping(user_id), [], "list_shopping")
    log.info("get_shopping: returning %d item(s) for user_id=%s", len(items), user_id)  # LOG
    return {"status": "success", "items": items}


@app.post("/api/shopping/add")
def add_shopping(req: ShoppingAddRequest):
    log.info("POST /api/shopping/add user_id=%s items=%d recipe_name=%s",  # LOG
              req.user_id, len(req.items), req.recipe_name)
    rows, errors = shopping_service.add_items(
        req.user_id, req.items, req.recipe_name, req.for_future
    )
    if errors:
        log.error("add_shopping: failed for user_id=%s: %s", req.user_id, errors)  # LOG
        raise HTTPException(status_code=500, detail="Failed to add to shopping list")
    log.info("add_shopping: added %d item(s) for user_id=%s", len(rows), req.user_id)  # LOG
    return {"status": "success", "added": len(rows), "items": rows}


@app.post("/api/shopping/bought")
def buy_shopping(req: ShoppingIdRequest):
    log.info("POST /api/shopping/bought user_id=%s shopping_item_id=%s",  # LOG
              req.user_id, req.shopping_item_id)
    result = shopping_service.mark_bought(req.user_id, req.shopping_item_id)
    if result["status"] == "not_found":
        log.warning("buy_shopping: shopping_item_id=%s not found for user_id=%s",  # LOG
                     req.shopping_item_id, req.user_id)
        raise HTTPException(status_code=404, detail="Shopping item not found")
    points_service.award(req.user_id, "item_bought")
    result["points_awarded"] = points_service.POINT_VALUES["item_bought"]
    log.info("buy_shopping: marked bought for user_id=%s, points awarded", req.user_id)  # LOG
    return result


@app.post("/api/shopping/remove")
def remove_shopping(req: ShoppingIdRequest):
    log.info("POST /api/shopping/remove user_id=%s shopping_item_id=%s",  # LOG
              req.user_id, req.shopping_item_id)
    return shopping_service.remove_item(req.user_id, req.shopping_item_id)


# ==========================================
# INSIGHTS
# ==========================================
@app.get("/api/insights/{user_id}")
def get_insights(user_id: str):
    """Habit observations, concrete swaps, and the monthly healthy-share trend."""
    log.info("GET /api/insights/%s", user_id)  # LOG
    result = {
        "status": "success",
        "insights": bq.safe(lambda: insights_service.habit_insights(user_id), [], "insights"),
        "swaps": bq.safe(lambda: insights_service.swap_suggestions(user_id), [], "swaps"),
        "trend": bq.safe(lambda: insights_service.monthly_trend(user_id), [], "trend"),
    }
    log.info("get_insights: computed insights for user_id=%s", user_id)  # LOG
    return result


# ==========================================
# REWARDS & POINTS
# ==========================================
@app.get("/api/rewards")
def list_rewards():
    log.info("GET /api/rewards")  # LOG
    rewards = bq.safe(
        lambda: bq.select(
            f"""
            SELECT reward_id, reward_name, partner_name, points_required,
                   vouchers_required, reward_type, is_active
            FROM `{config.REWARDS_CATALOG}`
            WHERE is_active = TRUE
            ORDER BY points_required
            """
        ),
        [], "list_rewards",
    )
    log.info("list_rewards: %d active reward(s)", len(rewards))  # LOG
    return {"status": "success", "rewards": rewards}


@app.get("/api/points/{user_id}")
def get_points(user_id: str):
    log.info("GET /api/points/%s", user_id)  # LOG
    profile = bq.safe(lambda: _load_profile(user_id), None, "points_profile") or {}
    base = int(profile.get("vitality_points") or 0)
    summary = points_service.balance(user_id, base_points=base)
    log.info("get_points: balance for user_id=%s: %s", user_id, summary)  # LOG
    return {
        "status": "success",
        **summary,
        "badges": points_service.badges(user_id),
        "challenges": points_service.challenges(user_id),
        "point_values": points_service.POINT_VALUES,
    }


@app.post("/api/points/award")
def award_points(req: AwardPointsRequest):
    log.info("POST /api/points/award user_id=%s reason=%s amount=%s",  # LOG
              req.user_id, req.reason, req.amount)
    return points_service.award(req.user_id, req.reason, req.amount)


@app.post("/api/rewards/claim")
def claim_reward(req: ClaimRewardRequest):
    log.info("POST /api/rewards/claim user_id=%s reward_id=%s", req.user_id, req.reward_id)  # LOG
    rewards = bq.safe(
        lambda: bq.select(
            f"""
            SELECT reward_id, reward_name, points_required
            FROM `{config.REWARDS_CATALOG}`
            WHERE reward_id = @reward_id
            """,
            reward_id=req.reward_id,
        ),
        [], "claim_lookup",
    )
    if not rewards:
        log.warning("claim_reward: reward_id=%s not found", req.reward_id)  # LOG
        raise HTTPException(status_code=404, detail="Reward not found")

    reward = rewards[0]
    required = int(reward.get("points_required") or 0)

    profile = bq.safe(lambda: _load_profile(req.user_id), None, "claim_profile") or {}
    base = int(profile.get("vitality_points") or 0)
    current = points_service.balance(req.user_id, base_points=base)["balance"]

    if current < required:
        log.info("claim_reward: user_id=%s insufficient points (has %d, needs %d)",  # LOG
                  req.user_id, current, required)
        raise HTTPException(
            status_code=400,
            detail=f"You need {required - current} more points to claim this reward.",
        )

    claim_result = points_service.claim_reward(
        req.user_id,
        reward.get("reward_name"),
        required,
    )
    if claim_result["status"] != "success":
        log.error("claim_reward: claim_reward() failed for user_id=%s reward_id=%s",  # LOG
                   req.user_id, req.reward_id)
        raise HTTPException(status_code=500, detail="Could not claim reward")

    log.info("claim_reward: user_id=%s claimed reward_id=%s (voucher_code=%s)",  # LOG
              req.user_id, req.reward_id, claim_result["voucher_code"])

    return {
        "status": "success",
        "voucher_code": claim_result["voucher_code"],
        "reward_name": claim_result["reward_name"],
        "points_spent": claim_result["points_spent"],
        "message": claim_result["message"],
    }


# ==========================================
# AGGREGATE HYDRATION
# ==========================================
@app.get("/api/home/{user_id}")
def get_home(user_id: str):
    """
    Everything the app needs on load, in one request.

    Each section is independently guarded: if the rewards catalogue is missing,
    the user still gets their pantry. Partial data beats a blank screen.
    """
    log.info("GET /api/home/%s (full hydration)", user_id)  # LOG
    profile = bq.safe(lambda: _load_profile(user_id), None, "home_profile")
    base_points = int((profile or {}).get("vitality_points") or 0)

    result = {
        "status": "success",
        "user_id": user_id,
        "profile": profile,
        "pantry": bq.safe(lambda: pantry_service.list_pantry(user_id), [], "home_pantry"),
        "receipts": bq.safe(lambda: receipts_service.list_receipts(user_id), [], "home_receipts"),
        "shopping": bq.safe(lambda: shopping_service.list_shopping(user_id), [], "home_shopping"),
        "insights": bq.safe(lambda: insights_service.habit_insights(user_id), [], "home_insights"),
        "swaps": bq.safe(lambda: insights_service.swap_suggestions(user_id), [], "home_swaps"),
        "trend": bq.safe(lambda: insights_service.monthly_trend(user_id), [], "home_trend"),
        "points": bq.safe(
            lambda: points_service.balance(user_id, base_points),
            {"balance": base_points, "earned_in_app": 0, "events": 0}, "home_points",
        ),
        "badges": bq.safe(lambda: points_service.badges(user_id), [], "home_badges"),
        "challenges": bq.safe(lambda: points_service.challenges(user_id), [], "home_challenges"),
        "rewards": bq.safe(
            lambda: bq.select(
                f"""
                SELECT reward_id, reward_name, partner_name, points_required,
                       vouchers_required, reward_type
                FROM `{config.REWARDS_CATALOG}`
                WHERE is_active = TRUE ORDER BY points_required
                """
            ),
            [], "home_rewards",
        ),
    }
    log.info("get_home: hydration complete for user_id=%s", user_id)  # LOG
    return result


@app.get("/api/users")
def list_users(limit: int = Query(25, ge=1, le=200)):
    """
    A few real customer IDs from the dataset, so the demo can switch personas
    without anyone having to remember an ID.
    """
    log.info("GET /api/users (limit=%d)", limit)  # LOG
    rows = bq.safe(
        lambda: bq.select(
            f"""
            SELECT `Customer ID` AS user_id, ANY_VALUE(`Customer name`) AS name,
                   COUNT(DISTINCT `Basket ID`) AS baskets
            FROM `{config.RAW_TRANSACTIONS}`
            GROUP BY user_id
            ORDER BY baskets DESC
            LIMIT @lim
            """,
            lim=limit,
        ),
        [], "list_users",
    )
    return {"status": "success", "users": rows}
    log.info("list_users: returning %d user(s)", len(rows))  # LOG
    return {"status": "success", "users": rows}