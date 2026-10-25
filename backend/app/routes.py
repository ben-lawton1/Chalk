"""HTTP routes under /api: health and board CRUD (WP5)."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.db import BoardStore, ConflictError, NotFoundError, compact_json
from app.models import (
    BOARD_ID_RE,
    DEFAULT_BOARD_NAME,
    MAX_SCENE_BYTES,
    Board,
    BoardCreate,
    BoardSummary,
    BoardUpdate,
    Health,
    empty_scene,
)

router = APIRouter(prefix="/api")


def get_store(request: Request) -> BoardStore:
    """Dependency: the BoardStore that create_app attached to app.state."""
    return request.app.state.store


def _check_id(board_id: str) -> None:
    if not BOARD_ID_RE.match(board_id):
        raise HTTPException(status_code=404, detail="Board not found")


def _check_size(scene: dict[str, Any] | None) -> None:
    if scene is not None and len(compact_json(scene)) > MAX_SCENE_BYTES:
        raise HTTPException(status_code=413, detail="Scene too large")


@router.get("/health", response_model=Health)
def health() -> Health:
    return Health(status="ok")


@router.get("/boards", response_model=list[BoardSummary])
def list_boards(store: BoardStore = Depends(get_store)) -> list[dict[str, Any]]:
    return store.list()


@router.post("/boards", response_model=Board, status_code=201)
def create_board(body: BoardCreate, store: BoardStore = Depends(get_store)) -> dict[str, Any]:
    _check_size(body.scene)
    return store.create(body.name or DEFAULT_BOARD_NAME, body.scene if body.scene is not None else empty_scene())


@router.get("/boards/{board_id}", response_model=Board)
def get_board(board_id: str, store: BoardStore = Depends(get_store)) -> dict[str, Any]:
    _check_id(board_id)
    board = store.get(board_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


@router.put("/boards/{board_id}", response_model=BoardSummary)
def update_board(board_id: str, body: BoardUpdate, store: BoardStore = Depends(get_store)) -> dict[str, Any]:
    _check_id(board_id)
    if body.name is None and body.scene is None:
        raise HTTPException(status_code=400, detail="Nothing to update")
    _check_size(body.scene)
    try:
        return store.update(board_id, name=body.name, scene=body.scene, base_version=body.baseVersion)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Board not found") from None
    except ConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail={"message": "Version conflict", "currentVersion": exc.current_version},
        ) from None


@router.delete("/boards/{board_id}", status_code=204)
def delete_board(board_id: str, store: BoardStore = Depends(get_store)) -> Response:
    _check_id(board_id)
    if not store.delete(board_id):
        raise HTTPException(status_code=404, detail="Board not found")
    return Response(status_code=204)
