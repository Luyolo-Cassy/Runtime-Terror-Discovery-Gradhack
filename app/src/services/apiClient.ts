const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function apiGet(path: string) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  return response.json();
}
