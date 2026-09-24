from real_config import Settings


def test_defaults_match_previous_hardcoded_values():
    settings = Settings(_env_file=None)
    assert settings.redis_host == "localhost"
    assert settings.redis_port == 6379
    assert settings.mlflow_tracking_uri == "http://127.0.0.1:5000"
    assert settings.api_host == "127.0.0.1"
    assert settings.api_port == 7999
    assert settings.carla_host == "127.0.0.1"
    assert settings.carla_port == 2000
    assert settings.carla_map_path == (
        "/opt/carla/CarlaUE4/Content/Carla/Maps/OpenDrive/Town01.xodr"
    )
    assert settings.carla_map_name == "Town01"


def test_env_var_override(monkeypatch):
    monkeypatch.setenv("REDIS_PORT", "1234")
    monkeypatch.setenv("CARLA_PORT", "3000")
    settings = Settings(_env_file=None)
    assert settings.redis_port == 1234
    assert settings.carla_port == 3000
