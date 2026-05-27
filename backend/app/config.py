"""
ParaLex — Application Configuration
All secrets are read from environment variables; nothing is hardcoded.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
from typing import Literal


BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────────────
    app_name: str = "ParaLex"
    environment: Literal["development", "production"] = "development"
    debug: bool = True
    secret_key: str = "change-me-in-production-please"

    # ── Anthropic ────────────────────────────────────────────────────────────
    anthropic_api_key: str
    claude_model: str = "claude-sonnet-4-6"

    # ── Storage ──────────────────────────────────────────────────────────────
    data_dir: Path = BASE_DIR / "data"
    uploads_dir: Path = BASE_DIR / "data" / "uploads"
    chroma_dir: Path = BASE_DIR / "data" / "chroma"
    database_url: str = f"sqlite+aiosqlite:///{BASE_DIR}/data/paralex.db"

    # ── Embedding ────────────────────────────────────────────────────────────
    # Runs locally — no data leaves the machine
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dim: int = 384

    # ── RAG ──────────────────────────────────────────────────────────────────
    chunk_size: int = 512
    chunk_overlap: int = 64
    top_k_retrieval: int = 12          # chunks returned per query
    similarity_threshold: float = 0.35  # below this → "not found in docs"

    # ── OCR ──────────────────────────────────────────────────────────────────
    tesseract_cmd: str = "tesseract"   # or full path: /usr/local/bin/tesseract

    # ── EB-5 ──────────────────────────────────────────────────────────────────
    eb5_tea_minimum: int = 800_000     # Targeted Employment Area
    eb5_standard_minimum: int = 1_050_000

    def model_post_init(self, __context):
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_dir.mkdir(parents=True, exist_ok=True)
        (self.data_dir).mkdir(parents=True, exist_ok=True)


settings = Settings()
