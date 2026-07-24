from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    bigquery_project: str
    bigquery_dataset: str
    google_application_credentials: str
    firebase_config: str | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
