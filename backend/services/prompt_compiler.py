from backend.models.schemas import AudioStructuredObject


def compile_prompt(obj: AudioStructuredObject) -> str:
    """Deterministic compilation of AudioStructuredObject into a natural-language prompt for ElevenLabs."""

    # Audio type description
    type_map = {
        "music": "instrumental music track",
        "ambient": "ambient soundscape",
        "hybrid": "ambient instrumental piece",
    }
    type_desc = type_map[obj.audio_type]

    # Mood
    mood_str = f"{obj.mood.primary} and {obj.mood.secondary}"

    # Energy level
    if obj.energy <= 0.3:
        energy_str = "low-energy"
    elif obj.energy < 0.7:
        energy_str = "moderate-energy"
    else:
        energy_str = "high-energy"

    # Texture
    texture_str = ", ".join(obj.texture) if obj.texture else "smooth"

    # Sound references
    if obj.sound_references:
        refs_str = " and ".join(obj.sound_references[:3]) + "-like sounds"
    else:
        refs_str = "abstract tones"

    # Build prompt
    prompt = (
        f"Generate a {mood_str}, {energy_str} {type_desc} "
        f"with {texture_str} textures and subtle {refs_str}, "
        f"{obj.tempo} tempo, {obj.density} density, "
        f"{obj.duration_seconds} seconds long. "
        f"Instrumental only, no vocals, no lyrics."
    )

    return prompt
