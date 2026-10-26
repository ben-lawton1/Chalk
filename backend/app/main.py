"""Chalk app factory: API router, /api 404 catch-all, cache headers and the SPA static mount (WP5)."""

import logging
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles

from app.db import read_legacy_boards
from app.library import LibraryStore
from app.routes import router


log = logging.getLogger("chalk.main")


def create_app(library_dir: str | None = None, static_dir: str | None = None, db_path: str | None = None) -> FastAPI:
    """Build the FastAPI app. An empty/absent/empty-directory `static_dir` mounts no SPA.

    `db_path` is only the legacy v1 SQLite file, imported once into the library when present.
    """
    if library_dir is None:
        library_dir = os.environ.get("CHALK_LIBRARY_DIR", "/library")
        label = os.environ.get("CHALK_LIBRARY_LABEL") or library_dir
    else:
        label = library_dir
    db_path = db_path if db_path is not None else os.environ.get("CHALK_DB_PATH", "")
    static_dir = static_dir if static_dir is not None else os.environ.get("CHALK_STATIC_DIR", "/app/static")
    app = FastAPI(title="Chalk", version="0.2.0")
    store = LibraryStore(library_dir, label)
    store.init()
    if db_path and os.path.isfile(db_path):
        try:
            count = store.import_legacy(read_legacy_boards(db_path))
            if count:
                log.info("imported %d legacy board(s) from %s", count, db_path)
        except Exception:  # never block startup; the import retries next start
            log.exception("legacy import failed")
    app.state.store = store
    app.include_router(router)

    @app.api_route(
        "/api/{rest:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
        include_in_schema=False,
    )
    def api_not_found(rest: str) -> None:
        raise HTTPException(status_code=404, detail="Not found")

    @app.middleware("http")
    async def cache_headers(request: Request, call_next):
        """Never cache HTML; cache hashed assets forever."""
        response = await call_next(request)
        path = request.url.path
        if not path.startswith("/api"):
            if path == "/" or path.endswith(".html"):
                response.headers["Cache-Control"] = "no-cache"
            elif path.startswith("/assets/"):
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response

    if static_dir and os.path.isdir(static_dir) and os.listdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="spa")
    return app


app = create_app()
