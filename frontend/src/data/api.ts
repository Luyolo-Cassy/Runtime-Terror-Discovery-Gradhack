// ---------------------------------------------------------------------------
// API CLIENT
// ---------------------------------------------------------------------------
// Every call to the FastAPI backend goes through here. No screen knows a URL.
//
// Two modes:
//   LIVE  - a base URL is resolved, so we talk to the real backend
//           (BigQuery + Gemini on Vertex AI).
//   DEMO  - no base URL, so the store falls back to the sample data in
//           ./mockData and the app still runs end-to-end.
//
// The demo fallback is deliberate: on hackathon weekend the app has to keep
// working while the backend is being redeployed, and a judge should never see a
// blank screen because a service account expired. The header badge always says
// which mode you're in.

import axios, { AxiosError } from "axios";
import { Platform } from "react-native";

import type {
  Badge, Challenge, GeneratedRecipe, Insight, PantryItem, RawProfile, Receipt,
  Reward, SavedRecipe, ShoppingItem, Substitution, TrendMonth,
} from "./mockData";

// ---------------------------------------------------------------------------
// BASE URL
// ---------------------------------------------------------------------------
// EXPO_PUBLIC_ vars are inlined at bundle time, so changing .env needs an
// Expo restart (not just a reload).
const CONFIGURED = (process.env.EXPO_PUBLIC_API_BASE ?? "").trim().replace(/\/$/, "");

/**
 * Android emulators can't see the host machine on `localhost` — that resolves
 * to the emulator itself. 10.0.2.2 is the loopback alias to the host, so we
 * rewrite it rather than making everyone remember.
 *
 * A physical device can't reach either one; set EXPO_PUBLIC_API_BASE to your
 * laptop's LAN IP in that case.
 */
function resolveBase(): string {
  if (!CONFIGURED) return "";
  if (Platform.OS === "android") {
    return CONFIGURED.replace("localhost", "10.0.2.2").replace("127.0.0.1", "10.0.2.2");
  }
  return CONFIGURED;
}

export const BASE_URL = resolveBase();

/** True when a backend URL is configured. */
export const IS_LIVE = BASE_URL.length > 0;

export const DEFAULT_USER = process.env.EXPO_PUBLIC_DEFAULT_USER ?? "CUST-001";

const client = axios.create({
  baseURL: BASE_URL,
  // A cold Cloud Run instance plus a Gemini call can genuinely take a while;
  // the default would time out on a legitimate recipe generation.
  timeout: 45000,
});

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Turn any axios failure into an ApiError carrying FastAPI's `detail`. */
function toApiError(err: unknown): ApiError {
  const axiosErr = err as AxiosError<{ detail?: string }>;
  if (axiosErr?.response) {
    const detail = axiosErr.response.data?.detail ?? axiosErr.response.statusText;
    return new ApiError(String(detail), axiosErr.response.status);
  }
  if (axiosErr?.code === "ECONNABORTED") {
    return new ApiError("The request timed out. Is the backend awake?", 0);
  }
  return new ApiError(`Could not reach the API: ${axiosErr?.message ?? String(err)}`, 0);
}

async function get<T>(path: string): Promise<T> {
  if (!IS_LIVE) throw new ApiError("No EXPO_PUBLIC_API_BASE configured (demo mode)", 0);
  try {
    const res = await client.get<T>(path);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!IS_LIVE) throw new ApiError("No EXPO_PUBLIC_API_BASE configured (demo mode)", 0);
  try {
    const res = await client.post<T>(path, body);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

// ---------------------------------------------------------------------------
// AGGREGATE HYDRATION
// ---------------------------------------------------------------------------
export interface HomePayload {
  status: string;
  user_id: string;
  profile: RawProfile | null;
  pantry: PantryItem[];
  receipts: Receipt[];
  shopping: ShoppingItem[];
  insights: Insight[];
  swaps: Substitution[];
  trend: TrendMonth[];
  points: { balance: number; earned_in_app: number; events: number };
  badges: Badge[];
  challenges: Challenge[];
  rewards: Reward[];
}

/** One request that hydrates every screen. Called on load and after a user switch. */
export const getHome = (userId: string) =>
  get<HomePayload>(`/api/home/${encodeURIComponent(userId)}`);

// ---------------------------------------------------------------------------
// PROFILE
// ---------------------------------------------------------------------------
export const getProfile = (userId: string) =>
  get<{ data: RawProfile; insights: Record<string, unknown> }>(
    `/api/profile/${encodeURIComponent(userId)}`,
  );

export interface EvolutionSnapshot {
  basket_count: number;
  avg_basket_spend: number;
  healthy_spend_pct: number | null;
  budget_tier: string | null;
  preferred_category: string | null;
}

/** Requirement 4.4 — the profile at "new user" vs "established" maturity. */
export const getProfileEvolution = (userId: string) =>
  get<{ new_user_profile: EvolutionSnapshot; established_profile: EvolutionSnapshot }>(
    `/api/profile/${encodeURIComponent(userId)}/evolution`,
  );

export const listUsers = () =>
  get<{ users: { user_id: string; name: string; baskets: number }[] }>("/api/users");

// ---------------------------------------------------------------------------
// PANTRY
// ---------------------------------------------------------------------------
export const getPantry = (userId: string) =>
  get<{ items: PantryItem[] }>(`/api/pantry/${encodeURIComponent(userId)}`).then((r) => r.items);

/** Every scanned line lands in one of three states. */
export type ItemStatus = "healthy" | "unhealthy" | "exempt";

export interface ClassifiedItem {
  input_name: string;                 // what Gemini read off the photo
  matched_item: string | null;        // the catalogue product it matched
  category: string | null;
  retailer: string | null;
  is_healthy: boolean;
  status: ItemStatus;
  /** Why it's exempt: not in the catalogue, or the catalogue was unreachable. */
  reason?: "no_match" | "catalogue_offline" | null;
}

export interface ScanResult {
  status: string;
  classified: ClassifiedItem[];
  inserted_items: { item_name: string; category: string }[];
  healthy_count: number;
  unhealthy_count?: number;
  exempt_count?: number;
  total_count: number;
  saved_to_pantry?: number;
  /** False when the catalogue was down — every item will be exempt. */
  catalogue_available?: boolean;
  points_awarded?: number;
  message?: string | null;
}

/** An image picked from the camera roll or captured with the camera. */
export interface ImageAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

/**
 * Upload a slip/food photo. Gemini reads the item names, the catalogue
 * classifies them.
 *
 * The two platforms need genuinely different FormData payloads:
 *
 *   native - React Native's FormData takes a {uri, name, type} object and
 *            streams the file off disk itself. The cast is needed because the
 *            DOM typings for append() don't describe that shape.
 *
 *   web    - react-native-web hands through the browser's real FormData, which
 *            requires a Blob. The picker and the camera both give us a blob:
 *            or data: URI there, so we fetch it back into a Blob first.
 *            Appending the native object shape on web silently serialises to
 *            "[object Object]" and the backend receives an empty upload.
 */
export async function scanSlip(userId: string, asset: ImageAsset): Promise<ScanResult> {
  if (!IS_LIVE) throw new ApiError("No EXPO_PUBLIC_API_BASE configured (demo mode)", 0);

  const name = asset.fileName ?? asset.uri.split("/").pop()?.split("?")[0] ?? "slip.jpg";
  const extMatch = /\.(\w+)$/.exec(name);
  const type = asset.mimeType ?? (extMatch ? `image/${extMatch[1]}` : "image/jpeg");

  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(asset.uri)).blob();
    const safeName = /\.\w+$/.test(name) ? name : `${name}.jpg`;
    form.append("file", blob, safeName);
  } else {
    form.append("file", { uri: asset.uri, name, type } as unknown as Blob);
  }

  try {
    const res = await client.post<ScanResult>(
      `/api/pantry/scan?user_id=${encodeURIComponent(userId)}`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export const addPantryItem = (userId: string, itemName: string, category?: string) =>
  post<{ items: { pantry_item_id: string }[] }>("/api/pantry/item", {
    user_id: userId, item_name: itemName, category,
  });

export const removePantryItem = (userId: string, pantryItemId: string) =>
  post<{ status: string }>("/api/pantry/remove", {
    user_id: userId, pantry_item_id: pantryItemId,
  });

export const substitutePantryItem = (
  userId: string, pantryItemId: string, newName: string, newCategory?: string,
) =>
  post<{ status: string; points_awarded: number }>("/api/pantry/substitute", {
    user_id: userId, pantry_item_id: pantryItemId,
    new_name: newName, new_category: newCategory,
  });

// ---------------------------------------------------------------------------
// RECEIPTS
// ---------------------------------------------------------------------------
export const getReceipts = (userId: string) =>
  get<{ receipts: Receipt[] }>(`/api/receipts/${encodeURIComponent(userId)}`).then((r) => r.receipts);

export const importBasket = (userId: string, basketId: string) =>
  post<{ status: string; count: number; points_awarded: number; message?: string }>(
    "/api/receipts/import",
    { user_id: userId, basket_id: basketId, healthy_only: true },
  );

// ---------------------------------------------------------------------------
// RECIPES
// ---------------------------------------------------------------------------
export const generateRecipe = (userId: string, zeroWaste = false) =>
  post<GeneratedRecipe>("/api/recipes/generate", { user_id: userId, zero_waste: zeroWaste });

export const getSavedRecipes = (userId: string) =>
  get<{ recipes: SavedRecipe[] }>(`/api/recipes/${encodeURIComponent(userId)}`).then((r) => r.recipes);

// ---------------------------------------------------------------------------
// SHOPPING
// ---------------------------------------------------------------------------
export const getShopping = (userId: string) =>
  get<{ items: ShoppingItem[] }>(`/api/shopping/${encodeURIComponent(userId)}`).then((r) => r.items);

export const addToShopping = (
  userId: string,
  items: ({ item_name: string; retailer?: string | null; category?: string | null } | string)[],
  recipeName?: string,
  forFuture = false,
) =>
  post<{ added: number }>("/api/shopping/add", {
    user_id: userId, items, recipe_name: recipeName, for_future: forFuture,
  });

export const buyShoppingItem = (userId: string, shoppingItemId: string) =>
  post<{ status: string; item_name: string; points_awarded: number }>(
    "/api/shopping/bought",
    { user_id: userId, shopping_item_id: shoppingItemId },
  );

export const removeShoppingItem = (userId: string, shoppingItemId: string) =>
  post<{ status: string }>("/api/shopping/remove", {
    user_id: userId, shopping_item_id: shoppingItemId,
  });

// ---------------------------------------------------------------------------
// INSIGHTS
// ---------------------------------------------------------------------------
export const getInsights = (userId: string) =>
  get<{ insights: Insight[]; swaps: Substitution[]; trend: TrendMonth[] }>(
    `/api/insights/${encodeURIComponent(userId)}`,
  );

// ---------------------------------------------------------------------------
// REWARDS & POINTS
// ---------------------------------------------------------------------------
export const getRewards = () =>
  get<{ rewards: Reward[] }>("/api/rewards").then((r) => r.rewards);

export const getPoints = (userId: string) =>
  get<{
    balance: number; earned_in_app: number; events: number;
    badges: Badge[]; challenges: Challenge[];
  }>(`/api/points/${encodeURIComponent(userId)}`);

export const awardPoints = (userId: string, reason: string, amount?: number) =>
  post<{ points_awarded: number }>("/api/points/award", { user_id: userId, reason, amount });

export const claimReward = (userId: string, rewardId: string) =>
  post<{ voucher_code: string; reward_name: string; points_spent: number; message: string }>(
    "/api/rewards/claim",
    { user_id: userId, reward_id: rewardId },
  );