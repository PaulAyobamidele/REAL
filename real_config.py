import os

from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    # Redis
    redis_host: str = Field("localhost", env="REDIS_HOST")
    redis_port: int = Field(6379, env="REDIS_PORT")

    # MLflow
    mlflow_tracking_uri: str = Field("http://127.0.0.1:5000", env="MLFLOW_TRACKING_URI")

    # REAL API (FastAPI/uvicorn bind + client base URL for pages/*.py)
    api_host: str = Field("127.0.0.1", env="API_HOST")
    api_port: int = Field(7999, env="API_PORT")

    # CARLA
    carla_host: str = Field("127.0.0.1", env="CARLA_HOST")
    carla_port: int = Field(2000, env="CARLA_PORT")
    carla_root: str = Field("/opt/carla", env="CARLA_ROOT")
    carla_map_path: str = Field(
        "/opt/carla/CarlaUE4/Content/Carla/Maps/OpenDrive/Town01.xodr",
        env="CARLA_MAP_PATH",
    )
    carla_map_name: str = Field("Town01", env="CARLA_MAP_NAME")

    # Grammar / templates base dir (repo-relative, __file__-anchored default)
    grammar_base_dir: str = Field(
        default_factory=lambda: os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "scripts", "templates"
        ),
        env="GRAMMAR_BASE_DIR",
    )

    # Artifacts / run outputs (created lazily by whoever writes into it)
    artifacts_dir: str = Field(
        default_factory=lambda: os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "artifacts"
        ),
        env="ARTIFACTS_DIR",
    )

    # YOLO perception model weights (repo-relative, __file__-anchored default)
    model_dir: str = Field(
        default_factory=lambda: os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "model"
        ),
        env="MODEL_DIR",
    )

    # Seed for the GE search and for Scenic's scene sampling (per scenario:
    # seed + scenario index). Recorded in every run_meta.json.
    random_seed: int = Field(42, env="RANDOM_SEED")

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
