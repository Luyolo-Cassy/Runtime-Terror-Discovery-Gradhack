# HealthyFood Companion — Runtime Terror

Discovery Gradhack 2026 · Theme 2 — AI for Smarter Everyday Living

A HealthyFood companion that reads a customer's till slips, works out what's in
their kitchen, and turns that into recipes, healthier swaps and a shopping list
they can actually afford.

---

## What this repo is

This merges two pieces of work:

- **`backend/`** — the FastAPI service from the `alessio-test-ignore` branch,
  extended with the endpoints the UI needed.
- **`frontend/`** — the Expo / React Native app, keeping the `expo-router`
  structure from the branch, wired onto the live API.

> Stack: Expo SDK 57, React Native 0.86, `expo-router` 57, TypeScript — the same
> versions the branch was already pinned to. Runs on iOS, Android and web from
> one codebase.

---

## Run it

### Backend

```bash
cd backend
pip install -r requirements.txt

# Auth: same service account as BigQuery. No Gemini API key anywhere.
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json

uvicorn main:app --reload --port 8000
```

Open http://localhost:8000/docs for the interactive API docs.

On startup the service runs `bootstrap.ensure_tables()`, which creates the
tables it *writes* to if they're missing. It never touches `dataset`,
`foodCatalogue`, `user_profiles` or `user_preferences` — those are owned
elsewhere, and creating an empty table over a view would break the profile
service.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env      # set EXPO_PUBLIC_API_BASE=http://localhost:8000
npx expo start            # then press i / a / w, or scan the QR in Expo Go
```

Or run both at once with `npm run dev:all` from `frontend/`.

Without `EXPO_PUBLIC_API_BASE` the app runs in **demo mode** on sample data. The
header badge always says **Live** or **Demo**, so nobody ever has to guess
whether what they're looking at is real.

**On a physical device**, set the base URL to your laptop's LAN IP — a phone
can't reach `localhost`. The Android emulator's `10.0.2.2` rewrite is handled
automatically. See `frontend/README.md`.

---

## Architecture

```
Till slips (BigQuery `dataset`, 15k rows)
        │
        ├── user_profiles (view) ─────────┐
        │                                 │
        ├── receipts_service ── partner baskets, grouped by Basket ID
        ├── insights_service ── habits, swaps, monthly trend, price comparison
        │                                 │
        │                                 ▼
Photo of a slip ──► Gemini (OCR only) ──► catalogue_service ──► user_pantry
                                          (foodCatalogue decides "healthy")
                                                  │
                                                  ▼
                          recipe_service ──► Gemini (grounded prompt)
                                                  │
                                    missing ingredients (real catalogue items)
                                                  │
                                                  ▼
                                          user_shopping_list
                                                  │
                                          bought ──► user_pantry (loop closes)
```

### Three decisions worth defending in the pitch

**1. The catalogue classifies food, not the LLM.**
Gemini only reads item *names* off a photo. `catalogue_service` then matches
those names against `foodCatalogue` and that decides what counts as HealthyFood.
The model is never allowed to assert that something is healthy — which matters
both for correctness and for the security angle the product owner flagged.

**2. Recommendations are grounded in products that exist.**
`recipe_service` passes the model a real catalogue sample and instructs it to
choose `missing_ingredients` only from that list. Swap suggestions work the same
way: a repeat unhealthy purchase is mapped by *subcategory* to the HealthyFood
category that displaces it nutritionally, then a real product is picked from
that category — preferring the retailer the customer already shops at.

**3. Points are an append-only ledger.**
Every earn and every redemption is a row in `user_milestones`. Balance is the
sum. Badges and challenges are *derived* from that ledger, so they can't drift
out of sync with what the user actually did, and a claimed voucher is auditable
rather than a mutated counter. It also sidesteps BigQuery's streaming buffer,
which blocks UPDATE on freshly-inserted rows.

---

## How it maps to the spec

| Requirement | Where it lives |
|---|---|
| 4.1 Personalised meal / food recommendations | `recipe_service.py` — pantry + profile + catalogue in one grounded prompt |
| 4.2 Purchase and activity tracking | `points_service.py` ledger; `pantry_service.py` shelf-life countdown drives the zero-waste path |
| 4.3 Integration with Discovery data | Everything reads the supplied dataset and `foodCatalogue`; `Unhealthy foods` is the one non-HealthyFood category and that definition lives in exactly one function |
| 4.4 Profile creation and improvement | `GET /api/profile/{id}/evolution` — the same profile on the first 3 baskets vs the full history, rendered side by side on the Profile screen |
| 4.5 Data ingestion, multiple routes | Partner baskets (basket ID, no scanning) **and** photo-of-a-slip via Gemini |

---

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/home/{user_id}` | Hydrates every screen in one request |
| GET | `/api/profile/{user_id}` | Computed profile + nudge |
| GET | `/api/profile/{user_id}/evolution` | New-user vs established profile |
| GET | `/api/users` | Real customer IDs, for the persona switcher |
| GET | `/api/pantry/{user_id}` | Pantry with `expiresIn` computed |
| POST | `/api/pantry/scan` | Photo → Gemini OCR → catalogue → pantry |
| POST | `/api/pantry/item` · `/remove` · `/substitute` | Manual add, remove, accept a swap |
| GET | `/api/receipts/{user_id}` | Partner baskets from the till-slip data |
| POST | `/api/receipts/import` | Import a basket's HealthyFood lines |
| POST | `/api/recipes/generate` | Personalised recipe (`zero_waste: true` for expiring stock) |
| GET | `/api/recipes/{user_id}` | Saved recipes |
| GET | `/api/shopping/{user_id}` | List with real per-retailer prices |
| POST | `/api/shopping/add` · `/bought` · `/remove` | List management; "bought" moves it to the pantry |
| GET | `/api/insights/{user_id}` | Habits, swaps, monthly trend |
| GET | `/api/rewards` · POST `/api/rewards/claim` | Catalogue and redemption |
| GET | `/api/points/{user_id}` · POST `/api/points/award` | Balance, badges, challenges |

---

## Assumptions to verify before Sunday

- **`user_profiles` columns.** The frontend maps `customer_id`, `customer_name`,
  `vitality_tier`, `vitality_points`, `healthy_spend_pct`, `budget_tier`,
  `preferred_category`, `preferred_retailer`, `avg_basket_spend`. Missing columns
  degrade gracefully (they render as `—`), but check the view and adjust
  `mapProfile` in `frontend/src/data/store.tsx` if the names differ.
- **Native module versions.** Run `npx expo install --fix` in `frontend/` once,
  to pin `react-native-svg`, `expo-image-picker` and friends to the exact
  versions Expo SDK 57 expects.
- **`rewards_catalog`** must be populated, or the Rewards screen shows an empty
  state. Claiming is gated on the points balance.
- **Shelf life is a heuristic**, not a real expiry date — see the table in
  `pantry_service.py`. Say so if a judge asks; it's defensible because it's
  driven by the same category taxonomy as everything else.
- **CashBack percentages** in `store.tsx` are the demo's own scale, not published
  Discovery rates.
- **Email addresses** are display placeholders. The dataset has no email column
  and nothing personal is sent to the API.
