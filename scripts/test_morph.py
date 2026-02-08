"""
Standalone debug script for the image morphing pipeline.

Usage:
    .venv/bin/python scripts/test_morph.py [optional_image.jpg]

If no image is provided, a synthetic gradient image is created.
Saves _debug_overlay.png and _debug_morphed.png for visual inspection.
"""
from __future__ import annotations

import asyncio
import io
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image


def create_test_image(width: int = 512, height: int = 512) -> bytes:
    """Create a synthetic gradient image for testing."""
    img = Image.new("RGB", (width, height))
    pixels = img.load()
    for y in range(height):
        for x in range(width):
            r = int(255 * x / width)
            g = int(255 * y / height)
            b = int(255 * (1 - x / width))
            pixels[x, y] = (r, g, b)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def main():
    image_path = sys.argv[1] if len(sys.argv) > 1 else None

    # Step 0: Load or create image
    if image_path:
        p = Path(image_path)
        if not p.exists():
            print(f"ERROR: File not found: {image_path}")
            sys.exit(1)
        image_bytes = p.read_bytes()
        print(f"[OK] Loaded image: {image_path} ({len(image_bytes)} bytes)")
    else:
        image_bytes = create_test_image()
        print(f"[OK] Created synthetic gradient image ({len(image_bytes)} bytes)")

    # Verify image opens
    img = Image.open(io.BytesIO(image_bytes))
    print(f"     Dimensions: {img.width}x{img.height}, mode: {img.mode}")

    # Step 1: Import services (validates config/env)
    print("\n--- Step 1: Import services ---")
    try:
        from backend.config import settings
        from backend.models.schemas import ColorInput, ImageAnalysis, SquiggleFeatures, ImageEnhancementPrompt
        from backend.services.image_morpher import generate_enhancement_prompt, morph_image
        print(f"[OK] openai_image_model = {settings.openai_image_model}")
        print(f"[OK] openai_api_key = {'set' if settings.openai_api_key else 'MISSING'}")
    except Exception as e:
        print(f"FAIL: Could not import services: {e}")
        sys.exit(1)

    if not settings.openai_api_key:
        print("ERROR: OPENAI_API_KEY not set in .env")
        sys.exit(1)

    # Step 2: Create test inputs
    print("\n--- Step 2: Create test inputs ---")
    color = ColorInput.from_hex("#E06030")
    print(f"[OK] Color: {color.hex} ({color.hue_category}, sat={color.saturation})")

    fake_analysis = ImageAnalysis(
        scene_description="A warm sunset over rolling hills",
        detected_objects=["hills", "sky", "sun"],
        vibe="peaceful",
        emotion="serene",
        dominant_colors=["orange", "gold", "deep blue"],
        environment="outdoor",
        time_of_day="sunset",
        ambient_sound_associations=["wind", "crickets"],
        sonic_metaphor="a gentle exhale",
    )
    fake_squiggle = SquiggleFeatures(
        total_length=1.5,
        bounding_box_area=0.3,
        average_speed=0.8,
        speed_variance=0.2,
        point_count=50,
    )
    print("[OK] Created fake ImageAnalysis and SquiggleFeatures")

    # Step 3: Generate enhancement prompt
    print("\n--- Step 3: Generate enhancement prompt ---")
    try:
        enhancement = await generate_enhancement_prompt(fake_analysis, color, fake_squiggle)
        print(f"[OK] emotional_intent: {enhancement.emotional_intent}")
        print(f"     visual_directive: {enhancement.visual_directive}")
        print(f"     morphing_prompt: {enhancement.morphing_prompt}")
        print(f"     style_reference: {enhancement.style_reference}")
    except Exception as e:
        print(f"FAIL: Enhancement prompt generation failed: {e}")
        sys.exit(1)

    # Step 4: Morph image
    print("\n--- Step 4: Morph image ---")
    try:
        morphed_bytes = await morph_image(image_bytes, color, enhancement)
        print(f"[OK] Morphed image: {len(morphed_bytes)} bytes")

        # Save debug outputs
        morphed_img = Image.open(io.BytesIO(morphed_bytes))
        print(f"     Dimensions: {morphed_img.width}x{morphed_img.height}, mode: {morphed_img.mode}")

        morphed_img.save("_debug_morphed.png")
        print("[OK] Saved: _debug_morphed.png")
    except Exception as e:
        print(f"FAIL: Image morphing failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    # Save the overlay for reference
    print("\n--- Saving debug overlay ---")
    try:
        overlay_img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        opacity = int(255 * (0.10 + 0.20 * color.saturation))
        hex_clean = color.hex.lstrip("#")
        r, g, b = int(hex_clean[0:2], 16), int(hex_clean[2:4], 16), int(hex_clean[4:6], 16)
        ov = Image.new("RGBA", overlay_img.size, (r, g, b, opacity))
        composited = Image.alpha_composite(overlay_img, ov).convert("RGB")
        composited.save("_debug_overlay.png")
        print("[OK] Saved: _debug_overlay.png")
    except Exception as e:
        print(f"WARN: Could not save overlay: {e}")

    print("\n=== SUCCESS ===")
    print("Check _debug_overlay.png (input to API) and _debug_morphed.png (output from API)")


if __name__ == "__main__":
    asyncio.run(main())
