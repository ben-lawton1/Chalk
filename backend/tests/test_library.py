"""File library tests: tree, locations, naming, trash, folder CRUD, external edits, legacy import (v2-A)."""

import json
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.library import ConflictError, LibraryStore, NotFoundError, safe_name
from app.main import create_app

EMPTY = {"type": "chalk/scene", "version": 3, "elements": []}


def mkpage(client, name="P", notebook=None, section=None, **kw):
    body = {"name": name, **kw}
    if notebook:
        body.update(notebook=notebook, section=section)
    r = client.post("/api/boards", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def files(root: Path) -> list[str]:
    return sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file())


# --- tree & locations ---------------------------------------------------------


def test_empty_library_tree(client, library_dir):
    assert client.get("/api/library").json() == {"path": str(library_dir), "notebooks": []}
    assert (library_dir / ".chalk" / "trash").is_dir()


def test_default_location_creates_quick_notes(client, library_dir):
    b = mkpage(client, "First")
    assert (b["notebook"], b["section"]) == ("My Notebook", "Quick Notes")
    assert files(library_dir) == ["My Notebook/Quick Notes/First.chalk"]


def test_default_location_is_first_sorted(client):
    mkpage(client, "a", "Zeta", "Z1")
    mkpage(client, "b", "alpha", "Beta")
    mkpage(client, "c", "alpha", "Aaa")
    b = mkpage(client, "d")
    assert (b["notebook"], b["section"]) == ("alpha", "Aaa")


def test_page_file_format(client, library_dir, scene_with):
    b = mkpage(client, "Doc", "N", "S", scene=scene_with("a"))
    raw = (library_dir / "N" / "S" / "Doc.chalk").read_text(encoding="utf-8")
    assert " " not in raw.split('"scene"')[0]  # compact
    data = json.loads(raw)
    assert data["type"] == "chalk/page" and data["formatVersion"] == 1
    assert data["id"] == b["id"] and data["version"] == 1
    assert data["scene"] == scene_with("a")
    assert data["createdAt"] == b["createdAt"] and data["updatedAt"] == b["updatedAt"]


def test_tree_shape_and_natural_sorting(client, library_dir):
    for nb, sec, page in [("b", "s", "Page 10"), ("B", "s", "x"), ("a", "S2", "Page 2"), ("a", "S10", "Page 1"), ("a", "S2", "Page 10")]:
        mkpage(client, page, nb, sec)
    (library_dir / "empty-nb").mkdir()
    (library_dir / "empty-nb" / "empty-sec").mkdir()
    (library_dir / ".hidden").mkdir()
    (library_dir / "a" / ".secret").mkdir()
    tree = client.get("/api/library").json()
    assert [n["name"] for n in tree["notebooks"]] == ["a", "b", "empty-nb"]  # "B" merged into "b"
    a = tree["notebooks"][0]
    assert [s["name"] for s in a["sections"]] == ["S2", "S10"]
    assert [p["name"] for p in a["sections"][0]["pages"]] == ["Page 2", "Page 10"]
    page = a["sections"][0]["pages"][0]
    assert set(page) == {"id", "name", "version", "updatedAt", "notebook", "section"}
    assert (page["notebook"], page["section"]) == ("a", "S2")
    assert tree["notebooks"][2]["sections"] == [{"name": "empty-sec", "pages": []}]


def test_create_in_given_location_makes_folders(client, library_dir):
    b = mkpage(client, "Hi", "New NB", "New Sec")
    assert (library_dir / "New NB" / "New Sec" / "Hi.chalk").is_file()
    again = mkpage(client, "Hi2", "new nb", "NEW SEC")  # case-insensitive match reuses folders
    assert (again["notebook"], again["section"]) == ("New NB", "New Sec")
    assert b["id"] != again["id"]


# --- page rename, collisions, sanitising ----------------------------------------


def test_rename_page_renames_file(client, library_dir):
    b = mkpage(client, "Old", "N", "S")
    r = client.put(f"/api/boards/{b['id']}", json={"name": "Fresh", "baseVersion": 1})
    assert r.status_code == 200 and r.json()["name"] == "Fresh"
    assert files(library_dir) == ["N/S/Fresh.chalk"]
    assert client.get(f"/api/boards/{b['id']}").json()["name"] == "Fresh"


def test_name_collisions_get_suffix(client, library_dir):
    a = mkpage(client, "Same", "N", "S")
    b = mkpage(client, "Same", "N", "S")
    c = mkpage(client, "same", "N", "S")
    assert [a["name"], b["name"], c["name"]] == ["Same", "Same (2)", "same (3)"]
    other = mkpage(client, "Other", "N", "S")
    r = client.put(f"/api/boards/{other['id']}", json={"name": "Same"})
    assert r.json()["name"] == "Same (4)"
    # Re-sending the page's current requested name is stable (no churn).
    r = client.put(f"/api/boards/{b['id']}", json={"name": "Same"})
    assert r.json()["name"] == "Same (2)"
    assert len(files(library_dir)) == 4


def test_case_only_rename(client, library_dir):
    b = mkpage(client, "notes", "N", "S")
    r = client.put(f"/api/boards/{b['id']}", json={"name": "Notes"})
    assert r.status_code == 200 and r.json()["name"] == "Notes"
    assert files(library_dir) == ["N/S/Notes.chalk"]


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("a/b", "a-b"),
        ('x:y*z?"<>|', "x-y-z-----"),
        ("CON", "CON_"),
        ("nul.txt", "nul.txt_"),
        ("Com3", "Com3_"),
        ("trailing.", "trailing"),
        ("  spaced name  ", "spaced name"),
        (".hidden", "hidden"),
        ("a\\b", "a-b"),
        ("tab\there", "tab-here"),
    ],
)
def test_safe_name(raw, expected):
    assert safe_name(raw) == expected


@pytest.mark.parametrize("raw", ["...", " . ", ""])
def test_safe_name_rejects_empty(raw):
    with pytest.raises(ValueError):
        safe_name(raw)


def test_safe_name_truncates():
    assert len(safe_name("x" * 500)) == 120


def test_sanitised_names_via_api(client, library_dir):
    b = mkpage(client, "a/b")
    assert b["name"] == "a-b"
    assert mkpage(client, "CON")["name"] == "CON_"
    assert mkpage(client, "Name...")["name"] == "Name"
    r = client.put(f"/api/boards/{b['id']}", json={"name": "..."})
    assert r.status_code == 400 and r.json() == {"detail": "Invalid name"}
    assert client.post("/api/boards", json={"name": "..."}).status_code == 400
    assert client.post("/api/notebooks", json={"name": "..."}).status_code == 400
    assert client.post("/api/boards", json={"name": "x", "notebook": "...", "section": "s"}).status_code == 400


# --- delete -> trash ----------------------------------------------------------------


def test_delete_moves_to_trash(client, library_dir):
    b = mkpage(client, "Gone", "N", "S")
    assert client.delete(f"/api/boards/{b['id']}").status_code == 204
    assert client.get(f"/api/boards/{b['id']}").status_code == 404
    assert not (library_dir / "N" / "S" / "Gone.chalk").exists()
    trashed = list((library_dir / ".chalk" / "trash").iterdir())
    assert len(trashed) == 1 and trashed[0].name.endswith("-N-S-Gone.chalk")
    assert json.loads(trashed[0].read_text())["id"] == b["id"]
    assert client.get("/api/library").json()["notebooks"][0]["sections"][0]["pages"] == []


# --- notebooks & sections -----------------------------------------------------------


def test_notebook_crud(client, library_dir):
    r = client.post("/api/notebooks", json={"name": " Work "})
    assert r.status_code == 201 and r.json() == {"name": "Work"}
    assert client.post("/api/notebooks", json={"name": "work"}).json() == {"name": "work (2)"}
    r = client.put("/api/notebooks/Work", json={"name": "Job"})
    assert r.status_code == 200 and r.json() == {"name": "Job"}
    assert client.put("/api/notebooks/Job", json={"name": "Job"}).json() == {"name": "Job"}
    assert client.put("/api/notebooks/Job", json={"name": "JOB"}).json() == {"name": "JOB"}
    assert client.put("/api/notebooks/JOB", json={"name": "work (2)"}).json() == {"name": "work (2) (2)"}
    assert client.delete("/api/notebooks/work%20(2)").status_code == 204
    names = [n["name"] for n in client.get("/api/library").json()["notebooks"]]
    assert names == ["work (2) (2)"]
    assert any(p.name.endswith("-work (2)") for p in (library_dir / ".chalk" / "trash").iterdir())


def test_section_crud_and_pages_follow(client, library_dir):
    b = mkpage(client, "Pg", "N", "S1")
    r = client.post("/api/notebooks/N/sections", json={"name": "S2"})
    assert r.status_code == 201 and r.json() == {"name": "S2"}
    assert client.put("/api/notebooks/N/sections/S1", json={"name": "Renamed"}).json() == {"name": "Renamed"}
    got = client.get(f"/api/boards/{b['id']}").json()  # id still resolves after the folder move
    assert (got["notebook"], got["section"]) == ("N", "Renamed")
    assert client.put("/api/notebooks/N", json={"name": "NN"}).status_code == 200
    got = client.get(f"/api/boards/{b['id']}").json()
    assert (got["notebook"], got["section"]) == ("NN", "Renamed")
    assert client.delete("/api/notebooks/NN/sections/Renamed").status_code == 204
    assert client.get(f"/api/boards/{b['id']}").status_code == 404
    trash = [p.name for p in (library_dir / ".chalk" / "trash").iterdir()]
    assert len(trash) == 1 and trash[0].endswith("-NN-Renamed")


@pytest.mark.parametrize(
    "method,url,body",
    [
        ("put", "/api/notebooks/Nope", {"name": "x"}),
        ("delete", "/api/notebooks/Nope", None),
        ("post", "/api/notebooks/Nope/sections", {"name": "x"}),
        ("put", "/api/notebooks/Nope/sections/S", {"name": "x"}),
        ("delete", "/api/notebooks/Nope/sections/S", None),
        ("put", "/api/notebooks/N/sections/Nope", {"name": "x"}),
        ("delete", "/api/notebooks/N/sections/Nope", None),
        ("delete", "/api/notebooks/.chalk", None),
        ("delete", "/api/notebooks/..", None),
    ],
)
def test_folder_404s(client, method, url, body):
    mkpage(client, "p", "N", "S")
    r = getattr(client, method)(url, **({"json": body} if body else {}))
    assert r.status_code == 404, r.text


def test_folder_name_validation(client):
    assert client.post("/api/notebooks", json={"name": "  "}).status_code == 422
    assert client.post("/api/notebooks", json={}).status_code == 422
    assert client.post("/api/notebooks", json={"name": "x" * 121}).status_code == 422


# --- external edits ---------------------------------------------------------------------


def test_external_rename_and_move_still_resolve(client, library_dir):
    b = mkpage(client, "Orig", "N", "S")
    assert client.get("/api/library").status_code == 200
    (library_dir / "M").mkdir()
    (library_dir / "M" / "T").mkdir()
    (library_dir / "N" / "S" / "Orig.chalk").rename(library_dir / "M" / "T" / "Moved.chalk")
    got = client.get(f"/api/boards/{b['id']}").json()
    assert (got["notebook"], got["section"], got["name"]) == ("M", "T", "Moved")
    r = client.put(f"/api/boards/{b['id']}", json={"name": "Again", "baseVersion": 1})
    assert r.status_code == 200 and r.json()["section"] == "T"
    assert (library_dir / "M" / "T" / "Again.chalk").is_file()


def test_copied_file_gets_new_id(client, library_dir):
    b = mkpage(client, "A", "N", "S")
    src = library_dir / "N" / "S" / "A.chalk"
    (library_dir / "N" / "S" / "B copy.chalk").write_bytes(src.read_bytes())
    pages = client.get("/api/library").json()["notebooks"][0]["sections"][0]["pages"]
    assert [p["name"] for p in pages] == ["A", "B copy"]
    assert pages[0]["id"] == b["id"]  # first in sorted order keeps the id
    assert pages[1]["id"] != b["id"]
    assert json.loads((library_dir / "N" / "S" / "B copy.chalk").read_text())["id"] == pages[1]["id"]
    # stable on the next scan
    again = client.get("/api/library").json()["notebooks"][0]["sections"][0]["pages"]
    assert [p["id"] for p in again] == [p["id"] for p in pages]


def test_garbage_files_ignored_and_untouched(client, library_dir):
    mkpage(client, "ok", "N", "S")
    sec = library_dir / "N" / "S"
    (sec / "bad.chalk").write_text("{not json", encoding="utf-8")
    (sec / "wrongtype.chalk").write_text('{"type":"other","scene":{}}', encoding="utf-8")
    (sec / "notes.txt").write_text("hi")
    (library_dir / "loose.chalk").write_text("{}")
    pages = client.get("/api/library").json()["notebooks"][0]["sections"][0]["pages"]
    assert [p["name"] for p in pages] == ["ok"]
    assert (sec / "bad.chalk").read_text() == "{not json"
    assert (sec / "wrongtype.chalk").read_text() == '{"type":"other","scene":{}}'
    assert len(client.get("/api/boards").json()) == 1


def test_page_without_id_is_adopted(client, library_dir):
    sec = library_dir / "N" / "S"
    sec.mkdir(parents=True)
    (sec / "Hand.chalk").write_text(
        json.dumps({"type": "chalk/page", "scene": {"type": "chalk/scene", "version": 2, "elements": []}}),
        encoding="utf-8",
    )
    (page,) = client.get("/api/boards").json()
    assert page["version"] == 1 and page["name"] == "Hand"
    data = json.loads((sec / "Hand.chalk").read_text())
    assert data["id"] == page["id"] and data["version"] == 1 and data["createdAt"].endswith("Z")
    assert client.get(f"/api/boards/{page['id']}").status_code == 200


def test_no_temp_files_left_behind(client, library_dir, scene_with):
    b = mkpage(client, "T", "N", "S")
    for i in range(3):
        client.put(f"/api/boards/{b['id']}", json={"scene": scene_with(str(i))})
    assert files(library_dir) == ["N/S/T.chalk"]


# --- conflict semantics -------------------------------------------------------------------


def test_store_conflict_and_notfound(store):
    b = store.create("n", EMPTY)
    with pytest.raises(NotFoundError):
        store.update("nothere", name="x", scene=None, base_version=None)
    with pytest.raises(ConflictError) as ei:
        store.update(b["id"], name="x", scene=None, base_version=5)
    assert ei.value.current_version == 1
    assert store.update(b["id"], name="x", scene=None, base_version=1)["version"] == 2
    assert store.delete(b["id"]) is True
    assert store.delete(b["id"]) is False
    assert store.get(b["id"]) is None


def test_store_persists_across_instances(library_dir, scene_with):
    a = LibraryStore(str(library_dir))
    a.init()
    created = a.create("Persist", scene_with("p"))
    b = LibraryStore(str(library_dir))
    b.init()
    got = b.get(created["id"])
    assert got is not None and got["scene"] == scene_with("p")
    assert [x["id"] for x in b.list()] == [created["id"]]


def test_conflict_over_http_after_external_edit(client, library_dir):
    b = mkpage(client, "C", "N", "S")
    path = library_dir / "N" / "S" / "C.chalk"
    data = json.loads(path.read_text())
    data["version"] = 7
    path.write_text(json.dumps(data), encoding="utf-8")
    r = client.put(f"/api/boards/{b['id']}", json={"name": "z", "baseVersion": 1})
    assert r.status_code == 409
    assert r.json() == {"detail": {"message": "Version conflict", "currentVersion": 7}}


# --- legacy import ----------------------------------------------------------------------------


def make_legacy(path: Path, wal: bool = False) -> None:
    conn = sqlite3.connect(path)
    if wal:
        conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(
        """CREATE TABLE boards (id TEXT PRIMARY KEY, name TEXT NOT NULL, scene TEXT NOT NULL,
           version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);"""
    )
    scene = json.dumps({"type": "chalk/scene", "version": 1, "elements": [{"id": "e1"}]})
    rows = [
        ("legacyid001", "Old plan", scene, 4, "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z"),
        ("legacyid002", "Old plan", scene, 1, "2026-01-03T00:00:00.000Z", "2026-01-03T00:00:00.000Z"),
        ("legacyid003", "a/b?", scene, 2, "2026-01-04T00:00:00.000Z", "2026-01-05T00:00:00.000Z"),
    ]
    conn.executemany("INSERT INTO boards VALUES (?,?,?,?,?,?)", rows)
    conn.commit()
    conn.close()


@pytest.mark.parametrize("wal", [False, True])
def test_legacy_import(tmp_path, wal):
    db = tmp_path / "chalk.db"
    make_legacy(db, wal)
    before = db.read_bytes()
    lib = tmp_path / "lib"
    with TestClient(create_app(library_dir=str(lib), static_dir="", db_path=str(db))) as c:
        board = c.get("/api/boards/legacyid001").json()
        assert (board["notebook"], board["section"], board["name"]) == ("Imported", "Boards", "Old plan")
        assert board["version"] == 4
        assert board["createdAt"] == "2026-01-01T00:00:00.000Z"
        assert board["updatedAt"] == "2026-01-02T00:00:00.000Z"
        assert board["scene"]["elements"] == [{"id": "e1"}]
        assert c.get("/api/boards/legacyid002").json()["name"] == "Old plan (2)"
        assert c.get("/api/boards/legacyid003").json()["name"] == "a-b-"
        assert len(c.get("/api/boards").json()) == 3
    assert (lib / ".chalk" / "legacy-imported").is_file()
    assert db.read_bytes() == before  # never touches the DB (tolerate nothing)


def test_legacy_import_is_idempotent(tmp_path):
    db = tmp_path / "chalk.db"
    make_legacy(db)
    lib = tmp_path / "lib"
    with TestClient(create_app(library_dir=str(lib), static_dir="", db_path=str(db))) as c:
        c.delete("/api/boards/legacyid001")
    with TestClient(create_app(library_dir=str(lib), static_dir="", db_path=str(db))) as c:
        assert c.get("/api/boards/legacyid001").status_code == 404  # marker: not re-imported
        assert len(c.get("/api/boards").json()) == 2


def test_legacy_import_resumes_without_marker(tmp_path):
    db = tmp_path / "chalk.db"
    make_legacy(db)
    lib = tmp_path / "lib"
    create_app(library_dir=str(lib), static_dir="", db_path=str(db))
    (lib / ".chalk" / "legacy-imported").unlink()
    with TestClient(create_app(library_dir=str(lib), static_dir="", db_path=str(db))) as c:
        assert len(c.get("/api/boards").json()) == 3  # no duplicates


def test_no_legacy_db_no_import(tmp_path):
    lib = tmp_path / "lib"
    with TestClient(create_app(library_dir=str(lib), static_dir="", db_path=str(tmp_path / "missing.db"))) as c:
        assert c.get("/api/library").json()["notebooks"] == []
    assert not (lib / ".chalk" / "legacy-imported").exists()


def test_broken_legacy_db_does_not_block_startup(tmp_path):
    db = tmp_path / "chalk.db"
    db.write_text("not a database")
    lib = tmp_path / "lib"
    with TestClient(create_app(library_dir=str(lib), static_dir="", db_path=str(db))) as c:
        assert c.get("/api/health").status_code == 200
    assert not (lib / ".chalk" / "legacy-imported").exists()
