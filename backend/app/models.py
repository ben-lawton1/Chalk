"""Chalk HTTP API contract (pydantic v2).

FROZEN after WP0. Only the integration package (WP6) may edit this file.

Field names are camelCase on purpose so they match the JSON wire format
exactly, with no alias machinery. Scene *elements* are opaque JSON: the
backend validates only the envelope ({type, version, elements}) and the size,
so the frontend element schema can evolve without backend changes.

baseVersion semantics (BoardUpdate): an integer means a checked write
(409 when it differs from the stored version); omitted or null means a
forced overwrite.
"""

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

SCENE_TYPE = "chalk/scene"
SCENE_VERSION = 1
MAX_SCENE_BYTES = 10_000_000
DEFAULT_BOARD_NAME = "Untitled board"
MAX_NAME_LENGTH = 120
BOARD_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,64}$")


def empty_scene() -> dict[str, Any]:
    """Return a fresh empty scene document."""
    return {"type": SCENE_TYPE, "version": SCENE_VERSION, "elements": []}


def check_scene(value: dict[str, Any] | None) -> dict[str, Any] | None:
    """Validate the scene envelope only. Elements stay opaque."""
    if value is None:
        return None
    version = value.get("version")
    if (
        value.get("type") != SCENE_TYPE
        or not isinstance(version, int)
        or isinstance(version, bool)
        or version < 1
        or not isinstance(value.get("elements"), list)
    ):
        raise ValueError("scene must be a chalk/scene document")
    return value


def clean_name(value: str | None) -> str | None:
    """Strip a board name; reject names that are blank after stripping."""
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        raise ValueError("name must not be blank")
    return stripped


class Health(BaseModel):
    status: Literal["ok"]


class BoardSummary(BaseModel):
    id: str
    name: str
    version: int
    updatedAt: str


class Board(BoardSummary):
    scene: dict[str, Any]
    createdAt: str


class ConflictDetail(BaseModel):
    message: Literal["Version conflict"]
    currentVersion: int


class BoardCreate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=MAX_NAME_LENGTH)
    scene: dict[str, Any] | None = None

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        return clean_name(value)

    @field_validator("scene")
    @classmethod
    def _check_scene(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return check_scene(value)


class BoardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=MAX_NAME_LENGTH)
    scene: dict[str, Any] | None = None
    baseVersion: int | None = None

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        return clean_name(value)

    @field_validator("scene")
    @classmethod
    def _check_scene(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return check_scene(value)
