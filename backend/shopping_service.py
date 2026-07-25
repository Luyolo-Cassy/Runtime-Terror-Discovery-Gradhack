"""
shopping_service.py
-------------------
The shopping list that sits between a generated recipe and the next shop.

The flow the spec asks for is: recipe needs things you don't have -> those
become your list -> you buy them -> they land in your pantry -> the next recipe
knows about them. This module owns the middle of that loop.

Two buckets, matching the UI:
  - `for_future = FALSE` : missing for a recipe you're cooking now
  - `for_future = TRUE`  : saved for the next shop (a recipe you've planned)

Each item is priced against real observed till-slip prices at both partners, so
"best price" on the Shopping screen is real rather than decorative.
"""

import uuid
from datetime import datetime

import bq
import config
import insights_service


def list_shopping(user_id: str, with_prices: bool = True):
    """Open shopping-list items, shaped for the UI (id/name/recipe/stores)."""
    rows = bq.select(
        f"""
        SELECT shopping_item_id, item_name, category, retailer,
               recipe_name, for_future, status, added_at
        FROM `{config.SHOPPING_LIST}`
        WHERE user_id = @user_id AND status = 'open'
        ORDER BY for_future, added_at DESC
        """,
        user_id=user_id,
    )

    items = []
    for r in rows:
        stores = []
        if with_prices:
            stores = bq.safe(
                lambda name=r["item_name"]: insights_service.price_comparison(name),
                [], "price_comparison",
            )
        if not stores:
            # No observed price for this catalogue item — still show the
            # retailer we know stocks it, just without a price claim.
            stores = [{"name": r.get("retailer") or "Partner store",
                       "price": 0.0, "healthy": True, "observations": 0}]

        items.append({
            "id": r["shopping_item_id"],
            "name": r["item_name"],
            "category": r.get("category"),
            "recipe": r.get("recipe_name"),
            "forFutureRecipe": bool(r.get("for_future")),
            "checked": False,
            "stores": stores,
        })
    return items


def add_items(user_id: str, items, recipe_name: str = None, for_future: bool = False):
    """
    Add items to the list, skipping anything already open on it.

    `items` accepts either plain strings or the {item_name, retailer, category}
    dicts that recipe_service returns as `missing_ingredients`, so the recipe
    screen can pipe its output straight in.
    """
    existing = {
        r["item_name"].strip().lower()
        for r in bq.select(
            f"""
            SELECT item_name FROM `{config.SHOPPING_LIST}`
            WHERE user_id = @user_id AND status = 'open'
            """,
            user_id=user_id,
        )
        if r.get("item_name")
    }

    now = datetime.now().isoformat()
    rows = []
    for it in items:
        if isinstance(it, str):
            it = {"item_name": it}
        name = (it.get("item_name") or it.get("name") or "").strip()
        if not name or name.lower() in existing:
            continue
        existing.add(name.lower())
        rows.append({
            "shopping_item_id": str(uuid.uuid4()),
            "user_id": user_id,
            "item_name": name,
            "category": it.get("category"),
            "retailer": it.get("retailer"),
            "recipe_name": it.get("recipe_name") or recipe_name,
            "for_future": bool(it.get("for_future", for_future)),
            "status": "open",
            "added_at": now,
        })

    errors = bq.insert(config.SHOPPING_LIST, rows)
    return rows, errors


def mark_bought(user_id: str, shopping_item_id: str):
    """
    Buy an item: close it on the list and move it into the pantry.

    Returns the pantry rows created so the UI can update both screens from one
    response instead of re-fetching twice.
    """
    import pantry_service

    rows = bq.select(
        f"""
        SELECT item_name, category FROM `{config.SHOPPING_LIST}`
        WHERE user_id = @user_id AND shopping_item_id = @item_id
        """,
        user_id=user_id, item_id=shopping_item_id,
    )
    if not rows:
        return {"status": "not_found", "pantry_rows": []}

    item = rows[0]
    pantry_rows, _ = pantry_service.add_items(user_id, [{
        "item_name": item["item_name"],
        "category": item.get("category"),
    }])

    try:
        bq.execute(
            f"""
            UPDATE `{config.SHOPPING_LIST}`
            SET status = 'bought'
            WHERE user_id = @user_id AND shopping_item_id = @item_id
            """,
            user_id=user_id, item_id=shopping_item_id,
        )
        status = "success"
    except Exception:  # noqa: BLE001 - streaming buffer, see bq.insert docstring
        status = "deferred"

    return {"status": status, "item_name": item["item_name"], "pantry_rows": pantry_rows}


def remove_item(user_id: str, shopping_item_id: str):
    """Drop an item off the list without buying it."""
    try:
        affected = bq.execute(
            f"""
            UPDATE `{config.SHOPPING_LIST}`
            SET status = 'removed'
            WHERE user_id = @user_id AND shopping_item_id = @item_id
            """,
            user_id=user_id, item_id=shopping_item_id,
        )
        return {"status": "success", "updated": affected}
    except Exception as exc:  # noqa: BLE001
        return {"status": "deferred", "updated": 0, "detail": str(exc)[:200]}
