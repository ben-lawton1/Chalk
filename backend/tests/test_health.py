"""GET /api/health through Starlette's TestClient (WP0)."""

from fastapi.testclient import TestClient

from app.main import create_app


def test_health(tmp_path) -> None:
    client = TestClient(create_app(db_path=str(tmp_path / "t.db"), static_dir=""))
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
