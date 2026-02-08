from __future__ import annotations

import base64
import io
import json
import logging
from typing import List

from openai import AsyncOpenAI
from PIL import Image

from backend.config import settings
from backend.models.schemas import (
    ColorInput,
    ImageAnalysis,
    ImageEnhancementPrompt,
    SquiggleFeatures,
)

logger = logging.getLogger(__name__)

ENHANCEMENT_SYSTEM_PROMPT = """You are a visual emotion amplifier. Given an image analysis, a user-selected color, and squiggle gesture features, generate a creative image enhancement prompt that will be used to emotionally morph the original image.

Your goal is to amplify the emotional essence of the image — not change the subject, but transform its mood, atmosphere, and visual energy.

OUTPUT SCHEMA (return ONLY this JSON, no other text):
{
  "emotional_intent": "A 1-sentence description of the emotional transformation goal (e.g. 'Amplify the quiet melancholy into a dreamlike ache')",
  "visual_directive": "A 1-sentence instruction for color grading and atmosphere (e.g. 'Shift toward deep amber tones with soft vignetting and hazy light')",
  "morphing_prompt": "A 2-3 sentence creative prompt for an image editor AI. Describe the visual transformation without changing the subject matter. Focus on light, color, texture, atmosphere, and emotional amplification.",
  "style_reference": "A brief style/aesthetic reference (e.g. 'Wong Kar-wai cinematography', 'Polaroid expired film', 'Blade Runner neon noir')"
}

MAPPING RULES:

1. EMOTION → AMPLIFICATION DIRECTION:
   - Melancholy/nostalgia → deepen shadows, add film grain, desaturate slightly, warm or cool shift
   - Joy/energy → increase saturation, brighten highlights, add warmth and glow
   - Mystery/tension → increase contrast, deepen blacks, add atmospheric haze
   - Serenity/calm → soften everything, reduce contrast, add ethereal light
   - Anger/intensity → push reds and oranges, increase grain, harsh contrast

2. COLOR → GRADING GUIDANCE:
   - warm_red, warm_orange → lean into warm color grading, golden hour feel
   - cool_blue, cool_cyan → lean into cool tones, twilight or moonlit feel
   - cool_purple, warm_magenta → lean into dreamy/surreal palette
   - warm_yellow, cool_green → lean into natural/organic palette
   - neutral_gray → lean into monochromatic or desaturated treatment
   - High saturation → more dramatic color shifts
   - Low saturation → subtler, more tonal shifts

3. SQUIGGLE → VISUAL ENERGY:
   - High speed/energy → more dynamic transformations, visible texture, motion blur effects
   - Low speed/energy → gentler, more ambient transformations
   - High bounding box → more expansive visual changes
   - Low bounding box → more focused, subtle changes

4. IMPORTANT CONSTRAINTS:
   - NEVER ask to add or remove objects from the image
   - NEVER change the fundamental subject or composition
   - Focus ONLY on mood, atmosphere, light, color, and texture
   - The morphing_prompt must work as an image editing instruction
   - Keep the style_reference to real aesthetic movements or artists"""


async def generate_enhancement_prompt(
    image_analysis: ImageAnalysis,
    color: ColorInput,
    squiggle: SquiggleFeatures,
) -> ImageEnhancementPrompt:
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    user_content = {
        "image_analysis": image_analysis.model_dump(),
        "color": color.model_dump(),
        "squiggle_features": squiggle.model_dump(),
    }

    for attempt in range(2):
        try:
            response = await client.chat.completions.create(
                model=settings.openai_model,
                temperature=0.4,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": ENHANCEMENT_SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(user_content)},
                ],
                max_completion_tokens=512,
            )
            raw = response.choices[0].message.content
            data = json.loads(raw)
            return ImageEnhancementPrompt(**data)
        except json.JSONDecodeError:
            logger.error("OpenAI returned invalid JSON for enhancement prompt: %s", raw)
            if attempt == 0:
                continue
            raise ValueError("Unexpected format from enhancement prompt generation")
        except Exception:
            if attempt == 0:
                continue
            raise

    raise RuntimeError("Enhancement prompt generation failed after retries")


async def morph_image(
    image_bytes: bytes,
    color: ColorInput,
    enhancement_prompt: ImageEnhancementPrompt,
) -> bytes:
    # Step 1: Composite semi-transparent color overlay using Pillow
    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")

    # Opacity based on saturation: 10-30%
    opacity = int(255 * (0.10 + 0.20 * color.saturation))
    hex_clean = color.hex.lstrip("#")
    r, g, b = int(hex_clean[0:2], 16), int(hex_clean[2:4], 16), int(hex_clean[4:6], 16)
    overlay = Image.new("RGBA", img.size, (r, g, b, opacity))
    composited = Image.alpha_composite(img, overlay).convert("RGB")

    # Convert to PNG file-like object for the API
    buf = io.BytesIO()
    composited.save(buf, format="PNG")
    buf.seek(0)
    buf.name = "image.png"

    logger.info(
        "Morphing: image %dx%d (%d bytes), prompt %d chars",
        composited.width, composited.height, buf.getbuffer().nbytes,
        len(enhancement_prompt.morphing_prompt),
    )

    # Step 2: Send to OpenAI image edit API
    # Note: gpt-image-1 does NOT support response_format="b64_json";
    # it returns a URL by default. Use size="auto" to match input dimensions.
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    result = await client.images.edit(
        model=settings.openai_image_model,
        image=buf,
        prompt=enhancement_prompt.morphing_prompt,
        size="auto",
    )

    if not result.data:
        raise RuntimeError("OpenAI images.edit returned empty data array")

    image_entry = result.data[0]

    # gpt-image-1 returns b64_json by default
    if image_entry.b64_json:
        morphed = base64.b64decode(image_entry.b64_json)
        logger.info("Image morphing succeeded (%d bytes, from b64_json)", len(morphed))
        return morphed

    # Fallback: fetch from URL if provided
    if image_entry.url:
        import httpx
        async with httpx.AsyncClient() as http:
            resp = await http.get(image_entry.url)
            resp.raise_for_status()
            morphed = resp.content
            logger.info("Image morphing succeeded (%d bytes, from url)", len(morphed))
            return morphed

    raise RuntimeError("No image data in response (no b64_json or url)")
