"""Legacy v1 SQLite reader: boards are imported once into the file library (v2-A). Never writes the DB."""

import json
import logging
import os
import sqlite3
from contextlib import closing
from typing import Any

log = logging.getLogger("chalk.db")


def read_legacy_boards(db_path: str) -> list[dict[str, Any]]:
    """All boards from a v1 chalk.db (read-only), oldest first. Rows with unparseable scenes are skipped."""
    uri = "file:" + os.path.abspath(db_path).replace("\\", "/").replace("?", "%3f").replace("#", "%23") + "?mode=ro"
    out: list[dict[str, Any]] = []
    with closing(sqlite3.connect(uri, uri=True, timeout=5)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, name, scene, version, created_at, updated_at FROM boards ORDER BY created_at, rowid"
        ).fetchall()
    for r in rows:
        try:
            scene = json.loads(r["scene"])
        except ValueError:
            log.warning("skipping legacy board %s: unparseable scene", r["id"])
            continue
        out.append(
            {
                "id": r["id"],
                "name": r["name"],
                "scene": scene,
                "version": r["version"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
        )
    return out
