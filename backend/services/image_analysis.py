import base64
import json
import logging

from openai import AsyncOpenAI

from backend.config import settings
from backend.models.schemas import ImageAnalysis

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a synesthetic image analyst specializing in translating visual scenes into sonic descriptions. Analyze the provided image and return a JSON object with exactly these fields:

{
  "scene_description": "A vivid 2-3 sentence description of the scene, emphasizing sensory texture, light quality, and spatial depth",
  "detected_objects": ["list", "of", "key", "objects", "and", "materials"],
  "vibe": "3-4 sensory adjectives describing atmosphere — go beyond basic (e.g. 'hazy golden intimacy' not 'warm')",
  "emotion": "A compound, specific emotional response (e.g. 'bittersweet longing' or 'restless anticipation', not just 'sad' or 'happy')",
  "dominant_colors": ["list", "of", "specific", "color", "descriptions"],
  "environment": "indoor/outdoor/abstract/null",
  "time_of_day": "dawn/morning/afternoon/dusk/night/null",
  "location_hint": "Brief location description or null",
  "ambient_sound_associations": ["5-8 specific sounds you'd hear in this scene — be concrete (e.g. 'distant foghorn', 'leather creaking', 'ice cracking in a glass')"],
  "sonic_metaphor": "If this image were a sound, what would it be? One evocative sentence (e.g. 'A cello note sustained underwater' or 'Static between radio stations at 3am')"
}

Rules:
- Be emotionally specific, not generic. Avoid single-word emotions.
- For vibe, layer adjectives that evoke texture and temperature, not just mood.
- For ambient_sound_associations, list 5-8 concrete, specific sounds — avoid generic entries like "nature sounds" or "city noise".
- The sonic_metaphor should be poetic and surprising, capturing the image's essence as pure sound.
- Focus on sensory qualities that translate to audio generation.
Return ONLY the JSON object, no other text."""


async def analyze_image(image_bytes: bytes, content_type: str = "image/jpeg") -> ImageAnalysis:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    media_type = content_type if content_type in ("image/jpeg", "image/png", "image/gif", "image/webp") else "image/jpeg"

    for attempt in range(2):
        try:
            response = await client.chat.completions.create(
                model=settings.openai_model,
                temperature=0.4,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{media_type};base64,{b64}",
                                    "detail": "auto",
                                },
                            }
                        ],
                    },
                ],
                max_completion_tokens=1024,
                timeout=30.0,
            )
            raw = response.choices[0].message.content
            data = json.loads(raw)
            return ImageAnalysis(**data)
        except json.JSONDecodeError:
            logger.error("OpenAI returned invalid JSON: %s", raw)
            if attempt == 0:
                continue
            raise ValueError("Unexpected format from image analysis")
        except Exception:
            if attempt == 0:
                continue
            raise

    raise RuntimeError("Image analysis failed after retries")
