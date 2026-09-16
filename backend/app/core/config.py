from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "SmartRoad Audit API"

    DATABASE_URL: str

    GOOGLE_MAPS_API_KEY: str | None = None

    DEMO_MODE: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()