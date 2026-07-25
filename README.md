# Profile Service — HealthyFood Companion (GradHack 2026)

Cloud Run service that builds the evolving user profile consumed by the
Recipes and Rewards services.

## What it does
- Reads a customer's purchase history from BigQuery (`Customer ID`-keyed).
- Computes: spend by category, healthy/unhealthy spend ratio, inferred
  budget tier, preferred retailer, average basket value, basket count.
- Applies any user-declared preference overrides (from a BigQuery
  `user_preferences` table) on top of the inferred values.
- Exposes:
  - `GET /profile/<user_id>` — current profile.
  - `GET /profile/<user_id>/evolution` — same profile computed on the
    user's first 3 baskets ("new user") vs. their full history
    ("established"), to demonstrate profile evolution over time.

## Config
Set these in `main.py` (or move to environment variables before deploy):
- `TABLE` — BigQuery table with purchase history.
- `PREFERENCES_TABLE` — BigQuery table with user-declared preferences.

## Run locally
```bash
pip install -r requirements.txt
python main.py
```

## Deploy to Cloud Run
```bash
gcloud run deploy profile-service --source . --region us-central1
```
