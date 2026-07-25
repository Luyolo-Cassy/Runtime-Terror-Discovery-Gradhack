import axios from 'axios';
import { Platform } from 'react-native';

// Handle localhost routing for mobile emulators
// Android emulator treats localhost as itself, so 10.0.2.2 routes to laptop host
const BASE_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:8000'
  : 'http://localhost:8000';

const api = axios.create({
  baseURL: BASE_URL,
});

const DEFAULT_USER = 'CUST-001'; // a real customer_id from your dataset

/**
 * 1. SCAN RECEIPT / PANTRY PHOTO
 * POST /api/pantry/scan?user_id=...
 * Returns { inserted_items, classified: [{input_name, matched_item, is_healthy, ...}], healthy_count, total_count }
 */
export const analyzeFoodImage = async (imageUri: string, userId: string = DEFAULT_USER) => {
  try {
    const filename = imageUri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : `image/jpeg`;

    const formData = new FormData();
    // @ts-ignore - React Native FormData expects this specific structure
    formData.append('file', { uri: imageUri, name: filename, type });

    const response = await api.post(
      `/api/pantry/scan?user_id=${encodeURIComponent(userId)}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data; // full payload so the UI can show healthy_count etc.
  } catch (error) {
    console.error('Error analyzing image:', error);
    throw error;
  }
};

/**
 * 2. GENERATE RECIPE FROM PANTRY (personalised + catalogue-grounded)
 * POST /api/recipes/generate
 * Returns { recipe, recipe_name, missing_ingredients: [{item_name, retailer, category}], personalized_for }
 */
export const generateRecipe = async (userId: string = DEFAULT_USER) => {
  try {
    const response = await api.post('/api/recipes/generate', { user_id: userId });
    return response.data;
  } catch (error) {
    console.error('Error generating recipe:', error);
    throw error;
  }
};

/**
 * 3. GET USER PROFILE & INSIGHTS
 * GET /api/profile/{user_id}
 * Returns { data: {...full profile...}, insights: {...} }
 */
export const getUserProfile = async (userId: string = DEFAULT_USER) => {
  try {
    const response = await api.get(`/api/profile/${userId}`);
    return response.data; // { status, data, insights }
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
};

/**
 * 4. LIST PANTRY ITEMS
 * GET /api/pantry/{user_id}
 */
export const getPantry = async (userId: string = DEFAULT_USER) => {
  try {
    const response = await api.get(`/api/pantry/${userId}`);
    return response.data.items || [];
  } catch (error) {
    console.error('Error fetching pantry:', error);
    throw error;
  }
};

/**
 * 5. LIST SAVED RECIPES
 * GET /api/recipes/{user_id}
 */
export const getSavedRecipes = async (userId: string = DEFAULT_USER) => {
  try {
    const response = await api.get(`/api/recipes/${userId}`);
    return response.data.recipes || [];
  } catch (error) {
    console.error('Error fetching saved recipes:', error);
    throw error;
  }
};

/**
 * 6. LIST REWARDS CATALOGUE
 * GET /api/rewards
 */
export const listRewards = async () => {
  try {
    const response = await api.get('/api/rewards');
    return response.data.rewards || [];
  } catch (error) {
    console.error('Error fetching rewards:', error);
    throw error;
  }
};

/**
 * 7. CLAIM REWARD VOUCHER
 * POST /api/rewards/claim
 */
export const claimReward = async (rewardId: string, userId: string = DEFAULT_USER) => {
  try {
    const response = await api.post('/api/rewards/claim', {
      user_id: userId,
      reward_id: rewardId,
    });
    return response.data; // { voucher_code, message }
  } catch (error) {
    console.error('Error claiming reward:', error);
    throw error;
  }
};