import base64
import json
import logging

from openai import AsyncOpenAI

from backend.config import settings
from backend.models.schemas import ImageAnalysis

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an image analysis system. Analyze the provided image and return a JSON object with exactly these fields:

{
  "scene_description": "A concise description of the overall scene",
  "detected_objects": ["list", "of", "key", "objects"],
  "vibe": "One or two words capturing the overall feeling (e.g. 'serene', 'chaotic', 'nostalgic')",
  "emotion": "The dominant emotion evoked (e.g. 'calm', 'joy', 'melancholy', 'tension')",
  "dominant_colors": ["list", "of", "color", "names"],
  "environment": "indoor/outdoor/abstract/null",
  "time_of_day": "dawn/morning/afternoon/dusk/night/null",
  "location_hint": "Brief location description or null",
  "ambient_sound_associations": ["sounds", "you", "associate", "with", "this", "scene"]
}

Focus on sensory qualities that translate well to audio. Be specific about ambient sounds.
Return ONLY the JSON object, no other text."""


async def analyze_image(image_bytes: bytes, content_type: str = "image/jpeg") -> ImageAnalysis:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    media_type = content_type if content_type in ("image/jpeg", "image/png", "image/gif", "image/webp") else "image/jpeg"

    for attempt in range(2):
        try:
            response = await client.chat.completions.create(
                model=settings.openai_model,
                temperature=0,
                seed=42,
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
                                    "detail": "low",
                                },
                            }
                        ],
                    },
                ],
                max_completion_tokens=1024,
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
