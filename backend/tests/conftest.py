"""Shared pytest fixtures for the Chalk backend tests (v2-A)."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.library import LibraryStore
from app.main import create_app


@pytest.fixture
def library_dir(tmp_path: Path) -> Path:
    return tmp_path / "library"


@pytest.fixture
def store(library_dir: Path) -> LibraryStore:
    s = LibraryStore(str(library_dir))
    s.init()
    return s


@pytest.fixture
def client(library_dir: Path) -> Iterator[TestClient]:
    with TestClient(create_app(library_dir=str(library_dir), static_dir="", db_path="")) as c:
        yield c


@pytest.fixture
def scene_with():
    """Factory for a minimal valid scene whose elements are opaque dicts."""

    def make(*element_ids: str) -> dict:
        return {"type": "chalk/scene", "version": 4, "elements": [{"id": i, "type": "shape"} for i in element_ids]}

    return make
