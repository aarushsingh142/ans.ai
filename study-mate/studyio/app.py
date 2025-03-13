# app.py - Flask backend for the Study Material Analyzer

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import base64
import json
import uuid
import io
from PIL import Image
from google.cloud import vision
import openai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure API keys
openai.api_key = os.getenv("OPENAI_API_KEY")
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

# Initialize Google Cloud Vision client
vision_client = vision.ImageAnnotatorClient()

# Create upload directory if it doesn't exist
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

@app.route('/analyze', methods=['POST'])
def analyze_image():
    try:
        # Check if image is provided
        if 'image' not in request.files and 'image' not in request.form:
            return jsonify({"error": "No image provided"}), 400

        # Handle image from form data
        if 'image' in request.files:
            image_file = request.files['image']
            image_content = image_file.read()
        else:
            # Handle base64 encoded image
            image_data = request.form['image']
            if image_data.startswith('data:image'):
                # Extract the base64 part
                image_data = image_data.split(',')[1]
            image_content = base64.b64decode(image_data)

        # Save image temporarily
        image_id = str(uuid.uuid4())
        image_path = os.path.join(UPLOAD_FOLDER, f"{image_id}.png")

        with open(image_path, "wb") as f:
            f.write(image_content)

        # Step 1: Extract text using Google Cloud Vision OCR
        with io.open(image_path, 'rb') as image_file:
            content = image_file.read()

        image = vision.Image(content=content)

        # Perform text detection
        text_response = vision_client.text_detection(image=image)
        extracted_text = ""
        if text_response.text_annotations:
            extracted_text = text_response.text_annotations[0].description

        # Step 2: Detect labels (objects, diagrams, etc.)
        label_response = vision_client.label_detection(image=image)
        labels = [label.description for label in label_response.label_annotations]

        # Step 3: Use OpenAI to analyze and explain the content
        prompt = f"""
        The following text was extracted from an educational/study material image:

        {extracted_text}

        The image contains elements that may include: {', '.join(labels)}

        Please analyze this content and provide:
        1. A concise description of what this study material is about
        2. A clear, educational explanation of the concepts presented
        3. Key points or important details that students should understand

        If there are diagrams, charts, or visual elements, please explain what they represent.
        Format your response in a way that would be helpful for a student studying this material.
        """

        # OpenAI API call
        response = openai.ChatCompletion.create(
            model="gpt-4",  # or gpt-3.5-turbo if you prefer
            messages=[
                {"role": "system", "content": "You are a helpful educational assistant that explains study materials clearly and accurately."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=1000
        )

        explanation = response.choices[0].message['content']

        # Calculate confidence score based on the quality of results
        confidence = 0.7  # Base confidence
        if len(extracted_text) > 100:
            confidence += 0.1
        if len(labels) > 5:
            confidence += 0.1
        confidence = min(confidence, 1.0)

        # Clean up temporary file
        if os.path.exists(image_path):
            os.remove(image_path)

        # Get a short description for the detected content
        if extracted_text:
            first_line = extracted_text.split('\n')[0]
            detected_content = first_line[:100] + '...' if len(first_line) > 100 else first_line
        else:
            detected_content = "Unrecognized content"

        return jsonify({
            "success": True,
            "explanation": explanation,
            "detectedContent": detected_content,
            "elements": labels,
            "confidence": confidence
        })

    except Exception as e:
        print(f"Error analyzing image: {e}")
        return jsonify({
            "success": False,
            "error": "Failed to analyze the image",
            "details": str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
