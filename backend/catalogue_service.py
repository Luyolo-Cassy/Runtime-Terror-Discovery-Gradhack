"""
catalogue_service.py
--------------------
Classifies food items as healthy / not by matching them against the real
Discovery `foodCatalogue` table, instead of asking the LLM to guess.

This is the source of truth the spec asks for (requirement 4.3): an item is
"healthy" because it matches a catalogue row whose `classification = 'healthy'`
— the same logic that drives healthy_spend in your user_profiles view.

Used by the pantry-scan endpoint: Gemini reads item *names* off the photo
(what it's good at); this module decides which of those are HealthyFood.
"""

import re
from google.cloud import bigquery

# words that carry no signal when matching a product name to the catalogue
_STOPWORDS = {
    "fresh", "the", "of", "and", "with", "low", "fat", "free", "full", "cream",
    "pack", "bag", "box", "each", "per", "kg", "g", "ml", "l", "x",
}


def _tokens(name: str):
    """Lowercase word tokens with stopwords removed."""
    words = re.findall(r"[a-z]+", (name or "").lower())
    return [w for w in words if w not in _STOPWORDS and len(w) > 2]


def load_catalogue(bq_client, dataset: str):
    """Pull the catalogue once (it's a curated list, not big) for in-memory matching."""
    query = f"""
        SELECT item_name, category, subcategory, retailer, classification
        FROM `{dataset}.foodCatalogue`
    """
    return [dict(r) for r in bq_client.query(query)]


def _best_match(name: str, catalogue):
    """
    Find the catalogue row that best matches `name`.
    Strategy: exact (normalised) match > substring containment > token overlap.
    Returns (row, score) or (None, 0).
    """
    n = (name or "").strip().lower()
    if not n:
        return None, 0.0

    # 1. exact normalised match
    for row in catalogue:
        if row.get("item_name", "").strip().lower() == n:
            return row, 1.0

    name_tokens = set(_tokens(name))
    best, best_score = None, 0.0
    for row in catalogue:
        cat_name = row.get("item_name", "")
        cat_low = cat_name.strip().lower()

        # 2. substring containment either direction -> strong signal
        if cat_low and (cat_low in n or n in cat_low):
            score = 0.9
        else:
            # 3. token overlap (Jaccard-ish)
            cat_tokens = set(_tokens(cat_name))
            if not cat_tokens or not name_tokens:
                continue
            shared = name_tokens & cat_tokens
            if not shared:
                continue
            score = len(shared) / len(name_tokens | cat_tokens)

        if score > best_score:
            best, best_score = row, score

    # require a minimum confidence so we don't force bad matches
    return (best, best_score) if best_score >= 0.34 else (None, best_score)


def classify_items(bq_client, dataset: str, item_names):
    """
    Classify a list of item names against the catalogue.

    Returns a list of dicts:
      {
        "input_name": "...",        # what Gemini read off the photo
        "matched_item": "..."|None, # catalogue item it matched (None if no match)
        "category": "..."|None,     # catalogue category (better than Gemini's guess)
        "retailer": "..."|None,
        "classification": "..."|None,
        "is_healthy": True/False,   # True only when catalogue says classification='healthy'
      }
    """
    catalogue = load_catalogue(bq_client, dataset)
    results = []
    for name in item_names:
        row, _score = _best_match(name, catalogue)
        if row:
            classification = (row.get("classification") or "").strip()
            results.append({
                "input_name": name,
                "matched_item": row.get("item_name"),
                "category": row.get("category"),
                "retailer": row.get("retailer"),
                "classification": classification or None,
                "is_healthy": classification.lower() == "healthy",
            })
        else:
            results.append({
                "input_name": name,
                "matched_item": None,
                "category": None,
                "retailer": None,
                "classification": None,
                "is_healthy": False,   # not in the HealthyFood catalogue -> not counted healthy
            })
    return results