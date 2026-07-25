"""
recipe_service.py
------------------
Personalised, catalogue-grounded recipe generation for HealthyFood Companion.

This is the piece that connects the three things you built in BigQuery:
  - user_pantry     -> what the user already has
  - user_profiles   -> budget_tier, preferred_category, healthy_spend_pct (the computed profile)
  - foodCatalogue   -> real Woolworths/Checkers HealthyFood items (so "missing items" are real)

It is deliberately defensive so it never hard-fails during a live demo:
  - if the profile is missing, it still generates a recipe (just less personalised)
  - if the healthy-classification filter matches nothing, it falls back to the full catalogue
  - if Gemini returns non-JSON, it falls back to treating the reply as a plain recipe

Drop this file next to main.py and call generate_personalized_recipe(...) from the endpoint.
"""

import json
from google.cloud import bigquery

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
# foodCatalogue.classification carries a "healthy" value (the same catalogue match
# that drives healthy_spend in the user_profiles view). Matching is case-insensitive
# on the column, so "Healthy"/"HEALTHY"/"healthy" all work. If the filter ever returns
# nothing, the code falls back to the whole catalogue so a demo never breaks.
HEALTHY_TERMS = ["healthy"]

CATALOGUE_SAMPLE_SIZE = 40   # how many catalogue items to show Gemini as options


# ---------------------------------------------------------------------------
# DATA ACCESS  (all reads go through your clean tables/views, never `dataset`
# directly, so we avoid the spaced column names like "Customer ID")
# ---------------------------------------------------------------------------
def get_available_pantry(bq_client, dataset: str, user_id: str):
    """Item names the user currently has available."""
    query = f"""
        SELECT item_name
        FROM `{dataset}.user_pantry`
        WHERE user_id = @user_id AND status = 'available'
    """
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id)
    ])
    return [row["item_name"] for row in bq_client.query(query, job_config=cfg)]


def get_user_profile_lite(bq_client, dataset: str, user_id: str):
    """The computed profile used to personalise the recipe. Returns dict or None."""
    query = f"""
        SELECT customer_id, customer_name, vitality_tier,
               healthy_spend_pct, budget_tier, preferred_category, avg_basket_spend
        FROM `{dataset}.user_profiles`
        WHERE customer_id = @user_id
    """
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id)
    ])
    rows = list(bq_client.query(query, job_config=cfg))
    return dict(rows[0]) if rows else None


def get_healthy_catalogue(bq_client, dataset: str, limit: int = CATALOGUE_SAMPLE_SIZE):
    """
    Real HealthyFood catalogue items to offer as 'missing ingredients'.
    Tries the healthy filter first; if that returns nothing (because our guessed
    classification tokens don't match your data), falls back to the full catalogue.
    """
    base = f"""
        SELECT item_name, category, subcategory, retailer, classification
        FROM `{dataset}.foodCatalogue`
    """
    filtered = base + " WHERE LOWER(classification) IN UNNEST(@terms) LIMIT @lim"
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ArrayQueryParameter("terms", "STRING", HEALTHY_TERMS),
        bigquery.ScalarQueryParameter("lim", "INT64", limit),
    ])
    rows = [dict(r) for r in bq_client.query(filtered, job_config=cfg)]

    if not rows:  # fallback: classification tokens didn't match — use whole catalogue
        cfg2 = bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("lim", "INT64", limit)
        ])
        rows = [dict(r) for r in bq_client.query(base + " LIMIT @lim", job_config=cfg2)]
    return rows


# ---------------------------------------------------------------------------
# PROMPT + PARSING
# ---------------------------------------------------------------------------
def build_prompt(pantry, profile, catalogue, focus_items=None):
    """
    Assemble a grounded, personalised prompt that asks Gemini for strict JSON.

    `focus_items` drives the zero-waste path: when the pantry screen asks for a
    recipe built around what's about to expire, those item names are passed here
    and the model is told to prioritise them.
    """
    catalogue_names = [c["item_name"] for c in catalogue if c.get("item_name")]

    urgency = ""
    if focus_items:
        urgency = (
            "\nThese pantry items are closest to expiring. The recipe MUST use as many "
            "of them as sensibly possible, so the customer doesn't waste them:\n"
            f"{', '.join(focus_items)}\n"
        )

    # Turn the profile into plain-language guidance the model can act on.
    if profile:
        tier = profile.get("budget_tier") or "unknown"
        pref = profile.get("preferred_category") or "no strong preference"
        pct = profile.get("healthy_spend_pct")
        pct_txt = f"{float(pct):.0%}" if isinstance(pct, (int, float)) else "unknown"
        persona = (
            f"- Budget tier: {tier} (respect this; suggest affordable swaps if the tier is low).\n"
            f"- Usual favourite category: {pref}.\n"
            f"- Share of spend currently on healthy food: {pct_txt} "
            f"(if this is low, gently steer toward healthier choices).\n"
            f"- Vitality tier: {profile.get('vitality_tier') or 'unknown'}."
        )
    else:
        persona = "- No profile on file yet; keep the recipe broadly healthy and budget-friendly."

    return f"""You are a professional nutritionist and chef for the Discovery HealthyFood Companion app.

The user already has these pantry items:
{', '.join(pantry)}
{urgency}
What we know about this user:
{persona}

These are real HealthyFood catalogue items available at partner stores. When you list
things the user still needs to buy ("missing_ingredients"), you MUST choose ONLY from
this list, copying the names EXACTLY. Do not invent items that are not here:
{', '.join(catalogue_names) if catalogue_names else '(no catalogue items available)'}

Create ONE quick, healthy recipe that mostly uses the pantry items, fits the user's budget
and preferences, and requires only a few missing_ingredients from the catalogue list above.
You may assume basic staples (salt, pepper, oil, water).

Respond with ONLY valid JSON, no markdown fences, in exactly this shape:
{{
  "recipe_name": "A short catchy title",
  "recipe_markdown": "# Title\\nA one-line description.\\n\\n**Prep:** X min | **Cook:** Y min\\n\\n## Ingredients\\n- ...\\n\\n## Steps\\n1. ...",
  "missing_ingredients": ["Exact Catalogue Item Name", "Another Exact Name"]
}}"""


def parse_ai_json(text: str):
    """Robustly parse Gemini's reply. Never raises — returns a dict with our keys."""
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        # strip ```json ... ``` or ``` ... ```
        cleaned = cleaned.split("```", 2)[1] if cleaned.count("```") >= 2 else cleaned.strip("`")
        if cleaned.lstrip().lower().startswith("json"):
            cleaned = cleaned.lstrip()[4:]
    cleaned = cleaned.strip("` \n")
    try:
        data = json.loads(cleaned)
        return {
            "recipe_name": data.get("recipe_name") or "AI Generated Healthy Meal",
            "recipe_markdown": data.get("recipe_markdown") or text,
            "missing_ingredients": data.get("missing_ingredients") or [],
        }
    except (json.JSONDecodeError, AttributeError):
        # Fallback: treat the whole reply as the recipe body so the demo never breaks.
        return {
            "recipe_name": "AI Generated Healthy Meal",
            "recipe_markdown": text or "",
            "missing_ingredients": [],
        }


def enrich_missing(missing_names, catalogue):
    """Match the names Gemini returned back to real catalogue rows (retailer/category)."""
    lookup = {c["item_name"].strip().lower(): c
              for c in catalogue if c.get("item_name")}
    enriched = []
    for name in missing_names:
        if not isinstance(name, str):
            continue
        hit = lookup.get(name.strip().lower())
        if hit:
            enriched.append({
                "item_name": hit["item_name"],
                "retailer": hit.get("retailer"),
                "category": hit.get("category"),
            })
        else:
            enriched.append({"item_name": name, "retailer": None, "category": None})
    return enriched


# ---------------------------------------------------------------------------
# ORCHESTRATOR  (call this from the endpoint)
# ---------------------------------------------------------------------------
def generate_personalized_recipe(bq_client, model, dataset: str, user_id: str,
                                 focus_items=None):
    """
    Returns a dict ready to serialise as the API response.

    `focus_items` (optional) is a list of pantry item names to build the recipe
    around - used by the zero-waste path, which passes whatever is expiring.
    """
    pantry = get_available_pantry(bq_client, dataset, user_id)
    if not pantry:
        return {"empty": True, "message": "Pantry is empty. Scan a receipt first!"}

    profile = get_user_profile_lite(bq_client, dataset, user_id)
    catalogue = get_healthy_catalogue(bq_client, dataset)

    prompt = build_prompt(pantry, profile, catalogue, focus_items)
    ai_raw = model.generate_content(prompt).text
    ai = parse_ai_json(ai_raw)
    missing = enrich_missing(ai["missing_ingredients"], catalogue)

    personalized_for = None
    if profile:
        personalized_for = {
            "budget_tier": profile.get("budget_tier"),
            "preferred_category": profile.get("preferred_category"),
            "healthy_spend_pct": profile.get("healthy_spend_pct"),
            "vitality_tier": profile.get("vitality_tier"),
        }

    return {
        "empty": False,
        "recipe_name": ai["recipe_name"],
        "recipe_markdown": ai["recipe_markdown"],
        "missing_ingredients": missing,          # list of {item_name, retailer, category}
        "used_pantry_items": pantry,
        "focus_items": focus_items or [],
        "personalized_for": personalized_for,    # None if no profile yet
    }