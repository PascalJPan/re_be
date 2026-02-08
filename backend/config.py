from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    elevenlabs_api_key: str = ""
    openai_model: str = "gpt-5-model"
    openai_fast_model: str = "gpt-4.1-nano"
    openai_image_model: str = "gpt-image-1"
    elevenlabs_sfx_model: str = "eleven_text_to_sound_v2"
    elevenlabs_music_model: str = "music_v1"
    prompt_influence: float = 0.85
    max_image_size_mb: int = 10
    jwt_secret: str = "change-me-in-production"
    admin_passcode: str = "00000"
    database_path: str = "re.db"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
