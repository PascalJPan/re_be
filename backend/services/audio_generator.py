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

    logger.info("Compiled prompt for %s:\n%s", audio_id, prompt)

    headers = {
        "xi-api-key": settings.elevenlabs_api_key,
    }

    # Step 1 — get a composition plan
    plan_url = f"{ELEVENLABS_BASE}/music/plan"
    plan_payload = {
        "prompt": prompt,
        "music_length_ms": obj.duration_seconds * 1000,
        "prompt_influence": settings.prompt_influence,
        "force_instrumental": True,
    }

    async with httpx.AsyncClient() as client:
        plan_resp = await client.post(
            plan_url, json=plan_payload, headers=headers, timeout=60.0,
        )
        if plan_resp.status_code != 200:
            logger.error("ElevenLabs plan error %d: %s", plan_resp.status_code, plan_resp.text[:500])
            raise RuntimeError(f"Audio plan failed: {plan_resp.status_code}")

        plan_data = plan_resp.json()
        logger.debug("Composition plan: %s", plan_data)

        # Step 2 — generate audio from the plan
        gen_url = f"{ELEVENLABS_BASE}/music"
        gen_payload = {
            "composition_plan": plan_data,
            "output_format": "mp3",
        }

        gen_resp = await client.post(
            gen_url, json=gen_payload, headers=headers, timeout=120.0,
        )
        if gen_resp.status_code != 200:
            logger.error("ElevenLabs generate error %d: %s", gen_resp.status_code, gen_resp.text[:500])
            raise RuntimeError(f"Audio generation failed: {gen_resp.status_code}")

        filepath.write_bytes(gen_resp.content)

    return filename
