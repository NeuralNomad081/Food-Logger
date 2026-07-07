import easyocr
import io
from PIL import Image
import numpy as np

# Initialize the EasyOCR reader (this may take time on first run as it downloads models)
reader = easyocr.Reader(['en'], gpu=False) # GPU False by default for compatibility

def extract_text_from_image(image_bytes: bytes) -> str:
    """
    Extracts raw text from image bytes using EasyOCR.
    """
    try:
        # EasyOCR works well with numpy arrays or file paths
        image = Image.open(io.BytesIO(image_bytes))
        image_np = np.array(image)
        
        # Reader returns a list of tuples: (bbox, text, confidence)
        results = reader.readtext(image_np)
        
        # Combine all extracted text snippets into one block
        extracted_text = " ".join([result[1] for result in results])
        return extracted_text
    except Exception as e:
        print(f"Error extracting text from image: {str(e)}")
        return ""
