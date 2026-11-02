"""GET /api/health through Starlette's TestClient (WP0)."""

from fastapi.testclient import TestClient

from app.main import create_app

def test_health(tmp_path) -> None:
    client = TestClient(create_app(db_path=str(tmp_path / "t.db"), static_dir=""))
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_config_default(tmp_path, monkeypatch) -> None:
    monkeypatch.delenv("CHALK_EMBED_ORIGINS", raising=False)
    client = TestClient(create_app(db_path=str(tmp_path / "t.db"), static_dir=""))
    response = client.get("/api/config")
    assert response.status_code == 200
    assert response.json() == {
        "embedOrigins": ["http://localhost:8090", "http://127.0.0.1:8090"],
    }

def test_config_embed_origins_from_env(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CHALK_EMBED_ORIGINS", " https://atlas.example/ , http://a:1,*,bad;origin,http://a:1")
    client = TestClient(create_app(db_path=str(tmp_path / "t.db"), static_dir=""))
    assert client.get("/api/config").json()["embedOrigins"] == ["https://atlas.example", "http://a:1"]
