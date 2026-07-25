"""
points_service.py
-----------------
Points, badges and challenges — the "encourage the habit" requirement.

Points are stored as an append-only ledger in `user_milestones` (one row per
event, positive for earning and negative for redemption). Summing the ledger
gives the balance. Append-only is the right shape here: it survives BigQuery's
streaming buffer (no updates needed), it gives us the event history the badge
rules need, and it means a claimed voucher is auditable rather than a mutated
counter.

Badges and challenges are then *derived* from that ledger plus the customer's
actual behaviour, so they can't drift out of sync with what the user did.
"""

import uuid
from datetime import datetime

import bq
import config

# How many points each action is worth. Kept in one place so the frontend and
# backend can never disagree about what an action pays out.
POINT_VALUES = {
    "basket_imported": 15,
    "slip_scanned": 25,
    "recipe_generated": 20,
    "swap_accepted": 10,
    "item_bought": 5,
    "zero_waste_save": 30,
}

BADGE_RULES = [
    # (id, icon, name, description, ledger event that earns it, times needed)
    ("b-scan", "📸", "Slip Scanner", "Scan 3 slips", "slip_scanned", 3),
    ("b-swap", "🔄", "Smart Swapper", "Accept 3 swaps", "swap_accepted", 3),
    ("b-cook", "🥗", "Home Cook", "Generate 5 recipes", "recipe_generated", 5),
    ("b-waste", "♻️", "Zero Waste", "Save an expiring item", "zero_waste_save", 1),
    ("b-basket", "🛒", "Linked Up", "Import a partner basket", "basket_imported", 1),
]


def claim_reward(user_id: str, reward_name: str, points_required: int):
    """Create a voucher claim and deduct the required points from the ledger."""
    points_required = int(points_required or 0)
    claim_id = str(uuid.uuid4())
    voucher_code = f"HEALTHY-{str(uuid.uuid4())[:8].upper()}"
    row = {
        "claim_id": claim_id,
        "user_id": user_id,
        "reward_id": None,
        "voucher_code": voucher_code,
        "claimed_at": datetime.now().isoformat(),
        "expires_at": None,
        "status": "active",
    }
    errors = bq.insert(config.CLAIMED_REWARDS, [row])
    award_result = award(
        user_id,
        "reward_claimed",
        amount=-abs(points_required),
        badge_name=f"Claimed: {reward_name}",
    )
    status = "success" if not errors and award_result.get("status") == "success" else "error"
    return {
        "status": status,
        "voucher_code": voucher_code,
        "reward_name": reward_name,
        "points_spent": points_required,
        "message": "Reward claimed successfully!" if status == "success" else "Reward claim failed",
        "claim_id": claim_id,
        "errors": errors + award_result.get("errors", []),
    }


def award(user_id: str, reason: str, amount: int = None, badge_name: str = None):
    """
    Append one event to the points ledger.

    `reason` should be a key from POINT_VALUES so the amount is consistent;
    an explicit `amount` overrides it (used for the negative redemption rows).
    """
    points = amount if amount is not None else POINT_VALUES.get(reason, 0)
    row = {
        "milestone_id": str(uuid.uuid4()),
        "user_id": user_id,
        "badge_name": badge_name or reason,
        "points_earned": int(points),
        "achieved_at": datetime.now().isoformat(),
    }
    errors = bq.insert(config.USER_MILESTONES, [row])
    return {"status": "error" if errors else "success",
            "points_awarded": int(points), "errors": errors}


def ledger(user_id: str):
    """Every points event for this user, newest first."""
    return bq.select(
        f"""
        SELECT badge_name, points_earned, achieved_at
        FROM `{config.USER_MILESTONES}`
        WHERE user_id = @user_id
        ORDER BY achieved_at DESC
        """,
        user_id=user_id,
    )


def balance(user_id: str, base_points: int = 0):
    """
    Current points balance.

    `base_points` lets the caller seed the balance from the customer's existing
    Vitality points on their profile, so the demo doesn't start everyone at zero.
    """
    rows = bq.safe(
        lambda: bq.select(
            f"""
            SELECT COALESCE(SUM(points_earned), 0) AS total,
                   COUNTIF(points_earned > 0)      AS events
            FROM `{config.USER_MILESTONES}`
            WHERE user_id = @user_id
            """,
            user_id=user_id,
        ),
        [{"total": 0, "events": 0}],
        "points_balance",
    )
    row = rows[0] if rows else {"total": 0, "events": 0}
    earned = int(row.get("total") or 0)
    return {
        "balance": base_points + earned,
        "earned_in_app": earned,
        "events": int(row.get("events") or 0),
    }


def _event_counts(user_id: str):
    """How many times each ledger event has fired, for badge/challenge maths."""
    rows = bq.safe(
        lambda: bq.select(
            f"""
            SELECT badge_name, COUNT(*) AS n
            FROM `{config.USER_MILESTONES}`
            WHERE user_id = @user_id AND points_earned > 0
            GROUP BY badge_name
            """,
            user_id=user_id,
        ),
        [], "event_counts",
    )
    return {r["badge_name"]: int(r["n"]) for r in rows}


def badges(user_id: str):
    """Badges with earned/not-earned resolved from the ledger."""
    counts = _event_counts(user_id)
    out = []
    for bid, icon, name, desc, event, needed in BADGE_RULES:
        have = counts.get(event, 0)
        out.append({
            "id": bid, "icon": icon, "name": name, "desc": desc,
            "earned": have >= needed,
            "progress": min(100, round(100 * have / needed)) if needed else 0,
        })
    return out


def challenges(user_id: str):
    """
    Active challenges with real progress.

    Each one is a nudge toward a behaviour the spec cares about: ingesting data,
    accepting healthier swaps, and cutting waste.
    """
    counts = _event_counts(user_id)

    def pct(event, target):
        return min(100, round(100 * counts.get(event, 0) / target))

    defs = [
        ("c-swap", "Swap 3 refined carbs", "Accept 3 suggested substitutions",
         150, "swap_accepted", 3),
        ("c-waste", "Zero-waste week", "Cook something using an expiring item",
         200, "zero_waste_save", 2),
        ("c-scan", "Log 5 slips", "Import or scan 5 receipts this month",
         100, "slip_scanned", 5),
    ]

    out = []
    for cid, title, desc, reward, event, target in defs:
        progress = pct(event, target)
        out.append({
            "id": cid, "title": title, "desc": desc, "reward": reward,
            "progress": progress, "done": progress >= 100,
            "event": event, "have": counts.get(event, 0), "target": target,
        })
    return out
