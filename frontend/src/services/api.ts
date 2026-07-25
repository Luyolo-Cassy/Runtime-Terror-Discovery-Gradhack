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

/**
 * 1. SCAN RECEIPT / PANTRY PHOTO
 * Sends image file to POST /api/pantry/scan?user_id=...
 */
export const analyzeFoodImage = async (imageUri: string, userId: string = "test_user_123") => {
  try {
    const filename = imageUri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : `image/jpeg`;

    const formData = new FormData();
    // @ts-ignore - React Native FormData expects this specific structure
    formData.append('file', { uri: imageUri, name: filename, type });

    // Note: main.py expects user_id as a query parameter
    const response = await api.post(
      `/api/pantry/scan?user_id=${encodeURIComponent(userId)}`, 
      formData, 
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    // main.py returns: { "status": "success", "inserted_items": [...] }
    return response.data.inserted_items || [];

  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
};

/**
 * 2. GENERATE RECIPE FROM PANTRY
 * Sends request to POST /api/recipes/generate
 */
export const generateRecipe = async (userId: string = "test_user_123") => {
  try {
    const response = await api.post('/api/recipes/generate', { 
      user_id: userId 
    });
    // main.py returns: { "status": "success", "recipe_id": "...", "recipe": "Markdown text..." }
    return response.data;
  } catch (error) {
    console.error("Error generating recipe:", error);
    throw error;
  }
};

/**
 * 3. GET USER PROFILE & POINTS STATS
 * Sends request to GET /api/profile/{user_id}
 */
export const getUserProfile = async (userId: string = "test_user_123") => {
  try {
    const response = await api.get(`/api/profile/${userId}`);
    // main.py returns: { "status": "success", "data": { ...user_data } }
    return response.data.data;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    throw error;
  }
};

/**
 * 4. CLAIM REWARD VOUCHER
 * Sends request to POST /api/rewards/claim
 */
export const claimReward = async (rewardId: string, userId: string = "test_user_123") => {
  try {
    const response = await api.post('/api/rewards/claim', {
      user_id: userId,
      reward_id: rewardId,
    });
    // main.py returns: { "status": "success", "voucher_code": "HEALTHY-...", "message": "..." }
    return response.data;
  } catch (error) {
    console.error("Error claiming reward:", error);
    throw error;
  }
};