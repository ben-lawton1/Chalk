"""HTTP routes under /api: health, board CRUD and the notebook/section library (v2-A)."""

import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.library import ConflictError, LibraryStore, NotFoundError, compact_json
from app.models import (
    BOARD_ID_RE,
    DEFAULT_BOARD_NAME,
    MAX_SCENE_BYTES,
    AppConfig,
    Board,
    BoardCreate,
    BoardSummary,
    BoardUpdate,
    FolderCreate,
    FolderInfo,
    FolderRename,
    Health,
    LibraryTree,
    empty_scene,
)

DEFAULT_TERMINAL_URL = "http://127.0.0.1:7681"

router = APIRouter(prefix="/api")


def get_store(request: Request) -> LibraryStore:
    """Dependency: the LibraryStore that create_app attached to app.state."""
    return request.app.state.store


@contextmanager
def _errors() -> Iterator[None]:
    """Map store errors onto HTTP errors."""
    try:
        yield
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    except ConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail={"message": "Version conflict", "currentVersion": exc.current_version},
        ) from None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid name") from None


def _check_id(board_id: str) -> None:
    if not BOARD_ID_RE.match(board_id):
        raise HTTPException(status_code=404, detail="Board not found")


def _check_size(scene: dict[str, Any] | None) -> None:
    if scene is not None and len(compact_json(scene)) > MAX_SCENE_BYTES:
        raise HTTPException(status_code=413, detail="Scene too large")


@router.get("/health", response_model=Health)
def health() -> Health:
    return Health(status="ok")


@router.get("/config", response_model=AppConfig)
def get_config() -> AppConfig:
    return AppConfig(terminalUrl=os.environ.get("CHALK_TERMINAL_URL") or DEFAULT_TERMINAL_URL)


@router.get("/library", response_model=LibraryTree)
def get_library(store: LibraryStore = Depends(get_store)) -> dict[str, Any]:
    return store.tree()


@router.get("/boards", response_model=list[BoardSummary])
def list_boards(store: LibraryStore = Depends(get_store)) -> list[dict[str, Any]]:
    return store.list()


@router.post("/boards", response_model=Board, status_code=201)
def create_board(body: BoardCreate, store: LibraryStore = Depends(get_store)) -> dict[str, Any]:
    if (body.notebook is None) != (body.section is None):
        raise HTTPException(status_code=400, detail="notebook and section must be given together")
    _check_size(body.scene)
    with _errors():
        return store.create(
            body.name or DEFAULT_BOARD_NAME,
            body.scene if body.scene is not None else empty_scene(),
            body.notebook,
            body.section,
        )


@router.get("/boards/{board_id}", response_model=Board)
def get_board(board_id: str, store: LibraryStore = Depends(get_store)) -> dict[str, Any]:
    _check_id(board_id)
    board = store.get(board_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


@router.put("/boards/{board_id}", response_model=BoardSummary)
def update_board(board_id: str, body: BoardUpdate, store: LibraryStore = Depends(get_store)) -> dict[str, Any]:
    _check_id(board_id)
    if body.name is None and body.scene is None:
        raise HTTPException(status_code=400, detail="Nothing to update")
    _check_size(body.scene)
    with _errors():
        return store.update(board_id, name=body.name, scene=body.scene, base_version=body.baseVersion)


@router.delete("/boards/{board_id}", status_code=204)
def delete_board(board_id: str, store: LibraryStore = Depends(get_store)) -> Response:
    _check_id(board_id)
    if not store.delete(board_id):
        raise HTTPException(status_code=404, detail="Board not found")
    return Response(status_code=204)


@router.post("/notebooks", response_model=FolderInfo, status_code=201)
def create_notebook(body: FolderCreate, store: LibraryStore = Depends(get_store)) -> dict[str, str]:
    with _errors():
        return store.create_notebook(body.name)


@router.put("/notebooks/{notebook}", response_model=FolderInfo)
def rename_notebook(notebook: str, body: FolderRename, store: LibraryStore = Depends(get_store)) -> dict[str, str]:
    with _errors():
        return store.rename_notebook(notebook, body.name)


@router.delete("/notebooks/{notebook}", status_code=204)
def delete_notebook(notebook: str, store: LibraryStore = Depends(get_store)) -> Response:
    with _errors():
        store.delete_notebook(notebook)
    return Response(status_code=204)


@router.post("/notebooks/{notebook}/sections", response_model=FolderInfo, status_code=201)
def create_section(notebook: str, body: FolderCreate, store: LibraryStore = Depends(get_store)) -> dict[str, str]:
    with _errors():
        return store.create_section(notebook, body.name)


@router.put("/notebooks/{notebook}/sections/{section}", response_model=FolderInfo)
def rename_section(
    notebook: str, section: str, body: FolderRename, store: LibraryStore = Depends(get_store)
) -> dict[str, str]:
    with _errors():
        return store.rename_section(notebook, section, body.name)


@router.delete("/notebooks/{notebook}/sections/{section}", status_code=204)
def delete_section(notebook: str, section: str, store: LibraryStore = Depends(get_store)) -> Response:
    with _errors():
        store.delete_section(notebook, section)
    return Response(status_code=204)
