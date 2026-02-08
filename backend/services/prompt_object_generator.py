import json
import logging
from typing import Optional

from openai import AsyncOpenAI

from backend.config import settings
from backend.models.schemas import (
    AudioStructuredObject,
    ColorInput,
    ImageAnalysis,
    SquiggleFeatures,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an audio-intent generator. Given image analysis, a user-selected color, and squiggle gesture features, produce a JSON object that describes a short audio clip.

OUTPUT SCHEMA (return ONLY this JSON, no other text):
{
  "audio_type": "music" | "ambient" | "hybrid",
  "mood": {"primary": "string", "secondary": "string"},
  "energy": 0.0-1.0,
  "tempo": "slow" | "medium" | "fast",
  "density": "sparse" | "medium" | "dense",
  "texture": ["list", "of", "texture", "descriptors"],
  "sound_references": ["concrete", "sound", "references"],
  "duration_seconds": 5-15,
  "relation_to_parent": "original" | "mirror" | "variation" | "contrast",
  "confidence": 0.0-1.0
}

MAPPING RULES (priority order):

1. IMAGE ANALYSIS (highest priority):
   - scene_description + vibe + emotion → audio_type, mood
   - ambient_sound_associations → sound_references
   - Outdoor/nature scenes lean toward "ambient"
   - Urban/energetic scenes lean toward "music"
   - Abstract scenes lean toward "hybrid"

2. COLOR (high priority):
   - warm_red, warm_orange, warm_magenta → warmer mood tones, bold textures
   - cool_blue, cool_cyan, cool_purple → cooler mood tones, smoother textures
   - warm_yellow, cool_green → balanced/organic textures
   - neutral_gray → muted, minimal textures
   - High saturation → more vivid/intense mood
   - Low saturation → more subdued mood
   - High lightness → brighter, airier sound
   - Low lightness → darker, deeper sound

3. SQUIGGLE FEATURES (fine-grained):
   - average_speed HIGH (>0.005) → higher energy, tempo="fast"
   - average_speed LOW (<0.001) → lower energy, tempo="slow"
   - bounding_box_area HIGH (>0.2) → density="dense"
   - bounding_box_area LOW (<0.05) → density="sparse"
   - speed_variance HIGH → more varied texture list
   - total_length HIGH (>2.0) → more complex/layered textures
   - total_length LOW (<0.5) → simpler, focused textures

4. DURATION: Reason holistically based on image vibe, scene complexity, and emotional weight. Simple calm scenes → shorter (5-8s). Complex emotional scenes → longer (10-15s).

If relation_to_parent is "original", this is a new post (not a comment).
"""

COMMENT_ADDENDUM = """
COMMENT MODE: A parent audio object is provided. You MUST:
- Keep the comment sonically related to the parent
- Set relation_to_parent to "mirror", "variation", or "contrast" (NEVER "original")
- "mirror": very similar mood/energy/texture, slight shifts
- "variation": same family but noticeably different energy or texture
- "contrast": intentionally different mood or energy, but still connected through shared sound_references or texture elements
"""


async def generate_audio_object(
    image_analysis: ImageAnalysis,
    color: ColorInput,
    squiggle: SquiggleFeatures,
    parent: Optional[AudioStructuredObject] = None,
) -> AudioStructuredObject:
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    system = SYSTEM_PROMPT
    if parent is not None:
        system += COMMENT_ADDENDUM

    user_content = {
        "image_analysis": image_analysis.model_dump(),
        "color": color.model_dump(),
        "squiggle_features": squiggle.model_dump(),
    }
    if parent is not None:
        user_content["parent_audio_object"] = parent.model_dump()

    for attempt in range(2):
        try:
            response = await client.chat.completions.create(
                model=settings.openai_model,
                temperature=0,
                seed=42,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(user_content)},
                ],
                max_completion_tokens=1024,
            )
            raw = response.choices[0].message.content
            data = json.loads(raw)
            return AudioStructuredObject(**data)
        except json.JSONDecodeError:
            logger.error("OpenAI returned invalid JSON: %s", raw)
            if attempt == 0:
                continue
            raise ValueError("Unexpected format from audio object generation")
        except Exception:
            if attempt == 0:
                continue
            raise

    raise RuntimeError("Audio object generation failed after retries")
