"""SPA static mount and cache header tests (WP5)."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    root = tmp_path / "static"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("<!doctype html><title>Chalk</title>")
    (root / "assets" / "x.js").write_text("console.log(1)")
    (root / "favicon.svg").write_text("<svg/>")
    return root


@pytest.fixture
def spa(tmp_path: Path, static_dir: Path):
    with TestClient(create_app(db_path=str(tmp_path / "s.db"), static_dir=str(static_dir))) as c:
        yield c


def test_index_no_cache(spa):
    r = spa.get("/")
    assert r.status_code == 200
    assert "Chalk" in r.text
    assert r.headers["cache-control"] == "no-cache"


def test_index_html_no_cache(spa):
    r = spa.get("/index.html", follow_redirects=True)
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-cache"


def test_assets_immutable(spa):
    r = spa.get("/assets/x.js")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_missing_asset_404(spa):
    assert spa.get("/assets/missing.js").status_code == 404


def test_other_static_file_has_no_cache_header(spa):
    r = spa.get("/favicon.svg")
    assert r.status_code == 200
    assert "cache-control" not in r.headers


def test_api_wins_over_static(spa):
    assert spa.get("/api/health").json() == {"status": "ok"}
    r = spa.get("/api/nope")
    assert r.status_code == 404
    assert r.json() == {"detail": "Not found"}
    assert "cache-control" not in r.headers
    assert spa.post("/api/nope").status_code == 404


def test_no_mount_when_dir_empty_string(tmp_path):
    c = TestClient(create_app(db_path=str(tmp_path / "a.db"), static_dir=""))
    assert c.get("/").status_code == 404
    assert c.get("/api/health").status_code == 200
    assert c.get("/api/nope").json() == {"detail": "Not found"}


def test_no_mount_when_dir_absent(tmp_path):
    c = TestClient(create_app(db_path=str(tmp_path / "a.db"), static_dir=str(tmp_path / "nope")))
    assert c.get("/").status_code == 404


def test_no_mount_when_dir_has_no_files(tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    app = create_app(db_path=str(tmp_path / "a.db"), static_dir=str(empty))
    assert not any(getattr(r, "name", None) == "spa" for r in app.routes)
    assert TestClient(app).get("/").status_code == 404
