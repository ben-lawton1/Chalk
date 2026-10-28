"""GET /api/health through Starlette's TestClient (WP0)."""

from fastapi.testclient import TestClient

from app.main import create_app


def test_health(tmp_path) -> None:
    client = TestClient(create_app(db_path=str(tmp_path / "t.db"), static_dir=""))
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_config_default(tmp_path, monkeypatch) -> None:
    monkeypatch.delenv("CHALK_TERMINAL_URL", raising=False)
    client = TestClient(create_app(db_path=str(tmp_path / "t.db"), static_dir=""))
    response = client.get("/api/config")
    assert response.status_code == 200
    assert response.json() == {"terminalUrl": "http://127.0.0.1:7681"}


def test_config_terminal_url_from_env(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CHALK_TERMINAL_URL", "http://term-test:7681")
    client = TestClient(create_app(db_path=str(tmp_path / "t.db"), static_dir=""))
    assert client.get("/api/config").json() == {"terminalUrl": "http://term-test:7681"}
