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
    """Compile all inputs into a dense, emotionally specific prompt for ElevenLabs music generation."""

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
    if squiggle.average_speed > 0.003:
        if squiggle.speed_variance > 0.00002:
            rhythm_desc = "erratic, percussive rhythms"
        else:
            rhythm_desc = "driving, steady rhythms"
    elif squiggle.average_speed < 0.0005:
        rhythm_desc = "sustained pads and slow drones"
    else:
        rhythm_desc = "flowing, melodic phrases"

    if squiggle.total_length > 2.0:
        rhythm_desc += " with layered complexity"
    elif squiggle.total_length < 0.5:
        rhythm_desc += " with focused simplicity"

    # --- Energy → expressive descriptor (with upward compression) ---
    raw_energy = obj.energy
    energy = 0.3 + raw_energy * 0.7  # maps [0,1] → [0.3, 1.0]
    if energy < 0.4:
        energy_desc = "steadily grooving"
    elif energy < 0.55:
        energy_desc = "building momentum"
    elif energy < 0.7:
        energy_desc = "driving and pulsing"
    elif energy < 0.85:
        energy_desc = "intensely surging"
    else:
        energy_desc = "explosively energetic"

    # --- Mood ---
    mood_str = f"{obj.mood.primary} and {obj.mood.secondary}"

    # --- Texture ---
    texture_str = ", ".join(obj.texture) if obj.texture else "smooth"

    # --- Sound references (use up to 6) ---
    refs = obj.sound_references[:6] if obj.sound_references else []
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

    # --- Build the prompt (direct and descriptive for ElevenLabs) ---

    prompt = f"Instrumental {obj.audio_type} track. "

    # Genre hint up front if available
    if obj.genre_hint:
        prompt += f"Genre: {obj.genre_hint}. "

    prompt += f"Scene: {scene}. Vibe: {vibe}. "

    if scene_context:
        prompt += f"Setting: {scene_context}. "

    # Sonic metaphor — the poetic essence
    if image_analysis.sonic_metaphor:
        prompt += f"Sounds like: {image_analysis.sonic_metaphor}. "

    # Core musical description
    bpm_key_str = ""
    if obj.bpm is not None:
        bpm_key_str += f"{obj.bpm} BPM, "
    if obj.musical_key is not None:
        bpm_key_str += f"in {obj.musical_key}, "

    prompt += (
        f"{energy_desc.capitalize()}, {mood_str} mood "
        f"with a {color_tone} tonal palette, "
        f"{texture_str} textures, and {rhythm_desc}. "
    )

    # Instruments
    if obj.instruments:
        prompt += f"Instruments: {', '.join(obj.instruments)}. "

    # Sonic palette / timbre
    if obj.sonic_palette:
        prompt += f"Timbre: {obj.sonic_palette}. "

    # Harmonic mood
    if obj.harmonic_mood:
        prompt += f"Harmonic feel: {obj.harmonic_mood}. "

    # Dynamic shape
    if obj.dynamic_shape:
        prompt += f"Dynamic shape: {obj.dynamic_shape}. "

    # Sound references
    prompt += f"Drawing from: {refs_str}. "

    # Engagement push
    prompt += "Make it musically engaging with clear rhythm and forward momentum. "

    # Strict constraints
    prompt += (
        f"{bpm_key_str}"
        f"{obj.tempo} tempo, {obj.density} density, "
        f"{obj.duration_seconds} seconds long. "
        f"Instrumental only, no vocals, no lyrics."
    )

    return prompt
