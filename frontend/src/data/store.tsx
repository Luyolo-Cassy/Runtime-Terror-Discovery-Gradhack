// ---------------------------------------------------------------------------
// APP STATE
// ---------------------------------------------------------------------------
// One reducer holds everything; one `actions` object wraps the API calls.
// Components never call fetch and never see a URL — they call an action.
//
// Every action follows the same shape:
//   1. optimistic local update, so the UI responds instantly
//   2. the real API call
//   3. reconcile with what the server actually returned (points, ids, errors)
//
// In DEMO mode (no EXPO_PUBLIC_API_BASE) step 2 is skipped and step 1 stands, which is
// why the app is fully clickable with no backend running.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef,
  type ReactNode,
} from "react";
import * as api from "./api";
import {
  initialPantry, initialProfile, initialReceipts, initialRewards,
  initialSavedRecipes, initialShopping, initialSwaps,
  habitInsights, trend as initialTrend, badges as initialBadges,
  challenges as initialChallenges,
  type Badge, type Challenge, type GeneratedRecipe, type Insight,
  type MissingIngredient, type PantryItem, type Profile, type RawProfile,
  type Receipt, type Reward, type SavedRecipe, type ShoppingItem,
  type Substitution, type TrendMonth,
} from "./mockData";

// ---------------------------------------------------------------------------
// PROFILE MAPPING
// ---------------------------------------------------------------------------
// Vitality status drives HealthyFood CashBack. These are the tiers the app
// shows; the percentages are the demo's own scale, not published Discovery rates.
const TIER_CASHBACK: Record<string, number> = {
  Blue: 10, Bronze: 15, Silver: 20, Gold: 25, Diamond: 30,
};

export const TIERS = ["Blue", "Bronze", "Silver", "Gold", "Diamond"];

function titleCase(value?: string | null) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** Turn a raw `user_profiles` row into the shape the screens render. */
function mapProfile(raw: RawProfile | null, userId: string, points: number, previous?: Profile): Profile {
  if (!raw) {
    return { ...initialProfile, userId, vitalityPoints: points || initialProfile.vitalityPoints };
  }

  const tier = titleCase(raw.vitality_tier) || "Blue";
  const pct = typeof raw.healthy_spend_pct === "number" ? raw.healthy_spend_pct : undefined;
  const partners = raw.preferred_retailer
    ? [String(raw.preferred_retailer)]
    : ["Checkers", "Woolworths"];

  return {
    userId,
    name: String(raw.customer_name ?? previous?.name ?? "HealthyFood member"),
    // The dataset has no email column — this is a display placeholder the user
    // can edit locally, not a real address pulled from Discovery.
    email: previous?.email ?? `${userId.toLowerCase()}@healthyfood.demo`,
    memberSince: previous?.memberSince ?? "—",
    tier,
    cashbackPercent: TIER_CASHBACK[tier] ?? 10,
    cashbackMonth: Number(raw.avg_basket_spend ?? 0) * ((TIER_CASHBACK[tier] ?? 10) / 100),
    vitalityPoints: points,
    pointsThisMonth: previous?.pointsThisMonth ?? 0,
    healthScore: pct != null ? Math.round(pct * 100) : 0,
    linkedPartners: previous?.linkedPartners ?? partners,
    budgetTier: raw.budget_tier ? String(raw.budget_tier) : undefined,
    preferredCategory: raw.preferred_category ? String(raw.preferred_category) : undefined,
    avgBasketSpend: raw.avg_basket_spend != null ? Number(raw.avg_basket_spend) : undefined,
    healthySpendPct: pct,
  };
}

/**
 * Match a suggested swap back to the pantry row it applies to, so "Swap it"
 * knows which item to rename. Falls back to a loose contains-match because the
 * catalogue name and the pantry name aren't always character-identical.
 */
function resolveSwapTargets(swaps: Substitution[], pantry: PantryItem[]): Substitution[] {
  return swaps.map((swap) => {
    const from = swap.from.trim().toLowerCase();
    const hit =
      pantry.find((p) => p.name.trim().toLowerCase() === from) ??
      pantry.find((p) => p.name.toLowerCase().includes(from) || from.includes(p.name.toLowerCase()));
    return { ...swap, pantryId: hit?.id };
  });
}

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------
export interface Voucher {
  code: string;
  rewardName: string;
  claimedAt: string;
}

export interface AppState {
  mode: "live" | "demo";
  loading: boolean;
  hydrated: boolean;
  error: string | null;
  userId: string;
  users: { user_id: string; name: string; baskets: number }[];

  profile: Profile;
  pantry: PantryItem[];
  shopping: ShoppingItem[];
  receipts: Receipt[];
  insights: Insight[];
  swaps: Substitution[];
  trend: TrendMonth[];

  points: number;
  badges: Badge[];
  challenges: Challenge[];
  rewards: Reward[];
  vouchers: Voucher[];

  recipes: SavedRecipe[];
  currentRecipe: GeneratedRecipe | null;
  /** Result of the most recent slip scan, so the UI can show what was read. */
  lastScan: api.ScanResult | null;

  /** Per-action spinners, keyed by an arbitrary label e.g. "recipe" or "scan". */
  busy: Record<string, boolean>;
  toast: string | null;
}

type Action =
  | { type: "HYDRATE_START"; userId: string }
  | { type: "HYDRATE_OK"; payload: Partial<AppState> }
  | { type: "HYDRATE_FAIL"; error: string }
  | { type: "SET_USERS"; users: AppState["users"] }
  | { type: "BUSY"; key: string; value: boolean }
  | { type: "TOAST"; message: string | null }
  | { type: "SET_PANTRY"; pantry: PantryItem[] }
  | { type: "ADD_PANTRY"; items: PantryItem[] }
  | { type: "REMOVE_PANTRY"; id: string }
  | { type: "SUBSTITUTE"; pantryId?: string; from: string; to: string }
  | { type: "MARK_RECEIPT_IMPORTED"; receiptId: string }
  | { type: "SET_SHOPPING"; shopping: ShoppingItem[] }
  | { type: "ADD_SHOPPING"; items: ShoppingItem[] }
  | { type: "TOGGLE_SHOPPING"; id: string }
  | { type: "REMOVE_SHOPPING"; id: string }
  | { type: "SET_RECIPE"; recipe: GeneratedRecipe | null }
  | { type: "SET_SCAN"; scan: api.ScanResult | null }
  | { type: "ADD_SAVED_RECIPE"; recipe: SavedRecipe }
  | { type: "ADD_POINTS"; amount: number }
  | { type: "SET_POINTS"; points: number; badges?: Badge[]; challenges?: Challenge[] }
  | { type: "ADD_VOUCHER"; voucher: Voucher }
  | { type: "UPDATE_PROFILE"; patch: Partial<Profile> }
  | { type: "RESET" };

function demoState(userId: string): AppState {
  return {
    mode: "demo",
    loading: false,
    hydrated: true,
    error: null,
    userId,
    users: [],
    profile: { ...initialProfile, userId },
    pantry: initialPantry,
    shopping: initialShopping,
    receipts: initialReceipts,
    insights: habitInsights,
    swaps: resolveSwapTargets(initialSwaps, initialPantry),
    trend: initialTrend,
    points: initialProfile.vitalityPoints,
    badges: initialBadges,
    challenges: initialChallenges,
    rewards: initialRewards,
    vouchers: [],
    recipes: initialSavedRecipes,
    currentRecipe: null,
    lastScan: null,
    busy: {},
    toast: null,
  };
}

const initialState: AppState = {
  ...demoState(api.DEFAULT_USER),
  mode: api.IS_LIVE ? "live" : "demo",
  loading: api.IS_LIVE,
  hydrated: !api.IS_LIVE,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE_START":
      return { ...state, loading: true, error: null, userId: action.userId };

    case "HYDRATE_OK":
      return { ...state, ...action.payload, loading: false, hydrated: true, error: null };

    case "HYDRATE_FAIL":
      // Keep whatever data we already have and surface the problem in the header
      // rather than blanking the screen.
      return { ...state, loading: false, hydrated: true, error: action.error, mode: "demo" };

    case "SET_USERS":
      return { ...state, users: action.users };

    case "BUSY":
      return { ...state, busy: { ...state.busy, [action.key]: action.value } };

    case "TOAST":
      return { ...state, toast: action.message };

    case "SET_PANTRY":
      return { ...state, pantry: action.pantry, swaps: resolveSwapTargets(state.swaps, action.pantry) };

    case "ADD_PANTRY": {
      const existing = new Set(state.pantry.map((p) => p.name.toLowerCase()));
      const fresh = action.items.filter((i) => !existing.has(i.name.toLowerCase()));
      const pantry = [...fresh, ...state.pantry];
      return { ...state, pantry, swaps: resolveSwapTargets(state.swaps, pantry) };
    }

    case "REMOVE_PANTRY": {
      const pantry = state.pantry.filter((p) => p.id !== action.id);
      return { ...state, pantry, swaps: resolveSwapTargets(state.swaps, pantry) };
    }

    case "SUBSTITUTE": {
      const pantry = state.pantry.map((p) =>
        p.id === action.pantryId ? { ...p, name: action.to, substituted: true } : p,
      );
      return {
        ...state,
        pantry,
        // The swap is spent — drop it so the card doesn't offer it again.
        swaps: state.swaps.filter((s) => s.from !== action.from),
      };
    }

    case "MARK_RECEIPT_IMPORTED":
      return {
        ...state,
        receipts: state.receipts.map((r) =>
          r.id === action.receiptId ? { ...r, imported: true } : r,
        ),
      };

    case "SET_SHOPPING":
      return { ...state, shopping: action.shopping };

    case "ADD_SHOPPING": {
      const existing = new Set(state.shopping.map((s) => s.name.toLowerCase()));
      const fresh = action.items.filter((i) => !existing.has(i.name.toLowerCase()));
      return { ...state, shopping: [...state.shopping, ...fresh] };
    }

    case "TOGGLE_SHOPPING":
      return {
        ...state,
        shopping: state.shopping.map((s) =>
          s.id === action.id ? { ...s, checked: !s.checked } : s,
        ),
      };

    case "REMOVE_SHOPPING":
      return { ...state, shopping: state.shopping.filter((s) => s.id !== action.id) };

    case "SET_RECIPE":
      return { ...state, currentRecipe: action.recipe };

    case "SET_SCAN":
      return { ...state, lastScan: action.scan };

    case "ADD_SAVED_RECIPE":
      return { ...state, recipes: [action.recipe, ...state.recipes] };

    case "ADD_POINTS":
      return { ...state, points: state.points + action.amount };

    case "SET_POINTS":
      return {
        ...state,
        points: action.points,
        badges: action.badges ?? state.badges,
        challenges: action.challenges ?? state.challenges,
      };

    case "ADD_VOUCHER":
      return { ...state, vouchers: [action.voucher, ...state.vouchers] };

    case "UPDATE_PROFILE":
      return { ...state, profile: { ...state.profile, ...action.patch } };

    case "RESET":
      return demoState(state.userId);

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// CONTEXT
// ---------------------------------------------------------------------------
export interface Actions {
  hydrate: (userId?: string) => Promise<void>;
  switchUser: (userId: string) => Promise<void>;
  loadUsers: () => Promise<void>;
  importReceipt: (receiptId: string) => Promise<void>;
  scanSlip: (asset: api.ImageAsset) => Promise<void>;
  clearScan: () => void;
  addPantryItem: (name: string) => Promise<void>;
  removePantryItem: (id: string) => Promise<void>;
  acceptSwap: (swap: Substitution) => Promise<void>;
  generateRecipe: (zeroWaste?: boolean) => Promise<GeneratedRecipe | null>;
  addMissingToShopping: (
    missing: MissingIngredient[], recipeName?: string, forFuture?: boolean,
  ) => Promise<void>;
  toggleShopping: (id: string) => void;
  buyShopping: (id: string) => Promise<void>;
  removeShopping: (id: string) => Promise<void>;
  claimReward: (reward: Reward) => Promise<void>;
  completeChallenge: (challenge: Challenge) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => void;
  toast: (message: string) => void;
  clearToast: () => void;
  reset: () => void;
}

const AppContext = createContext<{ state: AppState; actions: Actions } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Async actions need the CURRENT state without re-creating themselves on
  // every render, so we mirror state into a ref.
  const ref = useRef(state);
  ref.current = state;

  const toast = useCallback((message: string) => dispatch({ type: "TOAST", message }), []);
  const clearToast = useCallback(() => dispatch({ type: "TOAST", message: null }), []);

  const setBusy = useCallback(
    (key: string, value: boolean) => dispatch({ type: "BUSY", key, value }),
    [],
  );

  /** Shared error handling: show why it failed, don't lose the optimistic update. */
  const fail = useCallback((prefix: string, err: unknown) => {
    const message = err instanceof api.ApiError ? err.message : String(err);
    dispatch({ type: "TOAST", message: `${prefix}: ${message}` });
  }, []);

  // -------------------------------------------------------------------------
  // HYDRATION
  // -------------------------------------------------------------------------
  const hydrate = useCallback(async (userId?: string) => {
    const id = userId ?? ref.current.userId;
    if (!api.IS_LIVE) {
      dispatch({ type: "HYDRATE_OK", payload: { ...demoState(id) } });
      return;
    }

    dispatch({ type: "HYDRATE_START", userId: id });
    try {
      const home = await api.getHome(id);
      const points = home.points?.balance ?? 0;
      const pantry = home.pantry ?? [];

      dispatch({
        type: "HYDRATE_OK",
        payload: {
          mode: "live",
          userId: id,
          profile: mapProfile(home.profile, id, points, ref.current.profile),
          pantry,
          shopping: home.shopping ?? [],
          receipts: home.receipts ?? [],
          insights: home.insights?.length ? home.insights : habitInsights,
          swaps: resolveSwapTargets(home.swaps ?? [], pantry),
          trend: home.trend?.length ? home.trend : [],
          points,
          badges: home.badges ?? [],
          challenges: home.challenges ?? [],
          rewards: home.rewards ?? [],
        },
      });

      // Saved recipes are a separate, non-blocking call — the home screen
      // doesn't need them, so we don't make everyone wait for them.
      api.getSavedRecipes(id)
        .then((recipes) => dispatch({ type: "HYDRATE_OK", payload: { recipes } }))
        .catch(() => undefined);
    } catch (err) {
      const message = err instanceof api.ApiError ? err.message : String(err);
      dispatch({ type: "HYDRATE_FAIL", error: message });
    }
  }, []);

  const loadUsers = useCallback(async () => {
    if (!api.IS_LIVE) return;
    try {
      const { users } = await api.listUsers();
      dispatch({ type: "SET_USERS", users });
    } catch {
      /* the persona switcher is optional; silence is fine */
    }
  }, []);

  const switchUser = useCallback(async (userId: string) => {
    await hydrate(userId);
    dispatch({ type: "TOAST", message: `Switched to ${userId}` });
  }, [hydrate]);

  useEffect(() => {
    void hydrate();
    void loadUsers();
  }, [hydrate, loadUsers]);

  // -------------------------------------------------------------------------
  // RECEIPTS
  // -------------------------------------------------------------------------
  const importReceipt = useCallback(async (receiptId: string) => {
    const receipt = ref.current.receipts.find((r) => r.id === receiptId);
    if (!receipt || receipt.imported) return;

    const healthyLines = receipt.items.filter((i) => i.classification === "healthy");
    dispatch({ type: "MARK_RECEIPT_IMPORTED", receiptId });
    dispatch({
      type: "ADD_PANTRY",
      items: healthyLines.map((li, i) => ({
        id: `${receipt.id}-${i}`,
        name: li.name,
        category: li.category ?? "Groceries",
        qty: "1",
        expiresIn: 14,
        source: receipt.source,
        isHealthy: true,
      })),
    });

    if (!api.IS_LIVE) {
      dispatch({ type: "ADD_POINTS", amount: 15 });
      toast(`Added ${healthyLines.length} items from ${receipt.store} (+15 pts)`);
      return;
    }

    setBusy(`receipt-${receiptId}`, true);
    try {
      const res = await api.importBasket(ref.current.userId, receiptId);
      if (res.status === "empty") {
        toast(res.message ?? "Nothing to import from that basket.");
      } else {
        dispatch({ type: "ADD_POINTS", amount: res.points_awarded ?? 0 });
        toast(`Added ${res.count} items from ${receipt.store} (+${res.points_awarded} pts)`);
      }
      dispatch({ type: "SET_PANTRY", pantry: await api.getPantry(ref.current.userId) });
    } catch (err) {
      fail("Import failed", err);
    } finally {
      setBusy(`receipt-${receiptId}`, false);
    }
  }, [fail, setBusy, toast]);

  const scanSlip = useCallback(async (asset: api.ImageAsset) => {
    // Demo mode still walks the whole flow so the screen can be demonstrated
    // without a backend. The classifications below are canned, not real.
    if (!api.IS_LIVE) {
      const demo = demoScanResult();
      dispatch({ type: "SET_SCAN", scan: demo });
      dispatch({
        type: "ADD_PANTRY",
        items: demo.classified
          .filter((c) => c.is_healthy)
          .map((c, i) => ({
            id: `scan-demo-${Date.now()}-${i}`,
            name: c.matched_item ?? c.input_name,
            category: c.category ?? "Groceries",
            qty: "1",
            expiresIn: 7,
            source: "scan",
            isHealthy: true,
          })),
      });
      dispatch({ type: "ADD_POINTS", amount: 25 });
      toast(`Demo scan: ${demo.healthy_count} of ${demo.total_count} are HealthyFood (+25 pts)`);
      return;
    }

    setBusy("scan", true);
    dispatch({ type: "SET_SCAN", scan: null });
    toast("Reading your slip…");
    try {
      const res = await api.scanSlip(ref.current.userId, asset);
      if (!res.total_count) {
        toast(res.message ?? "No food items were recognised in that image.");
        return;
      }
      dispatch({ type: "SET_SCAN", scan: res });
      dispatch({ type: "ADD_POINTS", amount: res.points_awarded ?? 0 });
      dispatch({ type: "SET_PANTRY", pantry: await api.getPantry(ref.current.userId) });
      toast(
        `Found ${res.total_count} items, ${res.healthy_count} HealthyFood ` +
        `(+${res.points_awarded ?? 0} pts)`,
      );
    } catch (err) {
      fail("Scan failed", err);
    } finally {
      setBusy("scan", false);
    }
  }, [fail, setBusy, toast]);

  const clearScan = useCallback(() => dispatch({ type: "SET_SCAN", scan: null }), []);

  // -------------------------------------------------------------------------
  // PANTRY
  // -------------------------------------------------------------------------
  const addPantryItem = useCallback(async (name: string) => {
    const clean = name.trim();
    if (!clean) return;

    dispatch({
      type: "ADD_PANTRY",
      items: [{ id: `manual-${Date.now()}`, name: clean, category: "Groceries", qty: "1", expiresIn: 14, source: "manual" }],
    });

    if (!api.IS_LIVE) {
      toast(`Added ${clean}`);
      return;
    }
    try {
      await api.addPantryItem(ref.current.userId, clean);
      dispatch({ type: "SET_PANTRY", pantry: await api.getPantry(ref.current.userId) });
      toast(`Added ${clean}`);
    } catch (err) {
      fail("Could not add item", err);
    }
  }, [fail, toast]);

  const removePantryItem = useCallback(async (id: string) => {
    const item = ref.current.pantry.find((p) => p.id === id);
    dispatch({ type: "REMOVE_PANTRY", id });
    if (!api.IS_LIVE || !item) return;
    try {
      await api.removePantryItem(ref.current.userId, id);
    } catch (err) {
      fail("Could not remove item", err);
    }
  }, [fail]);

  const acceptSwap = useCallback(async (swap: Substitution) => {
    dispatch({ type: "SUBSTITUTE", pantryId: swap.pantryId, from: swap.from, to: swap.to });

    if (!api.IS_LIVE || !swap.pantryId) {
      dispatch({ type: "ADD_POINTS", amount: 10 });
      toast(`Swapped to ${swap.to} (+10 pts)`);
      return;
    }
    try {
      const res = await api.substitutePantryItem(
        ref.current.userId, swap.pantryId, swap.to, swap.category ?? undefined,
      );
      dispatch({ type: "ADD_POINTS", amount: res.points_awarded ?? 10 });
      toast(`Swapped to ${swap.to} (+${res.points_awarded ?? 10} pts)`);
    } catch (err) {
      fail("Swap failed", err);
    }
  }, [fail, toast]);

  // -------------------------------------------------------------------------
  // RECIPES
  // -------------------------------------------------------------------------
  const generateRecipe = useCallback(async (zeroWaste = false): Promise<GeneratedRecipe | null> => {
    if (!api.IS_LIVE) {
      const demo = ref.current.recipes[0];
      const fake: GeneratedRecipe = {
        status: "success",
        recipe_id: demo?.recipe_id,
        recipe_name: demo?.recipe_name ?? "Demo recipe",
        recipe: demo?.recipe_text ?? "",
        missing_ingredients: demo?.missing_ingredients ?? [],
        used_pantry_items: ref.current.pantry.map((p) => p.name),
        focus_items: zeroWaste
          ? ref.current.pantry.filter((p) => p.expiresIn <= 3).map((p) => p.name)
          : [],
        personalized_for: {
          budget_tier: ref.current.profile.budgetTier,
          preferred_category: ref.current.profile.preferredCategory,
          healthy_spend_pct: ref.current.profile.healthySpendPct,
          vitality_tier: ref.current.profile.tier,
        },
      };
      dispatch({ type: "SET_RECIPE", recipe: fake });
      dispatch({ type: "ADD_POINTS", amount: zeroWaste ? 30 : 20 });
      toast(`Demo recipe ready (+${zeroWaste ? 30 : 20} pts)`);
      return fake;
    }

    setBusy("recipe", true);
    try {
      const res = await api.generateRecipe(ref.current.userId, zeroWaste);
      if (res.status === "empty") {
        toast(res.message ?? "Your pantry is empty — import a basket first.");
        return null;
      }
      dispatch({ type: "SET_RECIPE", recipe: res });
      dispatch({ type: "ADD_POINTS", amount: res.points_awarded ?? 0 });
      if (res.recipe_id) {
        dispatch({
          type: "ADD_SAVED_RECIPE",
          recipe: {
            recipe_id: res.recipe_id,
            recipe_name: res.recipe_name ?? "Recipe",
            recipe_text: res.recipe ?? "",
            missing_ingredients: res.missing_ingredients ?? [],
            is_favourite: false,
            created_at: new Date().toISOString(),
          },
        });
      }
      toast(`${res.recipe_name} is ready (+${res.points_awarded ?? 0} pts)`);
      return res;
    } catch (err) {
      fail("Recipe generation failed", err);
      return null;
    } finally {
      setBusy("recipe", false);
    }
  }, [fail, setBusy, toast]);

  const addMissingToShopping = useCallback(async (
    missing: MissingIngredient[], recipeName?: string, forFuture = false,
  ) => {
    if (!missing.length) return;

    dispatch({
      type: "ADD_SHOPPING",
      items: missing.map((m, i) => ({
        id: `pending-${Date.now()}-${i}`,
        name: m.item_name,
        category: m.category,
        recipe: recipeName,
        forFutureRecipe: forFuture,
        stores: m.retailer ? [{ name: m.retailer, price: 0, healthy: true }] : [],
      })),
    });

    if (!api.IS_LIVE) {
      toast(`${missing.length} item(s) added to your shopping list`);
      return;
    }
    try {
      await api.addToShopping(ref.current.userId, missing, recipeName, forFuture);
      dispatch({ type: "SET_SHOPPING", shopping: await api.getShopping(ref.current.userId) });
      toast(`${missing.length} item(s) added to your shopping list`);
    } catch (err) {
      fail("Could not update shopping list", err);
    }
  }, [fail, toast]);

  // -------------------------------------------------------------------------
  // SHOPPING
  // -------------------------------------------------------------------------
  const toggleShopping = useCallback((id: string) => {
    dispatch({ type: "TOGGLE_SHOPPING", id });
  }, []);

  const buyShopping = useCallback(async (id: string) => {
    const item = ref.current.shopping.find((s) => s.id === id);
    if (!item) return;

    dispatch({ type: "REMOVE_SHOPPING", id });
    dispatch({
      type: "ADD_PANTRY",
      items: [{
        id: `bought-${id}`, name: item.name, category: item.category ?? "Groceries",
        qty: "1", expiresIn: 14, source: "shopping", isHealthy: true,
      }],
    });

    if (!api.IS_LIVE) {
      dispatch({ type: "ADD_POINTS", amount: 5 });
      toast(`Bought ${item.name} — moved to pantry (+5 pts)`);
      return;
    }
    try {
      const res = await api.buyShoppingItem(ref.current.userId, id);
      dispatch({ type: "ADD_POINTS", amount: res.points_awarded ?? 0 });
      dispatch({ type: "SET_PANTRY", pantry: await api.getPantry(ref.current.userId) });
      toast(`Bought ${item.name} — moved to pantry (+${res.points_awarded ?? 0} pts)`);
    } catch (err) {
      fail("Could not mark as bought", err);
    }
  }, [fail, toast]);

  const removeShopping = useCallback(async (id: string) => {
    dispatch({ type: "REMOVE_SHOPPING", id });
    if (!api.IS_LIVE) return;
    try {
      await api.removeShoppingItem(ref.current.userId, id);
    } catch (err) {
      fail("Could not remove item", err);
    }
  }, [fail]);

  // -------------------------------------------------------------------------
  // REWARDS
  // -------------------------------------------------------------------------
  const claimReward = useCallback(async (reward: Reward) => {
    const required = reward.points_required ?? 0;
    if (ref.current.points < required) {
      toast(`You need ${required - ref.current.points} more points for that.`);
      return;
    }

    if (!api.IS_LIVE) {
      const code = `HEALTHY-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      dispatch({ type: "ADD_POINTS", amount: -required });
      dispatch({
        type: "ADD_VOUCHER",
        voucher: { code, rewardName: reward.reward_name, claimedAt: new Date().toISOString() },
      });
      toast(`Claimed ${reward.reward_name} — code ${code}`);
      return;
    }

    setBusy(`reward-${reward.reward_id}`, true);
    try {
      const res = await api.claimReward(ref.current.userId, reward.reward_id);
      const points = await api.getPoints(ref.current.userId);
      dispatch({ type: "SET_POINTS", points: points.balance, badges: points.badges, challenges: points.challenges });
      dispatch({ type: "UPDATE_PROFILE", patch: { vitalityPoints: points.balance } });
      dispatch({
        type: "ADD_VOUCHER",
        voucher: {
          code: res.voucher_code,
          rewardName: res.reward_name ?? reward.reward_name,
          claimedAt: new Date().toISOString(),
        },
      });
      toast(`Claimed ${res.reward_name} — code ${res.voucher_code}`);
    } catch (err) {
      fail("Could not claim reward", err);
    } finally {
      setBusy(`reward-${reward.reward_id}`, false);
    }
  }, [fail, setBusy, toast]);

  /**
   * Challenges aren't claimed manually — progress comes from the ledger of
   * things the user actually did. This just re-reads that ledger so a completed
   * challenge pays out and the badges refresh.
   */
  const completeChallenge = useCallback(async (challenge: Challenge) => {
    if (!challenge.done) {
      toast(`${challenge.title}: ${challenge.have ?? 0}/${challenge.target ?? "?"} so far — keep going.`);
      return;
    }

    if (!api.IS_LIVE) {
      dispatch({ type: "ADD_POINTS", amount: challenge.reward });
      toast(`Challenge complete: ${challenge.title} (+${challenge.reward} pts)`);
      return;
    }
    try {
      await api.awardPoints(ref.current.userId, `challenge:${challenge.id}`, challenge.reward);
      const points = await api.getPoints(ref.current.userId);
      dispatch({
        type: "SET_POINTS",
        points: points.balance,
        badges: points.badges,
        challenges: points.challenges,
      });
      dispatch({ type: "UPDATE_PROFILE", patch: { vitalityPoints: points.balance } });
      toast(`Challenge complete: ${challenge.title} (+${challenge.reward} pts)`);
    } catch (err) {
      fail("Could not claim challenge", err);
    }
  }, [fail, toast]);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    dispatch({ type: "UPDATE_PROFILE", patch });
    dispatch({ type: "TOAST", message: "Profile updated" });
  }, []);

  const reset = useCallback(() => {
    if (api.IS_LIVE) {
      void hydrate();
      dispatch({ type: "TOAST", message: "Reloaded from the API" });
    } else {
      dispatch({ type: "RESET" });
      dispatch({ type: "TOAST", message: "Demo data reset" });
    }
  }, [hydrate]);

  const actions = useMemo<Actions>(() => ({
    hydrate, switchUser, loadUsers, importReceipt, scanSlip, clearScan,
    addPantryItem, removePantryItem, acceptSwap, generateRecipe,
    addMissingToShopping, toggleShopping, buyShopping, removeShopping,
    claimReward, completeChallenge, updateProfile, toast, clearToast, reset,
  }), [
    hydrate, switchUser, loadUsers, importReceipt, scanSlip, clearScan,
    addPantryItem, removePantryItem, acceptSwap, generateRecipe,
    addMissingToShopping, toggleShopping, buyShopping, removeShopping,
    claimReward, completeChallenge, updateProfile, toast, clearToast, reset,
  ]);

  return (
    <AppContext.Provider value={{ state, actions }}>{children}</AppContext.Provider>
  );
}

/**
 * A plausible scan result for demo mode.
 *
 * Shaped exactly like the real /api/pantry/scan response so the results card
 * renders identically whether or not a backend is attached. Note the deliberate
 * "no catalogue match" row - that case has to be visible, because it's how the
 * classifier behaves honestly when it can't place an item.
 */
function demoScanResult(): api.ScanResult {
  const classified: api.ClassifiedItem[] = [
    { input_name: "Baby marrow", matched_item: "Baby marrow Rhodes", category: "Fruit and vegetables", retailer: "Checkers", is_healthy: true, status: "healthy" },
    { input_name: "Rolled oats 1kg", matched_item: "Rolled oats Bokomo", category: "Whole grains and high-fibre starchy foods", retailer: "Checkers", is_healthy: true, status: "healthy" },
    { input_name: "Lentils", matched_item: "Lentils Imbo", category: "Legumes", retailer: "Woolworths", is_healthy: true, status: "healthy" },
    { input_name: "Chocolate slab", matched_item: "Chocolate Beacon", category: "Unhealthy foods", retailer: "Checkers", is_healthy: false, status: "unhealthy" },
    { input_name: "Serviettes 2ply", matched_item: null, category: null, retailer: null, is_healthy: false, status: "exempt", reason: "no_match" },
  ];
  const healthy = classified.filter((c) => c.status === "healthy");
  return {
    status: "success",
    classified,
    inserted_items: healthy.map((c) => ({
      item_name: c.matched_item ?? c.input_name,
      category: c.category ?? "Groceries",
    })),
    healthy_count: healthy.length,
    unhealthy_count: classified.filter((c) => c.status === "unhealthy").length,
    exempt_count: classified.filter((c) => c.status === "exempt").length,
    total_count: classified.length,
    saved_to_pantry: healthy.length,
    catalogue_available: true,
    points_awarded: 25,
  };
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}