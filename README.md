# re_be

Image-to-audio social media MVP. Upload an image, draw a gesture, pick a color, and get a generated soundscape. Other users can reply with their own image-audio comments, creating conversational audio threads.

## How It Works

1. Upload an image
2. Draw a squiggle gesture on the canvas
3. Pick a color
4. The system analyzes the image, gesture, and color to generate a short audio clip
5. Others can comment with their own image-audio combinations that relate to the original post

## Tech Stack

- **Backend**: FastAPI + Uvicorn (Python 3.9)
- **Frontend**: Vanilla HTML/CSS/JS
- **Image Analysis**: OpenAI Vision API
- **Audio Generation**: ElevenLabs API
- **Data Validation**: Pydantic

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Create a `.env` file in the project root:

```
OPENAI_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
```

## Run

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload
```

Open `http://localhost:8000` in your browser.
