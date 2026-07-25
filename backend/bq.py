"""
bq.py
-----
Lazy BigQuery client plus a few thin helpers.

Why lazy: the app must import and boot on a machine with no GCP credentials
(e.g. a teammate running only the frontend). Nothing touches Google Cloud until
an endpoint that actually needs data is called.

Why the helpers: every service was otherwise repeating the same six lines of
QueryJobConfig boilerplate. `select()` takes plain Python kwargs and infers the
BigQuery parameter type, so queries stay parameterised (no string interpolation
of user input, which is the injection risk Sarah will be looking for).
"""

import logging
from datetime import date, datetime

log = logging.getLogger("healthyfood.bq")

_client = None


def get_client():
    """Return the shared BigQuery client, creating it on first use."""
    global _client
    if _client is None:
        from google.cloud import bigquery
        import config
        # location matters: a client defaulting to the US multi-region cannot
        # see a dataset in africa-south1, and the error is a confusing 404
        # "table not found" rather than anything about regions.
        _client = bigquery.Client(project=config.PROJECT_ID, location=config.BQ_LOCATION)
    return _client


def _param(name, value):
    """Map a Python value onto the right BigQuery query parameter."""
    from google.cloud import bigquery

    if isinstance(value, bool):
        return bigquery.ScalarQueryParameter(name, "BOOL", value)
    if isinstance(value, int):
        return bigquery.ScalarQueryParameter(name, "INT64", value)
    if isinstance(value, float):
        return bigquery.ScalarQueryParameter(name, "FLOAT64", value)
    if isinstance(value, datetime):
        return bigquery.ScalarQueryParameter(name, "TIMESTAMP", value)
    if isinstance(value, date):
        return bigquery.ScalarQueryParameter(name, "DATE", value)
    if isinstance(value, (list, tuple)):
        sample = value[0] if value else ""
        kind = "INT64" if isinstance(sample, int) and not isinstance(sample, bool) else "STRING"
        return bigquery.ArrayQueryParameter(name, kind, list(value))
    return bigquery.ScalarQueryParameter(name, "STRING", value)


def select(sql: str, **params):
    """
    Run a parameterised SELECT and return a list of plain dicts.

    Usage:
        rows = bq.select("SELECT * FROM `t` WHERE user_id = @user_id", user_id="CUST-001")
    """
    from google.cloud import bigquery

    cfg = None
    if params:
        cfg = bigquery.QueryJobConfig(
            query_parameters=[_param(k, v) for k, v in params.items()]
        )
    return [dict(row) for row in get_client().query(sql, job_config=cfg)]


def execute(sql: str, **params):
    """Run a parameterised DML statement (UPDATE/DELETE/MERGE). Returns rows affected."""
    from google.cloud import bigquery

    cfg = None
    if params:
        cfg = bigquery.QueryJobConfig(
            query_parameters=[_param(k, v) for k, v in params.items()]
        )
    job = get_client().query(sql, job_config=cfg)
    job.result()
    return job.num_dml_affected_rows or 0


def insert(table: str, rows: list):
    """
    Streaming-insert rows. Returns a list of errors (empty when all good).

    Note for the team: rows inserted this way sit in BigQuery's streaming
    buffer for a while and CANNOT be UPDATE-ed or DELETE-ed during that window.
    That is why `pantry_service.remove_item` treats a failed UPDATE as a soft
    success rather than a 500 — the UI must never freeze mid-demo because of a
    buffer timing quirk.
    """
    if not rows:
        return []
    errors = get_client().insert_rows_json(table, rows)
    if errors:
        log.warning("insert_rows_json into %s returned errors: %s", table, errors)
    return errors


def safe(fn, default, label="query"):
    """
    Run `fn()` and fall back to `default` if anything goes wrong.

    Used on the read paths that are nice-to-have (insights, price comparison,
    trends). A missing table or a schema drift should degrade one card in the
    UI, not take down the whole screen during judging.
    """
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 - deliberate catch-all at the edge
        log.warning("%s failed, using fallback: %s", label, exc)
        return default