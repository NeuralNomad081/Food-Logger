# Backend Dockerfile
FROM python:3.9-slim

# Install system dependencies for EasyOCR/OpenCV
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-download models for EasyOCR (Optional, saves time on startup)
RUN python -c "import easyocr; reader = easyocr.Reader(['en'], gpu=False)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
