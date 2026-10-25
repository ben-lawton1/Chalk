"""Chalk app factory: API router, /api 404 catch-all, cache headers and the SPA static mount (WP5)."""

import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles

from app.db import BoardStore
from app.routes import router


def create_app(db_path: str | None = None, static_dir: str | None = None) -> FastAPI:
    """Build the FastAPI app. An empty/absent/empty-directory `static_dir` mounts no SPA."""
    db_path = db_path or os.environ.get("CHALK_DB_PATH", "/data/chalk.db")
    static_dir = static_dir if static_dir is not None else os.environ.get("CHALK_STATIC_DIR", "/app/static")
    app = FastAPI(title="Chalk", version="0.1.0")
    store = BoardStore(db_path)
    store.init()
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
