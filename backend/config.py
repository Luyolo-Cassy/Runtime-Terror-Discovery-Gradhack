"""
config.py
---------
Single place for the project/dataset constants so every service module can
import them without reaching back into main.py (which would be circular).

Everything is overridable by environment variable, so the same code runs on a
laptop, in Cloud Run, or against a scratch dataset during the demo.
"""

import os

PROJECT_ID = os.getenv("GCP_PROJECT", "gradhack26jnb-408")
DATASET = os.getenv("BQ_DATASET", "gradhack26jnb-408.HealthyFood")

# Gemini runs through Vertex AI on the SAME service account as BigQuery.
# No API key anywhere in the codebase.
# Where BigQuery JOBS run. This must match the dataset's location or every
# query 404s with "not found in location ...". Separate from VERTEX_LOCATION —
# Gemini and BigQuery are different services in different regions.
BQ_LOCATION = os.getenv("BQ_LOCATION", "africa-south1")

LOCATION = os.getenv("VERTEX_LOCATION", "us-central1")
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# ---------------------------------------------------------------------------
# TABLES
# ---------------------------------------------------------------------------
# Raw till-slip data supplied with the spec (15k rows). Column names have
# spaces, so every reference to them must be backticked.
RAW_TRANSACTIONS = f"{DATASET}.{os.getenv('BQ_TABLE_TRANSACTIONS', 'dataset')}"

# Curated tables / views built by the team.
#
# BigQuery table names are CASE-SENSITIVE, so `foodCatalogue`, `foodcatalogue`
# and `food_catalogue` are three different tables. Each name is env-overridable
# so a mismatch is a .env change rather than a code edit — run
# `bq ls --location=<your-location> <project>:<dataset>` to see the real names.
FOOD_CATALOGUE = f"{DATASET}.{os.getenv('BQ_TABLE_CATALOGUE', 'foodCatalogue')}"
USER_PROFILES = f"{DATASET}.{os.getenv('BQ_TABLE_PROFILES', 'user_profiles')}"
USER_PREFERENCES = f"{DATASET}.{os.getenv('BQ_TABLE_PREFERENCES', 'user_preferences')}"

# Tables this API writes to (created on boot by bootstrap.py if missing).
USER_PANTRY = f"{DATASET}.user_pantry"
SAVED_RECIPES = f"{DATASET}.saved_recipes"
SHOPPING_LIST = f"{DATASET}.user_shopping_list"
USER_MILESTONES = f"{DATASET}.user_milestones"
CLAIMED_REWARDS = f"{DATASET}.user_claimed_rewards"
REWARDS_CATALOG = f"{DATASET}.{os.getenv('BQ_TABLE_REWARDS', 'rewards_catalog')}"

# ---------------------------------------------------------------------------
# DOMAIN CONSTANTS
# ---------------------------------------------------------------------------
# The one "Main category" in the supplied dataset that is NOT HealthyFood.
# Everything else in the taxonomy is a HealthyFood classification group.
UNHEALTHY_CATEGORY = "Unhealthy foods"

# Demo user. Real customer_id from the supplied dataset.
DEFAULT_USER = os.getenv("DEFAULT_USER", "CUST-001")