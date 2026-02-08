from __future__ import annotations

import base64
import io
import json
import logging
from typing import List

import httpx
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

ENHANCEMENT_SYSTEM_PROMPT = """You are a bold visual artist. Given an image analysis, a user-selected color, and squiggle gesture features, generate a creative image transformation prompt that will be used to artistically morph the original image.

Your goal is to create something visually striking and unexpected. Go beyond subtle color grading — use dramatic stylization: painterly effects, glitch fragments, washed-out film, harsh contrast, cartoon rendering, collage overlays, distorted geometry, double exposure, halftone patterns, risograph printing, etc. The subject should remain recognizable but the style should be DRAMATICALLY different from a normal photo.

OUTPUT SCHEMA (return ONLY this JSON, no other text):
{
  "emotional_intent": "A 1-sentence description of the emotional transformation goal (e.g. 'Shatter the calm into anxious digital fragments')",
  "visual_directive": "A 1-sentence bold instruction for the visual style (e.g. 'Dissolve into a glitched VHS fever dream with chromatic aberration and scan lines')",
  "morphing_prompt": "A 2-3 sentence creative prompt for an image editor AI. Describe a bold visual transformation. You can dramatically alter the style, texture, color palette, and rendering approach while keeping the subject recognizable. Think like an experimental artist, not a photo editor.",
  "style_reference": "A brief style/aesthetic reference — be diverse and specific (e.g. 'Basquiat street art', '90s rave flyer', 'Wes Anderson pastel symmetry', 'Japanese woodblock print', 'cyberpunk manga panel', 'faded Polaroid double exposure', 'Soviet propaganda poster')"
}

MAPPING RULES:

1. EMOTION → STYLE DIRECTION (be bold and varied, don't repeat the same style):
   - Melancholy/nostalgia → washed-out film, torn paper collage, faded watercolor, rain-streaked glass effect
   - Joy/energy → pop art explosion, saturated screen print, cartoon cel shading, confetti overlay
   - Mystery/tension → noir high-contrast, glitch distortion, fragmented mirrors, smoke overlay
   - Serenity/calm → soft impressionist painting, dreamy bokeh blur, pastel chalk texture, ethereal double exposure
   - Anger/intensity → aggressive brush strokes, shattered glass, harsh halftone, expressionist distortion
   - Boredom/mundane → surrealist transformation, unexpected cartoon style, Andy Warhol treatment, vaporwave aesthetic

2. COLOR → STYLE AMPLIFICATION:
   - warm_red, warm_orange → fire/heat distortion, bold graphic poster style, hot neon glow
   - cool_blue, cool_cyan → cyanotype printing, ice crystal overlay, blueprint aesthetic
   - cool_purple, warm_magenta → psychedelic swirl, synthwave gradient, ultraviolet glow
   - warm_yellow, cool_green → risograph print, botanical illustration style, vintage field guide
   - neutral_gray → stark black-and-white woodcut, pencil sketch, brutalist graphic design
   - High saturation → push toward maximum visual drama
   - Low saturation → use texture and geometry instead of color for impact

3. SQUIGGLE → VISUAL INTENSITY:
   - High speed/energy → more chaotic transformations: glitch, fragmentation, motion blur, splatters
   - Low speed/energy → more controlled stylization: painting, illustration, clean graphic design
   - High bounding box → full-image transformation, immersive style change
   - Low bounding box → focused effect with dramatic style in center

4. IMPORTANT CONSTRAINTS:
   - NEVER ask to add or remove objects/people from the image
   - Keep the subject RECOGNIZABLE but transform the style dramatically
   - The morphing_prompt must work as an image editing instruction
   - VARY your style choices — don't always default to the same aesthetic
   - Be specific about visual effects (e.g. "thick impasto brush strokes" not just "painterly")
   - Push for maximum visual interest while keeping the subject identifiable"""


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
                model=settings.openai_fast_model,
                temperature=0.85,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": ENHANCEMENT_SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(user_content)},
                ],
                max_completion_tokens=700,
                timeout=30.0,
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
        timeout=120.0,
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
        async with httpx.AsyncClient() as http:
            resp = await http.get(image_entry.url, timeout=30.0)
            resp.raise_for_status()
            morphed = resp.content
            logger.info("Image morphing succeeded (%d bytes, from url)", len(morphed))
            return morphed

    raise RuntimeError("No image data in response (no b64_json or url)")
