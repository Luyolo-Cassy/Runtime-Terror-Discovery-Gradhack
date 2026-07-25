from flask import Flask, jsonify
from google.cloud import bigquery
from collections import defaultdict
import statistics

app = Flask(__name__)
bq = bigquery.Client()

TABLE = "gradhack26jnb-408.HealthyFood.dataset"
PREFERENCES_TABLE = "gradhack26jnb-408.HealthyFood.user_preferences"
UNHEALTHY_CATEGORY = "Unhealthy foods"

# Fields a user is allowed to explicitly override on their profile.
OVERRIDABLE_FIELDS = {"goal", "inferred_budget_tier", "preferred_retailer"}


def get_declared_overrides(user_id: str) -> dict:
    """
    Reads any explicitly declared preferences for this user and returns
    only the fields that are non-null, i.e. the ones the user actually set.

    Assumes a table with one row per user, one column per overridable field.
    Un-set preferences are stored as NULL rather than an empty row.
    """
    query = f"""
        SELECT
            goal,
            inferred_budget_tier,
            preferred_retailer
        FROM `{PREFERENCES_TABLE}`
        WHERE `Customer ID` = @user_id
        LIMIT 1
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("user_id", "STRING", user_id)
        ]
    )

    try:
        rows = list(bq.query(query, job_config=job_config).result())
    except Exception as e:
        # If the preferences table is missing, empty, or the query fails,
        # fail safe: no overrides, rest of the profile still works.
        app.logger.warning(f"Could not fetch overrides for {user_id}: {e}")
        return {}

    if not rows:
        return {}

    row = rows[0]
    overrides = {}

    for field in OVERRIDABLE_FIELDS:
        value = getattr(row, field, None)
        if value is not None and value != "":
            overrides[field] = value

    return overrides


def fetch_purchase_history(user_id: str, basket_limit: int = None):
    # Column names confirmed against the team's real BigQuery schema
    # (see backend/main.py on the Leruo+Alessio_Merge branch):
    # `Purchase date` (lowercase "date") and `Line total (ZAR)`, already
    # numeric — not `Purchase Date` / `Line total` as originally assumed.
    query = f"""
        SELECT
            `Basket ID` AS basket_id,
            `Purchase date` AS purchase_date,
            Retailer AS retailer,
            `Main category` AS category,
            `Section subcategory` AS subcategory,
            Quantity AS quantity,
            `Line total (ZAR)` AS line_total
        FROM `{TABLE}`
        WHERE `Customer ID` = @user_id
        ORDER BY `Purchase date` ASC
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("user_id", "STRING", user_id)
        ]
    )

    rows = list(bq.query(query, job_config=job_config).result())

    if basket_limit:
        seen_baskets = []
        limited_rows = []

        for r in rows:
            if r.basket_id not in seen_baskets:
                if len(seen_baskets) >= basket_limit:
                    break
                seen_baskets.append(r.basket_id)

            limited_rows.append(r)

        rows = limited_rows

    return rows


def build_profile(rows) -> dict:
    if not rows:
        return {
            "spend_by_category": {},
            "healthy_unhealthy_ratio": None,
            "inferred_budget_tier": None,
            "preferred_retailer": None,
            "avg_basket_value": 0,
            "goal": "",
            "basket_count": 0,
        }

    spend_by_category = defaultdict(float)
    retailer_counts = defaultdict(int)
    basket_totals = defaultdict(float)

    healthy_spend = 0.0
    unhealthy_spend = 0.0

    for r in rows:
        amount = r.line_total if r.line_total is not None else 0.0

        category = r.category or "Unknown"
        retailer = r.retailer or "Unknown"

        spend_by_category[category] += amount
        retailer_counts[retailer] += 1
        basket_totals[r.basket_id] += amount

        if category == UNHEALTHY_CATEGORY:
            unhealthy_spend += amount
        else:
            healthy_spend += amount

    total_spend = healthy_spend + unhealthy_spend

    healthy_ratio = (
        round(healthy_spend / total_spend, 3)
        if total_spend > 0
        else None
    )

    preferred_retailer = max(retailer_counts, key=retailer_counts.get)

    avg_basket = (
        statistics.mean(basket_totals.values())
        if basket_totals
        else 0
    )

    if avg_basket < 400:
        budget_tier = "budget"
    elif avg_basket < 900:
        budget_tier = "mid"
    else:
        budget_tier = "premium"

    return {
        "spend_by_category": {
            k: round(v, 2) for k, v in spend_by_category.items()
        },
        "healthy_unhealthy_ratio": healthy_ratio,
        "inferred_budget_tier": budget_tier,
        "avg_basket_value": round(avg_basket, 2),
        "preferred_retailer": preferred_retailer,
        "goal": "",
        "basket_count": len(basket_totals),
    }


def apply_overrides(profile: dict, overrides: dict) -> dict:
    """
    Declared preferences win over inferred values, but only for fields
    that are both overridable and present in the profile schema.
    """
    for field, value in overrides.items():
        if field in OVERRIDABLE_FIELDS and field in profile:
            profile[field] = value
    return profile


@app.route("/")
def health():
    return "profile-service ok"


@app.route("/profile/<user_id>")
def get_profile(user_id):
    rows = fetch_purchase_history(user_id)
    profile = build_profile(rows)
    overrides = get_declared_overrides(user_id)
    profile = apply_overrides(profile, overrides)

    return jsonify({
        "user_id": user_id,
        **profile
    })


@app.route("/profile/<user_id>/evolution")
def get_profile_evolution(user_id):
    new_user_rows = fetch_purchase_history(user_id, basket_limit=3)
    established_rows = fetch_purchase_history(user_id)

    new_profile = build_profile(new_user_rows)
    established_profile = build_profile(established_rows)

    overrides = get_declared_overrides(user_id)
    new_profile = apply_overrides(new_profile, overrides)
    established_profile = apply_overrides(established_profile, overrides)

    return jsonify({
        "user_id": user_id,
        "new_user_profile": new_profile,
        "established_profile": established_profile,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
