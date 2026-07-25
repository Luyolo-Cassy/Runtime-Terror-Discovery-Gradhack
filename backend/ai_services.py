import os
import json
import google.generativeai as genai
from typing import List, Dict, Any, Optional

# ==========================================
# 1. AI Client Initialization
# ==========================================
# Make sure GEMINI_API_KEY is loaded in your environment (via .env or terminal)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("WARNING: GEMINI_API_KEY is not set. AI services will fail.")

genai.configure(api_key=GEMINI_API_KEY)

# Using Gemini 1.5 Flash as it is extremely fast and handles both text and images perfectly
model = genai.GenerativeModel('gemini-1.5-flash')

# ==========================================
# 2. Vision: Receipt & Pantry Scanner
# ==========================================
def scan_image_for_ingredients(image_bytes: bytes, mime_type: str = "image/jpeg") -> List[Dict[str, Any]]:
    """
    Takes an image (receipt or open fridge) and returns a structured JSON list of food items.
    """
    prompt = """
    You are an expert grocery data parser for a healthy food application.
    Look at this image (it may be a store receipt or a photo of a fridge/pantry). 
    Extract all the distinct food items you see.
    Categorize each item (e.g., 'Fruit and vegetables', 'Dairy', 'Protein', 'Snacks', etc.).
    
    You MUST return ONLY a valid JSON list of objects in this exact format, with no markdown formatting around it:
    [
        {"item_name": "Apples", "category": "Fruit and vegetables"},
        {"item_name": "Full Cream Milk", "category": "Dairy"}
    ]
    """
    
    try:
        # Pass both the text prompt and the image bytes to Gemini
        response = model.generate_content([
            prompt, 
            {"mime_type": mime_type, "data": image_bytes}
        ])
        
        # Clean up the response in case Gemini wraps it in ```json ... ```
        response_text = response.text.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
            
        # Parse the text into a Python list of dictionaries
        extracted_items = json.loads(response_text.strip())
        return extracted_items

    except json.JSONDecodeError as e:
        print(f"Failed to parse Gemini JSON output: {e}")
        print(f"Raw output was: {response.text}")
        return []
    except Exception as e:
        print(f"Error calling Gemini Vision API: {e}")
        return []


# ==========================================
# 3. Text: Smart Recipe Generator
# ==========================================
def generate_recipe(ingredients: List[str]) -> Optional[str]:
    """
    Takes a list of ingredient strings and generates a healthy recipe using them.
    """
    if not ingredients:
        return "You don't have any ingredients in your pantry yet! Try scanning a receipt."
        
    ingredients_list = ", ".join(ingredients)
    
    prompt = f"""
    You are a professional nutritionist and chef. 
    I have the following ingredients available in my pantry: {ingredients_list}.
    
    Please generate a quick, healthy recipe that utilizes some or all of these ingredients.
    It is okay to assume I have basic staples like salt, pepper, cooking oil, and water.
    
    Format your response in clean Markdown with:
    1. A catchy recipe title (using an H1 # tag).
    2. A brief 1-sentence description.
    3. Estimated Prep & Cook time.
    4. An Ingredients list (bullet points).
    5. Step-by-step instructions (numbered list).
    """
    
    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"Error calling Gemini Text API: {e}")
        return None