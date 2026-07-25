"""
insights_service.py
-------------------
The "learn from my habits" half of the spec (requirements 4.1, 4.2 and 4.4).

Three things come out of here, all computed from the customer's own till-slip
history rather than hardcoded:

  1. habit insights  - "you've bought sugary drinks 6 times this month"
  2. swap suggestions - a concrete healthier product from the real catalogue,
                        chosen to replace a repeat unhealthy purchase
  3. monthly trend    - healthy vs unhealthy share of spend, month by month,
                        which is what the Rewards screen graphs

The swap logic is the part worth explaining to the judges: we do not ask an LLM
"what's healthier than a chocolate bar". We map the unhealthy *subcategory* the
customer actually buys onto the HealthyFood category that displaces it
nutritionally, then pick a real catalogue item from that category, preferring
the retailer the customer already shops at. That keeps every recommendation
grounded in a product they can genuinely put in their basket.
"""

import bq
import config

# ---------------------------------------------------------------------------
# SWAP MAP
# ---------------------------------------------------------------------------
# Unhealthy subcategory (from the dataset taxonomy) -> HealthyFood Main category
# that sensibly replaces it, plus the message we show the user.
SWAP_MAP = {
    "Sugary foods": {
        "to_category": "Fruit and vegetables",
        "reason": "Fresh fruit satisfies the same sweet craving with fibre and no added sugar.",
    },
    "Sugary drinks": {
        "to_category": "Dairy",
        "reason": "Swapping one cooldrink a day for milk or an unsweetened alternative cuts a lot of liquid sugar.",
    },
    "High fat, baked and fried items": {
        "to_category": "Whole grains and high-fibre starchy foods",
        "reason": "A high-fibre starch keeps you full for longer than a baked or fried item, for a similar price.",
    },
    "Snacks and condiments high in salt": {
        "to_category": "Oils, nuts and seeds",
        "reason": "Nuts and seeds scratch the salty-snack itch with healthy fats instead of added salt.",
    },
}

# Tone used by the UI to colour the insight card.
GOOD, WARN, INFO = "good", "warn", "info"


# ---------------------------------------------------------------------------
# RAW SIGNALS
# ---------------------------------------------------------------------------
def _repeat_unhealthy(user_id: str, months: int = 3, limit: int = 5):
    """The unhealthy items this customer buys most often, most-bought first."""
    return bq.select(
        f"""
        SELECT `Food / item`           AS item_name,
               `Main category`         AS category,
               `Section / subcategory` AS subcategory,
               Retailer                AS retailer,
               COUNT(*)                AS times_bought,
               SUM(`Line total (ZAR)`) AS total_spend
        FROM `{config.RAW_TRANSACTIONS}`
        WHERE `Customer ID` = @user_id
          AND `Main category` = @unhealthy
          AND `Purchase date` >= DATE_SUB(CURRENT_DATE(), INTERVAL @months MONTH)
        GROUP BY item_name, category, subcategory, retailer
        HAVING times_bought >= 2
        ORDER BY times_bought DESC, total_spend DESC
        LIMIT @lim
        """,
        user_id=user_id, unhealthy=config.UNHEALTHY_CATEGORY,
        months=months, lim=limit,
    )


def _top_healthy(user_id: str, months: int = 3, limit: int = 3):
    """What they're already doing well — so the app isn't only ever nagging."""
    return bq.select(
        f"""
        SELECT `Main category`         AS category,
               `Section / subcategory` AS subcategory,
               COUNT(*)                AS times_bought
        FROM `{config.RAW_TRANSACTIONS}`
        WHERE `Customer ID` = @user_id
          AND `Main category` != @unhealthy
          AND `Purchase date` >= DATE_SUB(CURRENT_DATE(), INTERVAL @months MONTH)
        GROUP BY category, subcategory
        ORDER BY times_bought DESC
        LIMIT @lim
        """,
        user_id=user_id, unhealthy=config.UNHEALTHY_CATEGORY,
        months=months, lim=limit,
    )


def _catalogue_pick(category: str, retailer: str = None):
    """
    One real catalogue product from `category`, preferring the retailer the
    customer already shops at so the suggestion is actually actionable.
    """
    rows = bq.select(
        f"""
        SELECT item_name, category, subcategory, retailer, classification
        FROM `{config.FOOD_CATALOGUE}`
        WHERE LOWER(category) = LOWER(@category)
          AND LOWER(COALESCE(classification, 'healthy')) != 'unhealthy'
        ORDER BY
          CASE WHEN LOWER(COALESCE(retailer, '')) = LOWER(@retailer) THEN 0 ELSE 1 END,
          item_name
        LIMIT 1
        """,
        category=category, retailer=retailer or "",
    )
    return rows[0] if rows else None


# ---------------------------------------------------------------------------
# PUBLIC API
# ---------------------------------------------------------------------------
def habit_insights(user_id: str, months: int = 3):
    """Short, human-readable observations about this customer's shopping."""
    insights = []

    repeats = bq.safe(lambda: _repeat_unhealthy(user_id, months), [], "repeat_unhealthy")
    for i, row in enumerate(repeats[:2]):
        insights.append({
            "id": f"habit-{i}",
            "icon": "wheat",
            "tone": WARN,
            "title": f"Cut back on {str(row['item_name']).lower()}",
            "detail": (
                f"{row['times_bought']} buys in the last {months} months "
                f"(R{float(row.get('total_spend') or 0):.0f} spent). "
                f"There's a healthier swap below."
            ),
        })

    tops = bq.safe(lambda: _top_healthy(user_id, months), [], "top_healthy")
    for i, row in enumerate(tops[:1]):
        insights.append({
            "id": f"good-{i}",
            "icon": "salad",
            "tone": GOOD,
            "title": f"Strong on {str(row['subcategory'] or row['category']).lower()}",
            "detail": f"{row['times_bought']} purchases recently — this is your best habit, keep it going.",
        })

    if not insights:
        insights.append({
            "id": "empty",
            "icon": "droplet",
            "tone": INFO,
            "title": "Building your profile",
            "detail": "Import a basket or scan a slip and your habit insights will appear here.",
        })
    return insights


def swap_suggestions(user_id: str, months: int = 3, limit: int = 3):
    """
    Concrete product swaps: repeat unhealthy purchase -> real catalogue item.

    Returns [{ from, to, reason, category, retailer }]
    """
    repeats = bq.safe(lambda: _repeat_unhealthy(user_id, months), [], "repeat_unhealthy")
    out = []
    for row in repeats:
        rule = SWAP_MAP.get(row.get("subcategory"))
        if not rule:
            continue
        pick = bq.safe(
            lambda: _catalogue_pick(rule["to_category"], row.get("retailer")),
            None, "catalogue_pick",
        )
        if not pick:
            continue
        out.append({
            "from": row["item_name"],
            "to": pick["item_name"],
            "reason": (
                f"You've bought this {row['times_bought']} times recently. "
                + rule["reason"]
            ),
            "category": pick.get("category"),
            "retailer": pick.get("retailer"),
            "timesBought": row["times_bought"],
        })
        if len(out) >= limit:
            break
    return out


def monthly_trend(user_id: str, months: int = 3):
    """
    Healthy vs unhealthy share of spend per month — the Rewards screen chart.
    Returns [{ month, healthy, unhealthy }] oldest-first, values are percentages.
    """
    rows = bq.select(
        f"""
        SELECT
            FORMAT_DATE('%b', `Purchase date`) AS month_label,
            DATE_TRUNC(`Purchase date`, MONTH) AS month_start,
            SUM(CASE WHEN `Main category` != @unhealthy
                     THEN `Line total (ZAR)` ELSE 0 END) AS healthy_spend,
            SUM(`Line total (ZAR)`)                      AS total_spend
        FROM `{config.RAW_TRANSACTIONS}`
        WHERE `Customer ID` = @user_id
          AND `Purchase date` >= DATE_SUB(CURRENT_DATE(), INTERVAL @months MONTH)
        GROUP BY month_label, month_start
        ORDER BY month_start
        """,
        user_id=user_id, unhealthy=config.UNHEALTHY_CATEGORY, months=months,
    )

    trend = []
    for r in rows:
        total = float(r.get("total_spend") or 0)
        healthy = float(r.get("healthy_spend") or 0)
        pct = round(100 * healthy / total) if total else 0
        trend.append({
            "month": r["month_label"],
            "healthy": pct,
            "unhealthy": 100 - pct,
        })
    return trend


def price_comparison(item_name: str):
    """
    What this item costs at each partner, from actual observed till-slip prices.

    Powers the Shopping screen's "best price" rows. Averaging real transaction
    prices is more honest than inventing a price list, and it naturally reflects
    that the two retailers price differently.
    """
    rows = bq.select(
        f"""
        SELECT Retailer                     AS name,
               AVG(`Unit price (ZAR)`)      AS price,
               COUNT(*)                     AS observations,
               ANY_VALUE(`Main category`)   AS category
        FROM `{config.RAW_TRANSACTIONS}`
        WHERE LOWER(`Food / item`) = LOWER(@item_name)
        GROUP BY name
        ORDER BY price
        """,
        item_name=item_name,
    )
    return [{
        "name": r["name"],
        "price": round(float(r.get("price") or 0), 2),
        "healthy": (r.get("category") or "").strip().lower() != config.UNHEALTHY_CATEGORY.lower(),
        "observations": r.get("observations"),
    } for r in rows]
