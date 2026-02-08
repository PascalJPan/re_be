# re

Image-to-audio social media MVP. Upload an image, draw a gesture, pick a color, and get a generated soundtrack. Others can reply with their own image-audio comments, creating conversational audio threads.

## How It Works

1. Upload an image (file picker or camera capture)
2. Draw a squiggle gesture on the canvas — the endpoint position determines the color via a radial color wheel
3. The system analyzes the image, gesture, and color through an AI pipeline to generate a short audio clip
4. Publish your post to the feed
5. Others can comment with their own image-audio combinations that musically relate to the original post (mirror, variation, or contrast)

## Features

- **Feed** — Paginated post stream with color-tinted cards and inline waveform audio players
- **Post detail** — Full post view with synchronized audio playback across all comments
- **Comments** — Image-to-audio replies that inherit the parent post's BPM, key, and duration
- **Profiles** — User page with 3-column post grid and post counts
- **Audio player** — Waveform visualization using Web Audio API, with synced playback on post detail pages
- **Color glow** — Post color applied as a semi-transparent overlay on images and cards
- **Camera capture** — Native camera input with getUserMedia fallback
- **Wiggly background** — Animated layered sine wave canvas behind the app
- **Create flow** — Full-screen modal with live color preview while drawing

## AI Pipeline

1. **Image Analysis** — OpenAI Vision API extracts scene, objects, vibe, emotion, colors, ambient sound associations
2. **Squiggle Features** — Path length, bounding box area, speed, variance extracted from gesture
3. **Structured Generation** — GPT produces an AudioStructuredObject (audio type, mood, energy, tempo, density, texture, BPM, key, duration, sound references)
4. **Prompt Compilation** — Structured object + analysis + color/squiggle data compiled into a vivid text prompt
5. **Audio Generation** — ElevenLabs Music API generates an instrumental MP3 from the compiled prompt

## Tech Stack

- **Backend**: FastAPI + Uvicorn (Python 3.9)
- **Database**: SQLite via aiosqlite (WAL mode)
- **Frontend**: Vanilla HTML/CSS/JS (no build tools)
- **Image Analysis**: OpenAI Vision API
- **Audio Generation**: ElevenLabs Music API
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

## Project Structure

```
backend/
  main.py              # FastAPI app, lifespan, static files
  auth.py              # Auth helpers (demo mode)
  config.py            # Settings from .env
  database.py          # SQLite schema & connection
  models/schemas.py    # Pydantic models
  routers/
    posts.py           # Post CRUD + feed + image serving
    comments.py        # Comment CRUD
    profiles.py        # User profile + paginated posts
  services/
    image_analysis.py  # OpenAI Vision analysis
    squiggle_extraction.py  # Gesture feature extraction
    prompt_object_generator.py  # GPT structured generation
    prompt_compiler.py # Text prompt synthesis
    audio_generator.py # ElevenLabs Music API
  audio_files/         # Generated MP3s

frontend/
  index.html           # SPA shell
  css/styles.css       # Styling
  js/
    app.js             # Entry point, routing, navbar
    router.js          # Hash-based SPA router
    auth.js            # Auth state (demo mode)
    api.js             # Backend API client
    feed.js            # Feed page
    post-detail.js     # Post detail page
    profile.js         # Profile page
    create-flow.js     # Create post/comment modal
    audio-player.js    # Waveform visualization & sync playback
    image-capture.js   # File upload + camera capture
    squiggle-canvas.js # Gesture drawing canvas
    pixel-sampler.js   # Color derivation from squiggle
    wiggly-bg.js       # Animated background
    ui.js              # Toast notifications, time formatting
```
