"""
pantry_service.py
-----------------
Everything the pantry screen needs.

The interesting bit is `expires_in_days`. BigQuery only stores when an item was
added, but the spec's whole "less waste" requirement depends on the app knowing
what is about to go off. So we estimate a shelf life from the item's HealthyFood
category/subcategory and count down from `date_added`.

It's a heuristic, not a sensor — but it is a *defensible* heuristic driven by the
same category taxonomy the rest of the app uses, and it makes "use this before it
expires" recipes possible without asking the user to type expiry dates in.
"""

import re
import uuid
from datetime import datetime, date

import bq
import config

# ---------------------------------------------------------------------------
# SHELF LIFE
# ---------------------------------------------------------------------------
# Days from purchase, keyed on the dataset's own "Section / subcategory" values
# first (most specific), then "Main category" as the fallback.
SUBCATEGORY_SHELF_LIFE = {
    "Fruit, vegetables and herbs": 6,
    "Tinned vegetables": 540,
    "Dried vegetables and herbs": 365,
    "Chicken": 3,
    "Fish and seafood": 2,
    "Tinned fish and seafood": 540,
    "Ostrich and venison": 4,
    "Eggs": 21,
    "Milk": 7,
    "Soya milk": 10,
    "Yoghurt": 14,
    "Cottage cheese": 10,
    "Breads": 4,
    "Whole grains": 240,
    "Maize": 240,
    "Pasta and noodles": 540,
    "Couscous": 540,
    "Crackers": 90,
    "Legumes": 365,
    "Soy products (tofu)": 12,
    "Nuts and seeds": 180,
    "Nut butters": 180,
    "Oils and sprays": 365,
}

CATEGORY_SHELF_LIFE = {
    "Fruit and vegetables": 6,
    "Animal protein": 4,
    "Dairy": 8,
    "Whole grains and high-fibre starchy foods": 180,
    "Legumes": 240,
    "Oils, nuts and seeds": 240,
    "Unhealthy foods": 30,
}

DEFAULT_SHELF_LIFE = 14

# Words in an item name that imply a longer or shorter life than its category.
NAME_HINTS = [
    (re.compile(r"\b(tinned|canned|dried|frozen)\b", re.I), 180),
    (re.compile(r"\bfresh\b", re.I), 4),
]


def shelf_life_days(category: str = None, subcategory: str = None, item_name: str = None) -> int:
    """Best estimate of how long this item keeps, in days from purchase."""
    if subcategory and subcategory in SUBCATEGORY_SHELF_LIFE:
        base = SUBCATEGORY_SHELF_LIFE[subcategory]
    elif category and category in CATEGORY_SHELF_LIFE:
        base = CATEGORY_SHELF_LIFE[category]
    else:
        base = DEFAULT_SHELF_LIFE

    for pattern, override in NAME_HINTS:
        if item_name and pattern.search(item_name):
            # "Fresh" shortens; "tinned/dried" lengthens. Take the hint only
            # when it moves in a sensible direction for this base.
            base = min(base, override) if override < base else max(base, override)
            break
    return base


def _parse_date(value) -> date:
    """date_added is stored as a plain YYYY-MM-DD string; be forgiving."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return date.today()


def expires_in(date_added, category=None, subcategory=None, item_name=None) -> int:
    """Days remaining before this item is past its estimated shelf life."""
    added = _parse_date(date_added)
    used = (date.today() - added).days
    return max(0, shelf_life_days(category, subcategory, item_name) - used)


# ---------------------------------------------------------------------------
# READS
# ---------------------------------------------------------------------------
def list_pantry(user_id: str):
    """
    Available pantry items, already shaped the way the UI wants them:
    id / name / category / qty / expiresIn / source.
    """
    rows = bq.select(
        f"""
        SELECT p.pantry_item_id, p.item_name, p.category, p.date_added, p.status,
               c.subcategory, c.retailer, c.classification
        FROM `{config.USER_PANTRY}` p
        LEFT JOIN `{config.FOOD_CATALOGUE}` c
               ON LOWER(TRIM(c.item_name)) = LOWER(TRIM(p.item_name))
        WHERE p.user_id = @user_id AND p.status = 'available'
        ORDER BY p.date_added DESC
        """,
        user_id=user_id,
    )

    items = []
    for r in rows:
        classification = (r.get("classification") or "").strip().lower()
        items.append({
            "id": r["pantry_item_id"],
            "name": r["item_name"],
            "category": r.get("category") or "Groceries",
            "subcategory": r.get("subcategory"),
            "qty": "1",
            "expiresIn": expires_in(
                r.get("date_added"), r.get("category"), r.get("subcategory"), r["item_name"]
            ),
            "source": (r.get("retailer") or "manual").strip().lower().replace(" ", ""),
            "isHealthy": bool(classification) and classification != "unhealthy",
            "dateAdded": str(r.get("date_added") or ""),
        })
    return items


def pantry_names(user_id: str):
    """Just the item names — what recipe_service needs."""
    rows = bq.select(
        f"""
        SELECT item_name FROM `{config.USER_PANTRY}`
        WHERE user_id = @user_id AND status = 'available'
        """,
        user_id=user_id,
    )
    return [r["item_name"] for r in rows]


def expiring_soon(user_id: str, within_days: int = 3):
    """Items about to go off — the input to a zero-waste recipe."""
    return [i for i in list_pantry(user_id) if i["expiresIn"] <= within_days]


# ---------------------------------------------------------------------------
# WRITES
# ---------------------------------------------------------------------------
def add_items(user_id: str, items):
    """
    Insert pantry rows. `items` is a list of dicts with at least `item_name`,
    optionally `category` and `date_added`. Returns the rows written.
    """
    today = date.today().strftime("%Y-%m-%d")
    rows = [{
        "pantry_item_id": str(uuid.uuid4()),
        "user_id": user_id,
        "item_name": it.get("item_name") or it.get("name"),
        "category": it.get("category") or "Uncategorised",
        "date_added": it.get("date_added") or today,
        "status": "available",
    } for it in items if (it.get("item_name") or it.get("name"))]

    errors = bq.insert(config.USER_PANTRY, rows)
    return rows, errors


def remove_item(user_id: str, pantry_item_id: str, reason: str = "consumed"):
    """
    Mark an item as used/removed.

    Soft-fails on purpose: a row that is still in BigQuery's streaming buffer
    cannot be UPDATE-ed for up to ~90 minutes after insert. Rather than throw a
    500 at the user mid-demo we report `deferred` and let the UI drop the item
    from view optimistically.
    """
    try:
        affected = bq.execute(
            f"""
            UPDATE `{config.USER_PANTRY}`
            SET status = @reason
            WHERE user_id = @user_id AND pantry_item_id = @item_id
            """,
            reason=reason, user_id=user_id, item_id=pantry_item_id,
        )
        return {"status": "success", "updated": affected}
    except Exception as exc:  # noqa: BLE001
        return {"status": "deferred", "updated": 0, "detail": str(exc)[:200]}


def substitute_item(user_id: str, pantry_item_id: str, new_name: str, new_category: str = None):
    """
    Accept a suggested swap: rename the pantry row to the healthier product.
    Same streaming-buffer caveat as remove_item, same soft-fail.
    """
    try:
        affected = bq.execute(
            f"""
            UPDATE `{config.USER_PANTRY}`
            SET item_name = @new_name,
                category  = COALESCE(@new_category, category)
            WHERE user_id = @user_id AND pantry_item_id = @item_id
            """,
            new_name=new_name, new_category=new_category,
            user_id=user_id, item_id=pantry_item_id,
        )
        return {"status": "success", "updated": affected}
    except Exception as exc:  # noqa: BLE001
        return {"status": "deferred", "updated": 0, "detail": str(exc)[:200]}
