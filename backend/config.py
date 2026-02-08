from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    elevenlabs_api_key: str = ""
    openai_model: str = "gpt-5.2"
    elevenlabs_sfx_model: str = "eleven_text_to_sound_v2"
    elevenlabs_music_model: str = "music_v1"
    prompt_influence: float = 0.6
    max_image_size_mb: int = 10

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
