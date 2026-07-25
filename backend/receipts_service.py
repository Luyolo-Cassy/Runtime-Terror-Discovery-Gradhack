"""
receipts_service.py
-------------------
Turns the supplied till-slip data into the "partner baskets" the Receipts
screen shows.

This is the honest version of that screen. The spec says Woolworths and
Checkers already identify HealthyFood at the till and push the slip through to
Discovery — so in our prototype a partner basket is not a photo the user has to
scan, it is a `Basket ID` we already hold. Grouping the raw dataset by basket
gives us exactly that: a dated slip, per retailer, with every line already
classified by the catalogue taxonomy.

The scanned-slip path (a photo of a non-partner receipt) is the other ingestion
route and lives in main.py's /api/pantry/scan, which uses Gemini for OCR.
"""

import bq
import config


def _healthy(main_category: str) -> bool:
    """
    In the supplied taxonomy every Main category is a HealthyFood classification
    group except one. Keeping this in a single function means the definition of
    "healthy" lives in exactly one place across the whole backend.
    """
    return (main_category or "").strip().lower() != config.UNHEALTHY_CATEGORY.lower()


def list_receipts(user_id: str, limit_baskets: int = 8):
    """
    Recent partner baskets for this customer, newest first, shaped for the UI.

    Returns a list of:
      { id, store, date, source, partner, imported, total, healthyRatio, items[] }
    """
    rows = bq.select(
        f"""
        WITH recent AS (
            SELECT DISTINCT `Basket ID` AS basket_id, `Purchase date` AS purchase_date
            FROM `{config.RAW_TRANSACTIONS}`
            WHERE `Customer ID` = @user_id
            ORDER BY purchase_date DESC
            LIMIT @lim
        )
        SELECT
            t.`Basket ID`             AS basket_id,
            t.`Purchase date`         AS purchase_date,
            t.Retailer                AS retailer,
            t.`Food / item`           AS item_name,
            t.`Main category`         AS category,
            t.`Section / subcategory` AS subcategory,
            t.Quantity                AS quantity,
            t.`Line total (ZAR)`      AS line_total
        FROM `{config.RAW_TRANSACTIONS}` t
        JOIN recent r ON r.basket_id = t.`Basket ID`
        WHERE t.`Customer ID` = @user_id
        ORDER BY t.`Purchase date` DESC, t.`Basket ID`
        """,
        user_id=user_id, lim=limit_baskets,
    )

    baskets = {}
    order = []
    for r in rows:
        bid = r["basket_id"]
        if bid not in baskets:
            order.append(bid)
            purchase_date = r.get("purchase_date")
            baskets[bid] = {
                "id": bid,
                "store": f"{r.get('retailer') or 'Partner store'}",
                "date": str(purchase_date)[:10] if purchase_date else "",
                "source": (r.get("retailer") or "partner").strip().lower().replace(" ", ""),
                "partner": True,
                "imported": False,
                "items": [],
            }

        try:
            price = float(r.get("line_total") or 0)
        except (TypeError, ValueError):
            price = 0.0

        healthy = _healthy(r.get("category"))
        baskets[bid]["items"].append({
            "name": r.get("item_name") or "Item",
            "price": round(price, 2),
            "classification": "healthy" if healthy else "unhealthy",
            "category": r.get("category"),
            "subcategory": r.get("subcategory"),
            "quantity": r.get("quantity") or 1,
        })

    out = []
    for bid in order:
        b = baskets[bid]
        items = b["items"]
        healthy_count = sum(1 for i in items if i["classification"] == "healthy")
        b["total"] = round(sum(i["price"] for i in items), 2)
        b["healthyRatio"] = round(100 * healthy_count / len(items)) if items else 0
        out.append(b)
    return out


def basket_items(user_id: str, basket_id: str, healthy_only: bool = True):
    """
    The lines of one basket, ready to be written into the pantry.

    `healthy_only` is the default because the pantry is a HealthyFood tool —
    importing someone's chocolate bar into their pantry so the app can suggest
    recipes with it would work against the whole point of the product.
    """
    rows = bq.select(
        f"""
        SELECT `Food / item`           AS item_name,
               `Main category`         AS category,
               `Section / subcategory` AS subcategory,
               `Purchase date`         AS purchase_date
        FROM `{config.RAW_TRANSACTIONS}`
        WHERE `Customer ID` = @user_id AND `Basket ID` = @basket_id
        """,
        user_id=user_id, basket_id=basket_id,
    )

    items = []
    for r in rows:
        if healthy_only and not _healthy(r.get("category")):
            continue
        purchase_date = r.get("purchase_date")
        items.append({
            "item_name": r.get("item_name"),
            "category": r.get("category"),
            "subcategory": r.get("subcategory"),
            "date_added": str(purchase_date)[:10] if purchase_date else None,
        })
    return items
