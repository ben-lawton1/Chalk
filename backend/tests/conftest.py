"""Shared pytest fixtures for the Chalk backend tests (WP5)."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db import BoardStore
from app.main import create_app


@pytest.fixture
def db_path(tmp_path: Path) -> str:
    return str(tmp_path / "chalk-test.db")


@pytest.fixture
def store(db_path: str) -> BoardStore:
    s = BoardStore(db_path)
    s.init()
    return s


@pytest.fixture
def client(db_path: str) -> Iterator[TestClient]:
    with TestClient(create_app(db_path=db_path, static_dir="")) as c:
        yield c


@pytest.fixture
def scene_with():
    """Factory for a minimal valid scene whose elements are opaque dicts."""

    def make(*element_ids: str) -> dict:
        return {"type": "chalk/scene", "version": 1, "elements": [{"id": i, "type": "shape"} for i in element_ids]}

    return make
