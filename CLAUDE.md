# Project Context

Image-to-audio social media MVP. Users upload images, draw squiggle gestures, pick colors, and get AI-generated audio. Comments are also image-to-audio, with audio that relates to the parent post.

**Backend**: FastAPI app in `backend/` — routes in `routers/`, AI pipeline in `services/`, Pydantic models in `models/schemas.py`, in-memory state in `state/store.py`.

**Frontend**: Vanilla JS SPA in `frontend/` — `app.js` orchestrates flow, `api.js` handles fetch calls, `squiggle-canvas.js` captures gestures, `image-capture.js` handles uploads, `audio-player.js` handles playback.

**AI Pipeline**: Image → OpenAI Vision analysis → GPT structured generation (AudioStructuredObject) → prompt compilation → ElevenLabs audio generation.

## TODOs

1. **Log structured prompt to console only** — The `AudioStructuredObject` JSON and compiled prompt should be `console.log`'d in the frontend (or logged server-side) but NOT rendered in the UI metadata section

2. **Add user display** — Show username "joey_vibez" below the post and to the left of comments. Hardcoded for now

3. **Camera capture button** — Add a "Take Photo" button using `getUserMedia` / `capture="environment"` alongside the existing file upload

4. **Bias models toward music** — Update the LLM system prompt in `prompt_object_generator.py` to favor `audio_type: "music"` over `"ambient"` more often

5. **Post image visible, comment images hidden** — Show the uploaded image at the top of the post view with audio player directly beneath. Comments show only audio + metadata, no image

6. **Color glow overlay effect** — Apply the selected color as a glow/tint overlay on the post image and audio player area. Color comment items with their respective colors. Remove squiggle drawing from being visible on the image (capture points silently)
