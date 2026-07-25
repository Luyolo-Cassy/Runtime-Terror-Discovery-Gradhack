# Profile Service — HealthyFood Companion (GradHack 2026)

Cloud Run service that builds the evolving user profile consumed by the
Recipes and Rewards services.

## What it does
- `GET /profile/<user_id>` reads the precomputed profile row from Person 1
  (Alessio)'s `user_profiles` BigQuery view — this is now the source of
  truth instead of computing the profile in Python.
- `GET /profile/<user_id>/evolution` still computes locally from raw
  purchase history, since the view is a single fixed row over full history
  and can't show a "first 3 baskets" checkpoint. This endpoint recomputes
  on the user's first 3 baskets ("new user") vs. full history
  ("established") to demonstrate profile evolution over time.
- Both endpoints apply any user-declared preference overrides (from a
  BigQuery `user_preferences` table) on top of the inferred/precomputed
  values.

## Config
Set these in `main.py` (or move to environment variables before deploy):
- `TABLE` — BigQuery table with raw purchase history (used by `/evolution`).
- `PROFILE_VIEW` — Person 1's precomputed `user_profiles` view (used by
  `/profile/<user_id>`).
- `PREFERENCES_TABLE` — BigQuery table with user-declared preferences.

## Known gap
`PROFILE_VIEW` is queried with `SELECT *` and the exact column list isn't
committed anywhere (the placeholder SQL files in `chore/initial-scaffold`
are empty) — confirm the full schema with Alessio so `goal` and any
override field names line up with what the view actually returns.

## Run locally
```bash
pip install -r requirements.txt
python main.py
```

## Deploy to Cloud Run
```bash
gcloud run deploy profile-service --source . --region us-central1
```
