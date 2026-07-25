// ---------------------------------------------------------------------------
// TYPES = THE API CONTRACT
// ---------------------------------------------------------------------------
// These interfaces are exactly what the FastAPI backend returns. The backend
// shapes its BigQuery rows into these on the server side (see pantry_service,
// receipts_service, shopping_service, insights_service) so the frontend never
// has to know about column names like `Section / subcategory`.
//
// The sample values further down are DEMO-MODE FALLBACKS only. They are used
// when VITE_API_BASE is unset, or when a live call fails and we'd otherwise
// render an empty screen. The header badge tells the user which is in play.

// ---------------------------------------------------------------------------
// PANTRY
// ---------------------------------------------------------------------------
export interface PantryItem {
  id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  qty: string;
  /** Days until the estimated shelf life runs out. Computed server-side. */
  expiresIn: number;
  source?: string;
  isHealthy?: boolean;
  dateAdded?: string;
  substituted?: boolean;
}

// ---------------------------------------------------------------------------
// SWAPS & INSIGHTS
// ---------------------------------------------------------------------------
export interface Substitution {
  from: string;
  to: string;
  reason: string;
  category?: string | null;
  retailer?: string | null;
  timesBought?: number;
  /** Resolved client-side when the `from` product is actually in the pantry. */
  pantryId?: string;
}

export interface Insight {
  id: string;
  icon: string;
  title: string;
  detail: string;
  tone: "warn" | "good" | "info";
}

export interface TrendMonth {
  month: string;
  healthy: number;
  unhealthy: number;
}

// ---------------------------------------------------------------------------
// SHOPPING
// ---------------------------------------------------------------------------
export interface StorePrice {
  name: string;
  price: number;
  healthy?: boolean;
  observations?: number;
}

export interface ShoppingItem {
  id: string;
  name: string;
  recipe?: string | null;
  category?: string | null;
  checked?: boolean;
  forFutureRecipe?: boolean;
  stores: StorePrice[];
}

// ---------------------------------------------------------------------------
// RECEIPTS
// ---------------------------------------------------------------------------
export interface ReceiptLine {
  name: string;
  price: number;
  classification: "healthy" | "unhealthy";
  category?: string | null;
  subcategory?: string | null;
  quantity?: number;
}

export interface Receipt {
  id: string;
  store: string;
  date: string;
  source: string;
  partner: boolean;
  imported: boolean;
  total?: number;
  healthyRatio?: number;
  items: ReceiptLine[];
}

// ---------------------------------------------------------------------------
// RECIPES
// ---------------------------------------------------------------------------
export interface MissingIngredient {
  item_name: string;
  retailer?: string | null;
  category?: string | null;
}

export interface GeneratedRecipe {
  status: string;
  recipe_id?: string;
  recipe_name?: string;
  recipe?: string;
  missing_ingredients?: MissingIngredient[];
  used_pantry_items?: string[];
  focus_items?: string[];
  personalized_for?: {
    budget_tier?: string | null;
    preferred_category?: string | null;
    healthy_spend_pct?: number | null;
    vitality_tier?: string | null;
  } | null;
  points_awarded?: number;
  message?: string;
}

export interface SavedRecipe {
  recipe_id: string;
  recipe_name: string;
  recipe_text: string;
  missing_ingredients: MissingIngredient[];
  is_favourite: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// REWARDS
// ---------------------------------------------------------------------------
export interface Reward {
  reward_id: string;
  reward_name: string;
  partner_name?: string | null;
  points_required: number;
  vouchers_required?: number | null;
  reward_type?: string | null;
}

export interface Badge {
  id: string;
  icon: string;
  name: string;
  desc: string;
  earned: boolean;
  progress?: number;
}

export interface Challenge {
  id: string;
  title: string;
  desc: string;
  reward: number;
  progress: number;
  done: boolean;
  event?: string;
  have?: number;
  target?: number;
}

// ---------------------------------------------------------------------------
// PROFILE
// ---------------------------------------------------------------------------
/** The raw `user_profiles` row as BigQuery returns it. */
export interface RawProfile {
  customer_id?: string;
  customer_name?: string;
  vitality_tier?: string;
  vitality_points?: number;
  healthy_spend_pct?: number;
  budget_tier?: string;
  preferred_category?: string;
  preferred_retailer?: string;
  avg_basket_spend?: number;
  vouchers_unlocked?: number;
  [key: string]: unknown;
}

/** The shape the UI actually renders. `mapProfile` in store.tsx builds this. */
export interface Profile {
  userId: string;
  name: string;
  email: string;
  memberSince: string;
  tier: string;
  cashbackPercent: number;
  cashbackMonth: number;
  vitalityPoints: number;
  pointsThisMonth: number;
  healthScore: number;
  linkedPartners: string[];
  budgetTier?: string;
  preferredCategory?: string;
  avgBasketSpend?: number;
  healthySpendPct?: number;
}

// ===========================================================================
// DEMO-MODE FALLBACK DATA
// ===========================================================================
export const initialProfile: Profile = {
  userId: "CUST-001",
  name: "Aisha Van Wyk",
  email: "aisha.vw@example.co.za",
  memberSince: "Mar 2024",
  tier: "Gold",
  cashbackPercent: 20,
  cashbackMonth: 184.5,
  vitalityPoints: 12480,
  pointsThisMonth: 1340,
  healthScore: 71,
  linkedPartners: ["Checkers", "Woolworths"],
  budgetTier: "mid",
  preferredCategory: "Whole grains and high-fibre starchy foods",
  avgBasketSpend: 642.3,
  healthySpendPct: 0.71,
};

export const initialPantry: PantryItem[] = [
  { id: "p1", name: "Baby marrow Rhodes", category: "Fruit and vegetables", qty: "1", expiresIn: 1, source: "checkers", isHealthy: true },
  { id: "p2", name: "Plain yoghurt Clover", category: "Dairy", qty: "1", expiresIn: 3, source: "woolworths", isHealthy: true },
  { id: "p3", name: "Buckwheat Pouyoukas", category: "Whole grains and high-fibre starchy foods", qty: "1", expiresIn: 120, source: "checkers", isHealthy: true },
  { id: "p4", name: "Rolled oats Bokomo", category: "Whole grains and high-fibre starchy foods", qty: "1", expiresIn: 96, source: "manual", isHealthy: true },
  { id: "p5", name: "Cherry tomatoes Woolworths", category: "Fruit and vegetables", qty: "1", expiresIn: 2, source: "woolworths", isHealthy: true },
  { id: "p6", name: "Chicken breast Rainbow", category: "Animal protein", qty: "1", expiresIn: 3, source: "checkers", isHealthy: true },
  { id: "p7", name: "Lentils Imbo", category: "Legumes", qty: "1", expiresIn: 300, source: "woolworths", isHealthy: true },
];

export const initialShopping: ShoppingItem[] = [
  {
    id: "s1", name: "Chickpeas Imbo", recipe: "Roast Veg & Chickpea Bowl", category: "Legumes",
    stores: [
      { name: "Checkers", price: 29.99, healthy: true },
      { name: "Woolworths", price: 34.99, healthy: true },
    ],
  },
  {
    id: "s2", name: "Cottage cheese Lancewood", recipe: "Roast Veg & Chickpea Bowl", category: "Dairy",
    stores: [
      { name: "Checkers", price: 44.99, healthy: true },
      { name: "Woolworths", price: 41.5, healthy: true },
    ],
  },
  {
    id: "s3", name: "Mixed nuts Montagu", recipe: "Overnight Oats (planned)", category: "Oils, nuts and seeds",
    forFutureRecipe: true,
    stores: [
      { name: "Checkers", price: 62.99, healthy: true },
      { name: "Woolworths", price: 58.99, healthy: true },
    ],
  },
];

export const initialReceipts: Receipt[] = [
  {
    id: "BASK-000001", store: "Checkers", date: "2026-04-13", source: "checkers",
    partner: true, imported: false, total: 536.43, healthyRatio: 75,
    items: [
      { name: "Buckwheat Pouyoukas", price: 117.63, classification: "healthy", category: "Whole grains and high-fibre starchy foods" },
      { name: "Fresh fish Ace", price: 203.25, classification: "healthy", category: "Animal protein" },
      { name: "Ostrich Iwisa", price: 147.86, classification: "healthy", category: "Animal protein" },
      { name: "Ice cream Sasko", price: 67.69, classification: "unhealthy", category: "Unhealthy foods" },
    ],
  },
  {
    id: "BASK-000014", store: "Woolworths", date: "2026-04-09", source: "woolworths",
    partner: true, imported: false, total: 288.4, healthyRatio: 67,
    items: [
      { name: "Baby marrow Rhodes", price: 88.4, classification: "healthy", category: "Fruit and vegetables" },
      { name: "Lentils Imbo", price: 122.1, classification: "healthy", category: "Legumes" },
      { name: "Fizzy cooldrink Coo-ee", price: 77.9, classification: "unhealthy", category: "Unhealthy foods" },
    ],
  },
];

export const initialSwaps: Substitution[] = [
  {
    from: "Ice cream Sasko", to: "Frozen berries Woolworths",
    reason: "You've bought this 4 times recently. Fresh or frozen fruit satisfies the same sweet craving with fibre and no added sugar.",
    category: "Fruit and vegetables", retailer: "Woolworths", timesBought: 4,
  },
  {
    from: "Fizzy cooldrink Coo-ee", to: "Plain yoghurt Clover",
    reason: "You've bought this 3 times recently. Swapping one cooldrink a day cuts a lot of liquid sugar.",
    category: "Dairy", retailer: "Checkers", timesBought: 3,
  },
];

export const habitInsights: Insight[] = [
  { id: "i1", icon: "wheat", title: "Cut back on ice cream", tone: "warn",
    detail: "4 buys in the last 3 months (R271 spent). There's a healthier swap below." },
  { id: "i2", icon: "salad", title: "Strong on whole grains", tone: "good",
    detail: "22 purchases recently — this is your best habit, keep it going." },
  { id: "i3", icon: "droplet", title: "Watch the sugary drinks", tone: "warn",
    detail: "Cooldrinks appeared on 3 of your last 5 slips." },
];

export const trend: TrendMonth[] = [
  { month: "Feb", healthy: 62, unhealthy: 38 },
  { month: "Mar", healthy: 68, unhealthy: 32 },
  { month: "Apr", healthy: 71, unhealthy: 29 },
];

export const badges: Badge[] = [
  { id: "b-scan", icon: "📸", name: "Slip Scanner", desc: "Scan 3 slips", earned: true },
  { id: "b-swap", icon: "🔄", name: "Smart Swapper", desc: "Accept 3 swaps", earned: false, progress: 33 },
  { id: "b-cook", icon: "🥗", name: "Home Cook", desc: "Generate 5 recipes", earned: false, progress: 40 },
  { id: "b-waste", icon: "♻️", name: "Zero Waste", desc: "Save an expiring item", earned: true },
  { id: "b-basket", icon: "🛒", name: "Linked Up", desc: "Import a partner basket", earned: true },
];

export const challenges: Challenge[] = [
  { id: "c-swap", title: "Swap 3 refined carbs", desc: "Accept 3 suggested substitutions", reward: 150, progress: 33, done: false },
  { id: "c-waste", title: "Zero-waste week", desc: "Cook something using an expiring item", reward: 200, progress: 50, done: false },
  { id: "c-scan", title: "Log 5 slips", desc: "Import or scan 5 receipts this month", reward: 100, progress: 100, done: true },
];

export const initialRewards: Reward[] = [
  { reward_id: "rw-1", reward_name: "R50 HealthyFood voucher", partner_name: "Checkers", points_required: 1000, reward_type: "voucher" },
  { reward_id: "rw-2", reward_name: "R100 HealthyFood voucher", partner_name: "Woolworths", points_required: 2000, reward_type: "voucher" },
  { reward_id: "rw-3", reward_name: "Free nutritionist consult", partner_name: "Discovery Vitality", points_required: 5000, reward_type: "service" },
];

export const initialSavedRecipes: SavedRecipe[] = [
  {
    recipe_id: "demo-1",
    recipe_name: "Buckwheat & Roast Veg Bowl",
    recipe_text: `# Buckwheat & Roast Veg Bowl
A warm, high-fibre bowl that uses up the baby marrow before it turns.

**Prep:** 10 min | **Cook:** 25 min

## Ingredients
- 1 cup buckwheat (from your pantry)
- 2 baby marrow, sliced (expiring today)
- 1 punnet cherry tomatoes (2 days left)
- Olive oil, salt, pepper

## Steps
1. Heat the oven to 200°C.
2. Toss the baby marrow and tomatoes in oil, salt and pepper. Roast 20 minutes.
3. Simmer the buckwheat in double its volume of water for 15 minutes, then drain.
4. Fold the roast veg through the buckwheat and finish with a spoon of cottage cheese.`,
    missing_ingredients: [
      { item_name: "Cottage cheese Lancewood", retailer: "Woolworths", category: "Dairy" },
    ],
    is_favourite: false,
    created_at: "2026-04-14T09:12:00",
  },
];
