from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Query
from sqlmodel import Session, select
from typing import List, Optional
from datetime import datetime, date

from .db.session import init_db, get_session
from .models.nutrition import Food, FoodLog, User
from .services import ocr_service, ai_parser

app = FastAPI(title="Food Logger PWA API")

@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/")
def read_root():
    return {"message": "Food Logger PWA API is running"}

# --- Food Operations ---

@app.post("/scan-label")
async def scan_nutrition_label(image: UploadFile = File(...)):
    """
    Step 1: Get image bytes
    Step 2: Run EasyOCR
    Step 3: Run Gemini to parse the extracted text
    Returns: Structured JSON of the nutrition info
    """
    image_bytes = await image.read()
    
    # Extract OCR text
    ocr_text = ocr_service.extract_text_from_image(image_bytes)
    
    # Parse with Gemini
    if ocr_text:
        parsed_nutrition = await ai_parser.parse_label_text(ocr_text)
        if parsed_nutrition:
            return {
                "raw_text": ocr_text,
                "parsed_nutrition": parsed_nutrition
            }
    
    raise HTTPException(status_code=400, detail="Could not extract nutrition from image.")

@app.post("/parse-notebook")
async def parse_notebook_image(image: UploadFile = File(...)):
    """
    Step 1: Get image bytes
    Step 2: Run EasyOCR (Better candidates for handwritten parser exist, but EasyOCR is decent)
    Step 3: Run Gemini to extract items
    Returns: List of meals extracted
    """
    image_bytes = await image.read()
    
    # Extract OCR text
    ocr_text = ocr_service.extract_text_from_image(image_bytes)
    
    # Parse with Gemini
    if ocr_text:
        items = await ai_parser.parse_notebook_text(ocr_text)
        if items:
            return {
                "raw_text": ocr_text,
                "parsed_items": items
            }
            
    raise HTTPException(status_code=400, detail="Could not parse notebook entries from image.")

@app.post("/log-food", response_model=FoodLog)
def create_food_log(food_log: FoodLog, session: Session = Depends(get_session)):
    session.add(food_log)
    session.commit()
    session.refresh(food_log)
    return food_log
