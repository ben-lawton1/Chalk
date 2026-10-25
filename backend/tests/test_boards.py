"""Board API and BoardStore tests (WP5)."""

import re
import sqlite3
import time

import pytest

from app.db import BoardStore, ConflictError, NotFoundError
from app.models import MAX_SCENE_BYTES

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
EMPTY = {"type": "chalk/scene", "version": 1, "elements": []}


def test_create_default(client):
    r = client.post("/api/boards", json={})
    assert r.status_code == 201
    b = r.json()
    assert b["name"] == "Untitled board"
    assert b["version"] == 1
    assert b["scene"] == EMPTY
    assert len(b["id"]) == 11
    assert ISO_RE.match(b["updatedAt"]) and ISO_RE.match(b["createdAt"])
    assert set(b) == {"id", "name", "version", "updatedAt", "createdAt", "scene"}


def test_create_named_with_scene(client, scene_with):
    scene = scene_with("a", "b")
    r = client.post("/api/boards", json={"name": "  Plan  ", "scene": scene})
    assert r.status_code == 201
    assert r.json()["name"] == "Plan"
    assert r.json()["scene"] == scene
    got = client.get(f"/api/boards/{r.json()['id']}").json()
    assert got["scene"] == scene


@pytest.mark.parametrize(
    "body",
    [
        {"scene": {"type": "other", "version": 1, "elements": []}},
        {"scene": {"type": "chalk/scene", "version": 1}},
        {"scene": {"type": "chalk/scene", "version": 0, "elements": []}},
        {"scene": {"type": "chalk/scene", "version": 1, "elements": {}}},
        {"scene": "nope"},
        {"name": ""},
        {"name": "   "},
        {"name": "x" * 121},
    ],
)
def test_create_422(client, body):
    assert client.post("/api/boards", json=body).status_code == 422


def test_list_order(client):
    ids = [client.post("/api/boards", json={"name": f"b{i}"}).json()["id"] for i in range(3)]
    listed = client.get("/api/boards").json()
    assert [b["id"] for b in listed] == ids[::-1]
    assert "scene" not in listed[0]
    # Updating the oldest moves it to the top.
    time.sleep(0.01)
    assert client.put(f"/api/boards/{ids[0]}", json={"name": "renamed"}).status_code == 200
    assert client.get("/api/boards").json()[0]["id"] == ids[0]


def test_list_empty(client):
    assert client.get("/api/boards").json() == []


def test_get_404_and_invalid_id(client):
    r = client.get("/api/boards/doesnotexist")
    assert r.status_code == 404
    assert r.json() == {"detail": "Board not found"}
    for bad in ["abc", "a" * 65, "bad.id.here", "has%20space"]:
        assert client.get(f"/api/boards/{bad}").status_code == 404
        assert client.put(f"/api/boards/{bad}", json={"name": "x"}).status_code == 404
        assert client.delete(f"/api/boards/{bad}").status_code == 404


def test_put_increments_version(client, scene_with):
    b = client.post("/api/boards", json={}).json()
    scene = scene_with("a")
    r = client.put(f"/api/boards/{b['id']}", json={"scene": scene, "baseVersion": 1})
    assert r.status_code == 200
    s = r.json()
    assert set(s) == {"id", "name", "version", "updatedAt"}
    assert s["version"] == 2
    assert s["name"] == "Untitled board"
    r = client.put(f"/api/boards/{b['id']}", json={"scene": scene, "baseVersion": 2})
    assert r.json()["version"] == 3
    assert client.get(f"/api/boards/{b['id']}").json()["scene"] == scene


def test_put_409(client):
    b = client.post("/api/boards", json={}).json()
    client.put(f"/api/boards/{b['id']}", json={"name": "one", "baseVersion": 1})
    r = client.put(f"/api/boards/{b['id']}", json={"name": "two", "baseVersion": 1})
    assert r.status_code == 409
    assert r.json() == {"detail": {"message": "Version conflict", "currentVersion": 2}}
    assert client.get(f"/api/boards/{b['id']}").json()["name"] == "one"


def test_put_force(client, scene_with):
    b = client.post("/api/boards", json={}).json()
    client.put(f"/api/boards/{b['id']}", json={"name": "one", "baseVersion": 1})
    r = client.put(f"/api/boards/{b['id']}", json={"name": "forced"})
    assert r.status_code == 200 and r.json()["version"] == 3
    r = client.put(f"/api/boards/{b['id']}", json={"scene": scene_with("z"), "baseVersion": None})
    assert r.status_code == 200 and r.json()["version"] == 4
    got = client.get(f"/api/boards/{b['id']}").json()
    assert got["name"] == "forced"
    assert got["scene"]["elements"] == [{"id": "z", "type": "shape"}]


def test_put_rename_only_keeps_scene(client, scene_with):
    b = client.post("/api/boards", json={"scene": scene_with("a")}).json()
    r = client.put(f"/api/boards/{b['id']}", json={"name": "New", "baseVersion": 1})
    assert r.json()["name"] == "New"
    assert client.get(f"/api/boards/{b['id']}").json()["scene"] == b["scene"]


def test_put_scene_only_keeps_name(client, scene_with):
    b = client.post("/api/boards", json={"name": "Keep"}).json()
    client.put(f"/api/boards/{b['id']}", json={"scene": scene_with("a")})
    assert client.get(f"/api/boards/{b['id']}").json()["name"] == "Keep"


def test_put_400_empty_update(client):
    b = client.post("/api/boards", json={}).json()
    for body in ({}, {"baseVersion": 1}, {"name": None, "scene": None}):
        r = client.put(f"/api/boards/{b['id']}", json=body)
        assert r.status_code == 400
        assert r.json() == {"detail": "Nothing to update"}


def test_put_404(client):
    r = client.put("/api/boards/missing-board", json={"name": "x", "baseVersion": 1})
    assert r.status_code == 404


def test_put_422(client):
    b = client.post("/api/boards", json={}).json()
    assert client.put(f"/api/boards/{b['id']}", json={"name": "  "}).status_code == 422
    assert client.put(f"/api/boards/{b['id']}", json={"scene": {"type": "x"}}).status_code == 422


def test_delete(client):
    b = client.post("/api/boards", json={}).json()
    r = client.delete(f"/api/boards/{b['id']}")
    assert r.status_code == 204
    assert r.content == b""
    assert client.delete(f"/api/boards/{b['id']}").status_code == 404
    assert client.get(f"/api/boards/{b['id']}").status_code == 404


def test_413(client, monkeypatch):
    import app.routes as routes

    monkeypatch.setattr(routes, "MAX_SCENE_BYTES", 200)
    big = {"type": "chalk/scene", "version": 1, "elements": [{"t": "x" * 300}]}
    r = client.post("/api/boards", json={"scene": big})
    assert r.status_code == 413
    assert r.json() == {"detail": "Scene too large"}
    b = client.post("/api/boards", json={}).json()
    r = client.put(f"/api/boards/{b['id']}", json={"scene": big})
    assert r.status_code == 413
    assert client.get(f"/api/boards/{b['id']}").json()["version"] == 1


def test_size_limit_constant():
    assert MAX_SCENE_BYTES == 10_000_000


def test_unknown_api_route_json_404(client):
    for method in ("get", "post", "put", "patch", "delete"):
        r = getattr(client, method)("/api/nope")
        assert r.status_code == 404
        assert r.json() == {"detail": "Not found"}
    assert client.patch("/api/boards/abcdefgh").status_code == 404
    assert client.post("/api/boards/abcdefgh/extra").status_code == 404


# --- BoardStore directly -------------------------------------------------


def test_store_persists_across_instances(db_path, scene_with):
    a = BoardStore(db_path)
    a.init()
    created = a.create("Persist", scene_with("p"))
    b = BoardStore(db_path)
    b.init()  # idempotent
    got = b.get(created["id"])
    assert got is not None
    assert got["name"] == "Persist"
    assert got["scene"] == scene_with("p")
    assert [x["id"] for x in b.list()] == [created["id"]]


def test_store_init_creates_parent_dir_and_schema(tmp_path):
    path = tmp_path / "deep" / "er" / "x.db"
    s = BoardStore(str(path))
    s.init()
    assert path.exists()
    with sqlite3.connect(path) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 1
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master")}
    assert {"boards", "boards_updated_idx"} <= names


def test_store_update_errors(store):
    with pytest.raises(NotFoundError):
        store.update("nothere", name="x", scene=None, base_version=None)
    b = store.create("n", {"type": "chalk/scene", "version": 1, "elements": []})
    with pytest.raises(ConflictError) as ei:
        store.update(b["id"], name="x", scene=None, base_version=5)
    assert ei.value.current_version == 1
    assert store.update(b["id"], name="x", scene=None, base_version=1)["version"] == 2
    assert store.delete(b["id"]) is True
    assert store.delete(b["id"]) is False
    assert store.get(b["id"]) is None


def test_health_still_served(client):
    assert client.get("/api/health").json() == {"status": "ok"}
