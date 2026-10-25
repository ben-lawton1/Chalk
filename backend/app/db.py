"""SQLite BoardStore: one short-lived connection per call, schema in init() (WP5)."""

import json
import os
import secrets
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scene TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS boards_updated_idx ON boards(updated_at DESC);
"""

SCHEMA_VERSION = 1


class NotFoundError(Exception):
    """The board id does not exist."""


class ConflictError(Exception):
    """A checked write used a stale baseVersion."""

    def __init__(self, current_version: int) -> None:
        super().__init__(f"version conflict (current version {current_version})")
        self.current_version = current_version


def now_iso() -> str:
    """UTC timestamp, ISO-8601 with milliseconds and a trailing Z."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def compact_json(value: Any) -> str:
    """Compact JSON, used both for storage and for the size check."""
    return json.dumps(value, separators=(",", ":"))


def _summary(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "version": row["version"],
        "updatedAt": row["updated_at"],
    }


def _board(row: sqlite3.Row) -> dict[str, Any]:
    return {**_summary(row), "scene": json.loads(row["scene"]), "createdAt": row["created_at"]}


class BoardStore:
    """Boards table access. Safe to use from many threads (no shared connection)."""

    def __init__(self, path: str) -> None:
        self.path = path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=5)
        conn.row_factory = sqlite3.Row
        return conn

    def init(self) -> None:
        """Create the parent directory and the schema (idempotent)."""
        parent = os.path.dirname(os.path.abspath(self.path))
        os.makedirs(parent, exist_ok=True)
        with closing(self._connect()) as conn, conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)
            conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    def list(self) -> list[dict[str, Any]]:
        """All boards as summaries, most recently updated first."""
        with closing(self._connect()) as conn, conn:
            rows = conn.execute(
                "SELECT id, name, version, updated_at FROM boards ORDER BY updated_at DESC, rowid DESC"
            ).fetchall()
        return [_summary(r) for r in rows]

    def get(self, board_id: str) -> dict[str, Any] | None:
        """One board with its parsed scene, or None."""
        with closing(self._connect()) as conn, conn:
            row = conn.execute("SELECT * FROM boards WHERE id = ?", (board_id,)).fetchone()
        return _board(row) if row else None

    def create(self, name: str, scene: dict[str, Any]) -> dict[str, Any]:
        """Insert a new board at version 1 and return it."""
        stamp = now_iso()
        payload = compact_json(scene)
        with closing(self._connect()) as conn, conn:
            while True:
                board_id = secrets.token_urlsafe(8)
                try:
                    conn.execute(
                        "INSERT INTO boards (id, name, scene, version, created_at, updated_at)"
                        " VALUES (?, ?, ?, 1, ?, ?)",
                        (board_id, name, payload, stamp, stamp),
                    )
                    break
                except sqlite3.IntegrityError:
                    continue  # id collision: draw another
        return {"id": board_id, "name": name, "version": 1, "updatedAt": stamp, "scene": scene, "createdAt": stamp}

    def update(
        self,
        board_id: str,
        *,
        name: str | None,
        scene: dict[str, Any] | None,
        base_version: int | None,
    ) -> dict[str, Any]:
        """Apply a (checked when base_version is an int) update; returns the new summary."""
        sets: list[str] = []
        args: list[Any] = []
        if name is not None:
            sets.append("name = ?")
            args.append(name)
        if scene is not None:
            sets.append("scene = ?")
            args.append(compact_json(scene))
        sets += ["version = version + 1", "updated_at = ?"]
        args.append(now_iso())
        where = "id = ?"
        args.append(board_id)
        if base_version is not None:
            where += " AND version = ?"
            args.append(base_version)
        with closing(self._connect()) as conn, conn:
            cur = conn.execute(f"UPDATE boards SET {', '.join(sets)} WHERE {where}", args)
            if cur.rowcount == 0:
                row = conn.execute("SELECT version FROM boards WHERE id = ?", (board_id,)).fetchone()
                if row is None:
                    raise NotFoundError(board_id)
                raise ConflictError(row[0])
            row = conn.execute(
                "SELECT id, name, version, updated_at FROM boards WHERE id = ?", (board_id,)
            ).fetchone()
        return _summary(row)

    def delete(self, board_id: str) -> bool:
        """Delete a board; True when a row was removed."""
        with closing(self._connect()) as conn, conn:
            cur = conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))
            return cur.rowcount > 0
