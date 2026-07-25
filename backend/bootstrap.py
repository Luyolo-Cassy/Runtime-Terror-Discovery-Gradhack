"""
bootstrap.py
------------
Creates the tables this API *writes* to, if they don't already exist.

Deliberately does NOT touch:
  - `dataset`        (the raw 15k-row till-slip data supplied with the spec)
  - `foodCatalogue`  (curated from the Woolworths/Checkers catalogues)
  - `user_profiles`  (a VIEW built over the raw data)
  - `user_preferences`
Those are owned elsewhere and creating an empty table over a view would break
the profile service.

Called once on FastAPI startup. Failures are logged, never fatal — if the
service account lacks CREATE permission the app still boots and the read paths
still work.
"""

import logging

import config

log = logging.getLogger("healthyfood.bootstrap")

# `CREATE TABLE IF NOT EXISTS` is idempotent, so this is safe to run every boot.
STATEMENTS = [
    f"""
    CREATE TABLE IF NOT EXISTS `{config.USER_PANTRY}` (
        pantry_item_id STRING,
        user_id        STRING,
        item_name      STRING,
        category       STRING,
        date_added     STRING,
        status         STRING
    )
    """,
    f"""
    CREATE TABLE IF NOT EXISTS `{config.SAVED_RECIPES}` (
        recipe_id           STRING,
        user_id             STRING,
        recipe_name         STRING,
        recipe_text         STRING,
        missing_ingredients STRING,
        is_favourite        BOOL,
        created_at          STRING
    )
    """,
    f"""
    CREATE TABLE IF NOT EXISTS `{config.SHOPPING_LIST}` (
        shopping_item_id STRING,
        user_id          STRING,
        item_name        STRING,
        category         STRING,
        retailer         STRING,
        recipe_name      STRING,
        for_future       BOOL,
        status           STRING,
        added_at         STRING
    )
    """,
    f"""
    CREATE TABLE IF NOT EXISTS `{config.USER_MILESTONES}` (
        milestone_id  STRING,
        user_id       STRING,
        badge_name    STRING,
        points_earned INT64,
        achieved_at   STRING
    )
    """,
    f"""
    CREATE TABLE IF NOT EXISTS `{config.CLAIMED_REWARDS}` (
        claim_id     STRING,
        user_id      STRING,
        reward_id    STRING,
        voucher_code STRING,
        claimed_at   STRING,
        expires_at   STRING,
        status       STRING
    )
    """,
]


def ensure_tables():
    """Run every CREATE TABLE IF NOT EXISTS. Never raises."""
    import bq

    created = 0
    for sql in STATEMENTS:
        try:
            bq.get_client().query(sql).result()
            created += 1
        except Exception as exc:  # noqa: BLE001
            log.warning("bootstrap statement failed (continuing): %s", exc)
    log.info("bootstrap: %s/%s statements ok", created, len(STATEMENTS))
    return created
