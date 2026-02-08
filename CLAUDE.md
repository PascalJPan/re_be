# Project Context

Image-to-audio social media MVP. Users upload images, draw squiggle gestures, pick colors, and get AI-generated audio. Comments are also image-to-audio, with audio that relates to the parent post.

## Architecture

**Backend**: FastAPI app in `backend/` — SQLite via aiosqlite (`re.db`), routes in `routers/`, AI pipeline in `services/`, Pydantic models in `models/schemas.py`, auth helpers in `auth.py`, DB schema in `database.py`.

**Frontend**: Vanilla JS SPA in `frontend/` with hash-based routing (`#/feed`, `#/post/:id`, `#/profile/:username`). Modules: `router.js`, `auth.js`, `api.js`, `feed.js`, `post-detail.js`, `profile.js`, `create-flow.js`, `audio-player.js`, `image-capture.js`, `squiggle-canvas.js`, `pixel-sampler.js`, `wiggly-bg.js`, `ui.js`.

**AI Pipeline**: Image → OpenAI Vision analysis → GPT structured generation (AudioStructuredObject) → prompt compilation → ElevenLabs Music API audio generation.

**Auth**: Demo mode — hardcoded user "pascal". bcrypt + PyJWT dependencies installed for future real auth.

**Config** (`backend/config.py`): Loads `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `openai_model` (gpt-5.2), `elevenlabs_music_model` (music_v1), `max_image_size_mb` (10) from `.env`.

## Key Implementation Details

- Audio files saved to `backend/audio_files/` and served at `/api/audio/`
- Post images stored as BLOBs in SQLite, served via `/api/posts/{id}/image`
- Squiggle points normalized to [0,1] with millisecond timestamps
- Color derived from squiggle endpoint via radial color wheel (pixel-sampler.js)
- Comments inherit parent post's bpm/key/duration and use relation_to_parent (mirror/variation/contrast)
- Audio player uses Web Audio API waveform visualization with synchronized playback on post detail
- Structured object and compiled prompt logged to console (not rendered in UI)
