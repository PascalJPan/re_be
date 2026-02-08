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

IMPORTANT: Prefer audio_type "music" in most cases. Only choose "ambient" for scenes that are explicitly still, environmental, and non-rhythmic. "hybrid" should be rare.

OUTPUT SCHEMA (return ONLY this JSON, no other text):
{
  "audio_type": "music" | "ambient" | "hybrid",
  "mood": {"primary": "string", "secondary": "string"},
  "energy": 0.0-1.0,
  "tempo": "slow" | "medium" | "fast",
  "density": "sparse" | "medium" | "dense",
  "texture": ["list", "of", "texture", "descriptors"],
  "sound_references": ["concrete", "sound", "references"],
  "duration_seconds": 15-20,
  "bpm": 60-180,
  "musical_key": "C major" | "A minor" | etc.,
  "relation_to_parent": "original" | "mirror" | "variation" | "contrast",
  "confidence": 0.0-1.0,
  "instruments": ["2-4 specific instruments, e.g. Rhodes piano, bowed bass, brushed snare"],
  "genre_hint": "one genre/subgenre reference, e.g. lo-fi jazz, post-rock, ambient techno",
  "harmonic_mood": "harmonic character, e.g. yearning, suspended, resolving, bittersweet",
  "dynamic_shape": "how energy evolves, e.g. slow build, breathing, explosion then decay",
  "sonic_palette": "timbral character, e.g. dusty vinyl warmth, crystalline digital, tape-saturated"
}

MAPPING RULES (priority order):

1. IMAGE ANALYSIS (highest priority):
   - scene_description + vibe + emotion → audio_type, mood, harmonic_mood
   - ambient_sound_associations → sound_references
   - sonic_metaphor (if present) → use it to inspire instruments, sonic_palette, and dynamic_shape
   - Urban/energetic scenes → "music"
   - Abstract scenes → "music" (default)
   - Outdoor/nature scenes with rhythmic or emotional energy → "music"
   - Only purely still, meditative, environmental scenes → "ambient"
   - When in doubt, default to "music"

ENERGY BIAS: This is for a social media app — audio must be engaging and sonically
interesting, never boring or flat. Even quiet scenes should have musical movement,
rhythm, and presence. Avoid energy below 0.3. Prefer medium-to-fast tempos and
medium-to-dense arrangements. When in doubt, push energy and tempo upward.

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
   - average_speed HIGH (>0.003) → higher energy, tempo="fast"
   - average_speed LOW (<0.0005) → lower energy, tempo="slow"
   - bounding_box_area HIGH (>0.2) → density="dense"
   - bounding_box_area LOW (<0.05) → density="sparse"
   - speed_variance HIGH → more varied texture list
   - total_length HIGH (>2.0) → more complex/layered textures
   - total_length LOW (<0.5) → simpler, focused textures

4. DURATION: Default to 18s. Only use 15s for very minimal scenes, 20s for complex emotional scenes.

5. BPM: Map from tempo — slow→85-105, medium→105-140, fast→140-180. Pick a specific integer.

6. MUSICAL KEY: Choose based on mood and color. Warm/happy → major keys (C, G, D, A major). Cool/melancholic → minor keys (A, D, E, B minor). Mysterious/dark → Eb minor, F# minor. Bright/energetic → E major, Bb major.

7. INSTRUMENTS: Choose 2-4 specific instruments that match the scene:
   - Natural/organic scenes → acoustic instruments (acoustic guitar, cello, kalimba, wooden flute)
   - Urban/modern scenes → electronic instruments (analog synth, drum machine, electric bass)
   - Warm colors → warm-toned instruments (Rhodes piano, flugelhorn, upright bass)
   - Cool colors → crystalline instruments (vibraphone, glass marimba, digital pads)
   - Be specific: "nylon-string guitar" not just "guitar", "808 kick" not just "drums"

8. GENRE HINT: Pick one genre/subgenre that fits the overall feel. Be specific (e.g. "shoegaze" not "rock").

9. SONIC PALETTE: Describe the timbral quality — think about whether it's warm/cold, analog/digital, clean/distorted, wet/dry.

10. DYNAMIC SHAPE: How should the energy evolve over the track's duration? Consider the squiggle's gesture as a clue.

If relation_to_parent is "original", this is a new post (not a comment).
"""

COMMENT_ADDENDUM = """
COMMENT MODE: A parent audio object is provided. You MUST:
- Keep the comment sonically related to the parent
- Use the SAME bpm, musical_key, and duration_seconds as the parent
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
                model=settings.openai_fast_model,
                temperature=0.6,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(user_content)},
                ],
                max_completion_tokens=1024,
                timeout=30.0,
            )
            raw = response.choices[0].message.content
            data = json.loads(raw)
            obj = AudioStructuredObject(**data)
            if parent is not None:
                overrides = {"duration_seconds": parent.duration_seconds}
                if parent.bpm is not None:
                    overrides["bpm"] = parent.bpm
                if parent.musical_key is not None:
                    overrides["musical_key"] = parent.musical_key
                obj = obj.model_copy(update=overrides)
            return obj
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
