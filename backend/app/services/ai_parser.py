import google.generativeai as genai
import os
import json
from typing import Optional, List, Dict
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=api_key)

# The model choice: Gemini-1.5-flash is good for quick tasks
model = genai.GenerativeModel("gemini-1.5-flash")

# Define expected response schema for labels
class LabelNutritionData(BaseModel):
    food_name: str = Field(default="Unknown", description="Extracted food name")
    brand: Optional[str] = Field(default=None, description="Extracted brand name")
    serving_size: float = Field(..., description="Serving size in numeric value")
    serving_unit: str = Field(..., description="Serving unit like g, ml, oz")
    calories: float = Field(..., description="Calories per serving")
    protein_g: float = Field(..., description="Protein in grams")
    carbs_g: float = Field(..., description="Carbohydrates in grams")
    fat_g: float = Field(..., description="Total fat in grams")

# Define expected response schema for notebook parser
class NotebookFoodItem(BaseModel):
    food: str = Field(..., description="Description of the food")
    quantity: float = Field(..., description="Quantity of the food")
    unit: Optional[str] = Field(default=None, description="Unit if present, like bowl, glass, item")

async def parse_label_text(ocr_text: str) -> Optional[Dict]:
    """
    Prompts Gemini to convert raw OCR text from a nutrition label into structured JSON.
    """
    prompt = f"""
    You are an expert nutritionist and data scientist.
    Please extract the nutrition information from the following OCR text extracted from a nutrition label.
    Extract the following details:
    - food_name (infer if not explicit)
    - brand (if available)
    - serving_size (just the numeric value)
    - serving_unit (like g, ml, cup)
    - calories (per serving)
    - protein_g (per serving)
    - carbs_g (per serving)
    - fat_g (per serving)
    
    OCR TEXT:
    ---
    {ocr_text}
    ---
    Return strictly a valid JSON object matching the extracted details. 
    Ensure all numbers are floats. If a value is missing, infer a reasonable total or mark as 0 if unsure.
    """
    
    try:
        response = await model.generate_content_async(prompt)
        # Handle JSON extraction (cleaning if needed)
        response_text = response.text.strip()
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        
        parsed_data = json.loads(response_text)
        return parsed_data
    except Exception as e:
        print(f"Gemini API Error (Label): {str(e)}")
        return None

async def parse_notebook_text(ocr_text: str) -> Optional[List[Dict]]:
    """
    Prompts Gemini to parse handwritten notes (from OCR) into specific food quantities.
    """
    prompt = f"""
    Extract individual food items and their quantities from the following handwritten text:
    ---
    {ocr_text}
    ---
    Return a JSON array of objects with keys: "food", "quantity", and "unit".
    Example: [ {{"food": "egg", "quantity": 2, "unit": "unit"}}, {{"food": "toast", "quantity": 1, "unit": "slice"}} ]
    Return strictly JSON.
    """
    
    try:
        response = await model.generate_content_async(prompt)
        response_text = response.text.strip()
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        
        parsed_data = json.loads(response_text)
        return parsed_data
    except Exception as e:
        print(f"Gemini API Error (Notebook): {str(e)}")
        return None
