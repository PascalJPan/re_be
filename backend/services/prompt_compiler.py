from backend.models.schemas import (
    AudioStructuredObject,
    ColorInput,
    ImageAnalysis,
    SquiggleFeatures,
)


def compile_prompt(
    obj: AudioStructuredObject,
    color: ColorInput,
    image_analysis: ImageAnalysis,
    squiggle: SquiggleFeatures,
) -> str:
    """Compile all inputs into a vivid, scene-based prompt for ElevenLabs music generation."""

    # --- Color → tonal quality ---
    color_tone_map = {
        "warm_red": "warm and bold",
        "warm_orange": "warm and earthy",
        "warm_yellow": "bright and radiant",
        "warm_magenta": "warm and lush",
        "cool_blue": "cool and ethereal",
        "cool_cyan": "crisp and spacious",
        "cool_purple": "deep and mysterious",
        "cool_green": "organic and verdant",
        "neutral_gray": "muted and minimal",
    }
    color_tone = color_tone_map.get(color.hue_category, "balanced")

    if color.saturation > 0.7:
        color_tone += ", vivid"
    elif color.saturation < 0.3:
        color_tone += ", subdued"

    if color.lightness > 0.7:
        color_tone += ", airy"
    elif color.lightness < 0.3:
        color_tone += ", dark"

    # --- Squiggle → rhythmic character ---
    if squiggle.average_speed > 0.005:
        if squiggle.speed_variance > 0.00002:
            rhythm_desc = "erratic, percussive rhythms"
        else:
            rhythm_desc = "driving, steady rhythms"
    elif squiggle.average_speed < 0.001:
        rhythm_desc = "sustained pads and slow drones"
    else:
        rhythm_desc = "flowing, melodic phrases"

    if squiggle.total_length > 2.0:
        rhythm_desc += " with layered complexity"
    elif squiggle.total_length < 0.5:
        rhythm_desc += " with focused simplicity"

    # --- Energy → expressive descriptor ---
    energy = obj.energy
    if energy < 0.15:
        energy_desc = "barely breathing"
    elif energy < 0.3:
        energy_desc = "gently simmering"
    elif energy < 0.5:
        energy_desc = "quietly building"
    elif energy < 0.7:
        energy_desc = "warmly pulsing"
    elif energy < 0.85:
        energy_desc = "intensely surging"
    else:
        energy_desc = "explosively energetic"

    # --- Mood ---
    mood_str = f"{obj.mood.primary} and {obj.mood.secondary}"

    # --- Texture ---
    texture_str = ", ".join(obj.texture) if obj.texture else "smooth"

    # --- Sound references ---
    refs = obj.sound_references[:3] if obj.sound_references else []
    refs_str = ", ".join(refs) if refs else "abstract tones"

    # --- Scene / narrative framing from image analysis ---
    scene = image_analysis.scene_description
    vibe = image_analysis.vibe

    scene_parts = []
    if image_analysis.time_of_day:
        scene_parts.append(image_analysis.time_of_day)
    if image_analysis.environment:
        scene_parts.append(image_analysis.environment)
    scene_context = " ".join(scene_parts) if scene_parts else ""

    # --- Build the prompt ---
    prompt = f"Soundtrack for: {scene}. Vibe: {vibe}. "
    if scene_context:
        prompt += f"Setting: {scene_context}. "

    bpm_key_str = ""
    if obj.bpm is not None:
        bpm_key_str += f"{obj.bpm} BPM, "
    if obj.musical_key is not None:
        bpm_key_str += f"in {obj.musical_key}, "

    prompt += (
        f"An {energy_desc}, {mood_str} instrumental music track "
        f"with a {color_tone} tonal palette, "
        f"{texture_str} textures, and {rhythm_desc}. "
        f"Drawing from {refs_str}. "
        f"{bpm_key_str}"
        f"{obj.tempo} tempo, {obj.density} density, "
        f"{obj.duration_seconds} seconds long. "
        f"Instrumental only, no vocals, no lyrics."
    )

    return prompt
