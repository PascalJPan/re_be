import logging
from pathlib import Path

import httpx

from backend.config import settings
from backend.models.schemas import AudioStructuredObject

logger = logging.getLogger(__name__)

AUDIO_DIR = Path(__file__).resolve().parent.parent / "audio_files"
ELEVENLABS_BASE = "https://api.elevenlabs.io/v1"


async def generate_audio(audio_id: str, prompt: str, obj: AudioStructuredObject) -> str:
    """Generate audio via ElevenLabs and save to disk. Returns the filename."""
    AUDIO_DIR.mkdir(exist_ok=True)
    filename = f"{audio_id}.mp3"
    filepath = AUDIO_DIR / filename

    headers = {
        "xi-api-key": settings.elevenlabs_api_key,
    }

    if obj.audio_type == "ambient":
        url = f"{ELEVENLABS_BASE}/sound-generation"
        payload = {
            "text": prompt,
            "duration_seconds": obj.duration_seconds,
            "model_id": settings.elevenlabs_sfx_model,
            "prompt_influence": settings.prompt_influence,
        }
    else:
        # music or hybrid
        url = f"{ELEVENLABS_BASE}/music"
        payload = {
            "prompt": prompt,
            "music_length_ms": obj.duration_seconds * 1000,
            "model_id": settings.elevenlabs_music_model,
            "force_instrumental": True,
        }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            logger.error("ElevenLabs error %d: %s", response.status_code, response.text[:500])
            raise RuntimeError(f"Audio generation failed: {response.status_code}")
        filepath.write_bytes(response.content)

    return filename
