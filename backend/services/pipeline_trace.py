from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from backend.models.schemas import (
    AudioStructuredObject,
    ColorInput,
    ImageAnalysis,
    ImageEnhancementPrompt,
    SquiggleFeatures,
)

TRACE_DIR = Path(__file__).resolve().parent.parent.parent / "pipeline_traces"


def _pretty(obj: object) -> str:
    if hasattr(obj, "model_dump"):
        return json.dumps(obj.model_dump(), indent=2)
    if isinstance(obj, dict):
        return json.dumps(obj, indent=2)
    return str(obj)


def _sep(title: str) -> str:
    bar = "=" * 80
    return f"\n{bar}\n {title}\n{bar}\n"


def write_trace(
    *,
    trace_type: str,
    item_id: str,
    username: str,
    color_hex: str,
    color: ColorInput,
    image_analysis: ImageAnalysis,
    squiggle_features: SquiggleFeatures,
    structured_object: AudioStructuredObject,
    compiled_prompt: str,
    audio_filename: str,
    enhancement_prompt: Optional[ImageEnhancementPrompt] = None,
    morph_status: Optional[str] = None,
    parent_object: Optional[AudioStructuredObject] = None,
) -> Path:
    TRACE_DIR.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{trace_type}_{item_id}_{ts}.txt"
    filepath = TRACE_DIR / filename

    lines: list[str] = []
    w = lines.append

    w("=" * 80)
    w(f"  PIPELINE TRACE — {trace_type.upper()}")
    w(f"  ID: {item_id}  |  User: {username}  |  {datetime.now().isoformat()}")
    w("=" * 80)

    # --- Step 1: Color ---
    w(_sep("STEP 1: COLOR DERIVATION"))
    w(f"Input hex: {color_hex}\n")
    w(_pretty(color))

    # --- Step 2: Image Analysis ---
    w(_sep("STEP 2: IMAGE ANALYSIS (OpenAI Vision → gpt-5.2)"))
    w("Input: user-uploaded image (binary)\n")
    w("Output (ImageAnalysis):")
    w(_pretty(image_analysis))

    # --- Step 3: Squiggle Features ---
    w(_sep("STEP 3: SQUIGGLE FEATURE EXTRACTION"))
    w("Output (SquiggleFeatures):")
    w(_pretty(squiggle_features))

    # --- Step 4-5: Enhancement + Morph (posts only) ---
    if enhancement_prompt is not None:
        w(_sep("STEP 4: IMAGE ENHANCEMENT PROMPT (OpenAI → gpt-5.2)"))
        w("Input: ImageAnalysis + ColorInput + SquiggleFeatures\n")
        w("Output (ImageEnhancementPrompt):")
        w(_pretty(enhancement_prompt))

        w(_sep("STEP 5: IMAGE MORPHING (OpenAI → gpt-image-1)"))
        w("Input image: original + color overlay (Pillow)")
        w(f"Prompt sent to gpt-image-1:\n\n  \"{enhancement_prompt.morphing_prompt}\"\n")
        if morph_status == "success":
            w("Output: morphed image bytes (stored as post image) — SUCCESS")
        elif morph_status and morph_status.startswith("failed:"):
            w(f"Output: FAILED — {morph_status}  (original image used instead)")
        else:
            w("Output: morph status unknown")

    # --- Parent (comments only) ---
    if parent_object is not None:
        w(_sep("PARENT POST AUDIO OBJECT (inherited bpm/key/duration)"))
        w(_pretty(parent_object))

    # --- Step 6: Audio Structured Object ---
    step_num = "6" if enhancement_prompt is not None else "4"
    w(_sep(f"STEP {step_num}: AUDIO STRUCTURED OBJECT (OpenAI → gpt-5.2)"))
    w("Input: ImageAnalysis + ColorInput + SquiggleFeatures" + (
        " + parent AudioStructuredObject" if parent_object else ""
    ) + "\n")
    w("Output (AudioStructuredObject):")
    w(_pretty(structured_object))

    # --- Step 7: Compiled Prompt ---
    next_step = str(int(step_num) + 1)
    w(_sep(f"STEP {next_step}: COMPILED PROMPT (deterministic logic)"))
    w("Input: AudioStructuredObject + ColorInput + ImageAnalysis + SquiggleFeatures\n")
    w("Output (prompt string sent to ElevenLabs):\n")
    w(f"  \"{compiled_prompt}\"")

    # --- Step 8-9: ElevenLabs ---
    el_step = str(int(next_step) + 1)
    w(_sep(f"STEP {el_step}: ELEVENLABS COMPOSITION PLAN (/v1/music/plan)"))
    w("Request payload:")
    w(json.dumps({
        "prompt": compiled_prompt,
        "music_length_ms": structured_object.duration_seconds * 1000,
        "prompt_influence": 0.85,
        "force_instrumental": True,
    }, indent=2))
    w("\nResponse: composition_plan JSON (opaque, passed to next step)")

    final_step = str(int(el_step) + 1)
    w(_sep(f"STEP {final_step}: ELEVENLABS AUDIO GENERATION (/v1/music)"))
    w("Request: { composition_plan: <from previous step>, output_format: \"mp3\" }")
    w(f"\nOutput: {audio_filename}")
    w(f"Saved to: backend/audio_files/{audio_filename}")

    w("\n" + "=" * 80)
    w(f"  TRACE COMPLETE — {audio_filename}")
    w("=" * 80 + "\n")

    filepath.write_text("\n".join(lines), encoding="utf-8")
    return filepath
