"""File-backed page library: notebook dirs > section dirs > `<name>.chalk` page files (v2-A).

The folder tree is the source of truth and the user may rename or copy files in
Explorer at any time, so listings always rescan; only parsed page headers are
cached (keyed by path, mtime and size). Deletes move to `<root>/.chalk/trash`.
"""

import json
import logging
import os
import re
import secrets
import shutil
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable

from app.models import BOARD_ID_RE, MAX_NAME_LENGTH

log = logging.getLogger("chalk.library")

PAGE_TYPE = "chalk/page"
PAGE_FORMAT_VERSION = 1
PAGE_EXT = ".chalk"
META_DIR = ".chalk"
DEFAULT_NOTEBOOK = "My Notebook"
DEFAULT_SECTION = "Quick Notes"
DEFAULT_PAGE_NAME = "Untitled page"
LEGACY_NOTEBOOK = "Imported"
LEGACY_SECTION = "Boards"
LEGACY_MARKER = "legacy-imported"

_BAD_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f\x7f]')
_RESERVED = re.compile(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$", re.IGNORECASE)


class NotFoundError(Exception):
    """The board, notebook or section does not exist."""


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


def safe_name(raw: str) -> str:
    """A file-system-safe name for a notebook, section or page; ValueError when nothing is left."""
    s = _BAD_CHARS.sub("-", raw.strip()).lstrip(". ").rstrip(". ")
    s = s[:MAX_NAME_LENGTH].rstrip(". ")
    if not s:
        raise ValueError("Invalid name")
    if _RESERVED.match(s):
        s += "_"
    return s


def _natural_key(name: str) -> list[Any]:
    return [int(t) if i % 2 else t for i, t in enumerate(re.split(r"(\d+)", name.casefold()))]


def _retry(fn: Callable[..., Any], *args: Any) -> Any:
    """Run a rename/replace, retrying briefly on PermissionError (OneDrive can lock files)."""
    for attempt in range(5):
        try:
            return fn(*args)
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.05)


def _write_json(path: str, value: Any) -> None:
    """Atomic write: temp file in the same dir, then replace."""
    directory, base = os.path.split(path)
    tmp = os.path.join(directory, f".{os.path.splitext(base)[0]}.tmp-{secrets.token_hex(4)}")
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(compact_json(value))
    try:
        _retry(os.replace, tmp, path)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def _iso_from_mtime(st: os.stat_result) -> str:
    return datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _read_page(path: str) -> dict[str, Any] | None:
    """Parse a page file; None when unreadable or not a chalk/page."""
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError) as exc:
        log.warning("skipping unreadable page %s: %s", path, exc)
        return None
    if not isinstance(data, dict) or data.get("type") != PAGE_TYPE or not isinstance(data.get("scene"), dict):
        log.warning("skipping %s: not a chalk/page file", path)
        return None
    return data


def _page_doc(board_id: str, version: int, created: str, updated: str, scene: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": PAGE_TYPE,
        "formatVersion": PAGE_FORMAT_VERSION,
        "id": board_id,
        "version": version,
        "createdAt": created,
        "updatedAt": updated,
        "scene": scene,
    }


class LibraryStore:
    """The page library rooted at one host folder. Thread-safe via one RLock."""

    def __init__(self, root: str, label: str | None = None) -> None:
        self.root = os.path.abspath(root)
        self.label = label or root
        self.trash_dir = os.path.join(self.root, META_DIR, "trash")
        self._lock = threading.RLock()
        self._index: dict[str, str] = {}
        self._cache: dict[str, tuple[tuple[int, int], dict[str, Any] | None]] = {}

    def init(self) -> None:
        """Create the root and the trash dir (idempotent)."""
        os.makedirs(self.trash_dir, exist_ok=True)

    # ---- scanning -------------------------------------------------------

    @staticmethod
    def _subdirs(parent: str) -> list[tuple[str, str]]:
        """Visible subdirectories of `parent` as (name, path), naturally sorted."""
        try:
            with os.scandir(parent) as it:
                found = [(e.name, e.path) for e in it if not e.name.startswith(".") and e.is_dir()]
        except OSError:
            return []
        return sorted(found, key=lambda t: _natural_key(t[0]))

    def _meta(self, path: str, st: os.stat_result) -> dict[str, Any] | None:
        """Cached header of a page file (id, version, timestamps), repairing missing fields."""
        key = (st.st_mtime_ns, st.st_size)
        hit = self._cache.get(path)
        if hit and hit[0] == key:
            return hit[1]
        meta: dict[str, Any] | None = None
        data = _read_page(path)
        if data is not None:
            fixed = False
            if not isinstance(data.get("id"), str) or not BOARD_ID_RE.match(data["id"]):
                data["id"] = secrets.token_urlsafe(8)
                fixed = True
            version = data.get("version")
            if not isinstance(version, int) or isinstance(version, bool) or version < 1:
                data["version"] = 1
                fixed = True
            for field in ("createdAt", "updatedAt"):
                if not isinstance(data.get(field), str):
                    data[field] = _iso_from_mtime(st)
                    fixed = True
            data.setdefault("formatVersion", PAGE_FORMAT_VERSION)
            if fixed:
                try:
                    _write_json(path, data)
                    st = os.stat(path)
                except OSError as exc:
                    log.warning("could not repair %s: %s", path, exc)
            meta = {k: data[k] for k in ("id", "version", "createdAt", "updatedAt")}
            key = (st.st_mtime_ns, st.st_size)
        self._cache[path] = (key, meta)
        return meta

    def _reassign_id(self, path: str) -> dict[str, Any] | None:
        """Give a copied page a fresh id (the first path in sorted order keeps the original)."""
        data = _read_page(path)
        if data is None:
            return None
        data["id"] = secrets.token_urlsafe(8)
        _write_json(path, data)
        self._cache.pop(path, None)
        return self._meta(path, os.stat(path))

    def _scan(self) -> list[dict[str, Any]]:
        """Walk the tree, rebuild the id index; returns notebooks > sections > page summaries."""
        with self._lock:
            index: dict[str, str] = {}
            seen: dict[str, tuple[tuple[int, int], dict[str, Any] | None]] = {}
            notebooks: list[dict[str, Any]] = []
            for nb_name, nb_path in self._subdirs(self.root):
                sections = []
                for sec_name, sec_path in self._subdirs(nb_path):
                    pages = []
                    try:
                        with os.scandir(sec_path) as it:
                            files = [
                                e
                                for e in it
                                if not e.name.startswith(".") and e.name.lower().endswith(PAGE_EXT) and e.is_file()
                            ]
                    except OSError:
                        files = []
                    files.sort(key=lambda e: _natural_key(e.name[: -len(PAGE_EXT)]))
                    for entry in files:
                        try:
                            meta = self._meta(entry.path, entry.stat())
                            if meta is not None and meta["id"] in index:
                                meta = self._reassign_id(entry.path)
                        except OSError as exc:
                            log.warning("skipping %s: %s", entry.path, exc)
                            continue
                        if meta is None:
                            continue
                        seen[entry.path] = self._cache[entry.path]
                        index[meta["id"]] = entry.path
                        pages.append(
                            {
                                "id": meta["id"],
                                "name": entry.name[: -len(PAGE_EXT)],
                                "version": meta["version"],
                                "updatedAt": meta["updatedAt"],
                                "notebook": nb_name,
                                "section": sec_name,
                            }
                        )
                    sections.append({"name": sec_name, "pages": pages})
                notebooks.append({"name": nb_name, "sections": sections})
            self._index = index
            for path, entry_ in self._cache.items():  # keep negative entries for unchanged junk files
                if path not in seen and os.path.isfile(path):
                    seen[path] = entry_
            self._cache = seen
            return notebooks

    def _load_by_id(self, board_id: str) -> tuple[str, dict[str, Any]] | None:
        """(path, parsed file) for an id, rescanning once when the index is stale."""
        with self._lock:
            for attempt in (0, 1):
                path = self._index.get(board_id)
                if path and os.path.isfile(path):
                    data = _read_page(path)
                    if data is not None and data.get("id") == board_id:
                        return path, data
                if attempt == 0:
                    self._scan()
            return None

    def _location(self, path: str) -> tuple[str, str]:
        parts = os.path.relpath(path, self.root).split(os.sep)
        return parts[0], parts[1]

    def _summary(self, path: str, data: dict[str, Any]) -> dict[str, Any]:
        nb, sec = self._location(path)
        return {
            "id": data["id"],
            "name": os.path.basename(path)[: -len(PAGE_EXT)],
            "version": data["version"],
            "updatedAt": data["updatedAt"],
            "notebook": nb,
            "section": sec,
        }

    def _board(self, path: str, data: dict[str, Any]) -> dict[str, Any]:
        return {**self._summary(path, data), "scene": data["scene"], "createdAt": data["createdAt"]}

    # ---- names ----------------------------------------------------------

    @staticmethod
    def _unique(parent: str, base: str, suffix: str = "", exclude: str | None = None) -> str:
        """`base`, else `base (2)`... free in `parent`, comparing case-insensitively."""
        try:
            taken = {n.casefold() for n in os.listdir(parent)}
        except OSError:
            taken = set()
        if exclude:
            taken.discard(exclude.casefold())
        candidate, n = base, 2
        while (candidate + suffix).casefold() in taken:
            candidate = f"{base} ({n})"
            n += 1
        return candidate

    def _find_dir(self, parent: str, raw: str) -> str | None:
        subdirs = self._subdirs(parent)
        for name, path in subdirs:
            if name == raw:
                return path
        for name, path in subdirs:
            if name.casefold() == raw.casefold():
                return path
        return None

    def _ensure_dir(self, parent: str, raw: str) -> str:
        name = safe_name(raw)
        found = self._find_dir(parent, name)
        if found:
            return found
        path = os.path.join(parent, name)
        os.makedirs(path, exist_ok=True)
        return path

    def _notebook_path(self, name: str) -> str:
        path = self._find_dir(self.root, name)
        if path is None:
            raise NotFoundError("Notebook not found")
        return path

    def _section_path(self, notebook: str, name: str) -> str:
        path = self._find_dir(self._notebook_path(notebook), name)
        if path is None:
            raise NotFoundError("Section not found")
        return path

    def _trash(self, path: str, label: str) -> None:
        """Move a file or directory into the trash, never overwriting."""
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        os.makedirs(self.trash_dir, exist_ok=True)
        dest = os.path.join(self.trash_dir, f"{stamp}-{label}")
        n = 2
        while os.path.exists(dest):
            dest = os.path.join(self.trash_dir, f"{stamp}-{label}-{n}")
            n += 1
        _retry(shutil.move, path, dest)

    def _move_dir(self, path: str, new: str) -> str:
        parent, old = os.path.split(path)
        target = safe_name(new)
        if target == old:
            return old
        final = self._unique(parent, target, exclude=old)
        if final != old:
            _retry(os.rename, path, os.path.join(parent, final))
        return final

    # ---- queries ----------------------------------------------------------

    def tree(self) -> dict[str, Any]:
        return {"path": self.label, "notebooks": self._scan()}

    def list(self) -> list[dict[str, Any]]:
        pages = [p for nb in self._scan() for sec in nb["sections"] for p in sec["pages"]]
        pages.sort(key=lambda p: p["updatedAt"], reverse=True)
        return pages

    def get(self, board_id: str) -> dict[str, Any] | None:
        found = self._load_by_id(board_id)
        return self._board(*found) if found else None

    # ---- page writes --------------------------------------------------------

    def _default_location(self) -> tuple[str, str]:
        notebooks = self._subdirs(self.root)
        nb_path = notebooks[0][1] if notebooks else self._ensure_dir(self.root, DEFAULT_NOTEBOOK)
        sections = self._subdirs(nb_path)
        sec_path = sections[0][1] if sections else self._ensure_dir(nb_path, DEFAULT_SECTION)
        return nb_path, sec_path

    def create(
        self, name: str, scene: dict[str, Any], notebook: str | None = None, section: str | None = None
    ) -> dict[str, Any]:
        with self._lock:
            if notebook is None or section is None:
                _, sec_path = self._default_location()
            else:
                sec_path = self._ensure_dir(self._ensure_dir(self.root, notebook), section)
            stem = self._unique(sec_path, safe_name(name), PAGE_EXT)
            path = os.path.join(sec_path, stem + PAGE_EXT)
            stamp = now_iso()
            board_id = secrets.token_urlsafe(8)
            while board_id in self._index:
                board_id = secrets.token_urlsafe(8)
            data = _page_doc(board_id, 1, stamp, stamp, scene)
            _write_json(path, data)
            self._index[board_id] = path
            return self._board(path, data)

    def update(
        self, board_id: str, *, name: str | None, scene: dict[str, Any] | None, base_version: int | None
    ) -> dict[str, Any]:
        """Apply a (checked when base_version is an int) update; returns the new summary."""
        with self._lock:
            found = self._load_by_id(board_id)
            if found is None:
                raise NotFoundError("Board not found")
            path, data = found
            if base_version is not None and data["version"] != base_version:
                raise ConflictError(data["version"])
            target = safe_name(name) if name is not None else None
            data["version"] += 1
            data["updatedAt"] = now_iso()
            if scene is not None:
                data["scene"] = scene
            _write_json(path, data)
            if target is not None:
                directory, base = os.path.split(path)
                old = base[: -len(PAGE_EXT)]
                if target != old:
                    final = self._unique(directory, target, PAGE_EXT, exclude=base)
                    if final != old:
                        new_path = os.path.join(directory, final + PAGE_EXT)
                        try:
                            _retry(os.rename, path, new_path)
                            path = new_path
                            self._index[board_id] = path
                        except OSError as exc:
                            log.warning("could not rename %s: %s", path, exc)
            return self._summary(path, data)

    def delete(self, board_id: str) -> bool:
        with self._lock:
            found = self._load_by_id(board_id)
            if found is None:
                return False
            path = found[0]
            nb, sec = self._location(path)
            self._trash(path, f"{nb}-{sec}-{os.path.basename(path)}")
            self._index.pop(board_id, None)
            return True

    # ---- notebooks / sections -------------------------------------------------

    def create_notebook(self, name: str) -> dict[str, str]:
        with self._lock:
            final = self._unique(self.root, safe_name(name))
            os.makedirs(os.path.join(self.root, final))
            return {"name": final}

    def rename_notebook(self, old: str, new: str) -> dict[str, str]:
        with self._lock:
            return {"name": self._move_dir(self._notebook_path(old), new)}

    def delete_notebook(self, name: str) -> None:
        with self._lock:
            path = self._notebook_path(name)
            self._trash(path, os.path.basename(path))

    def create_section(self, notebook: str, name: str) -> dict[str, str]:
        with self._lock:
            parent = self._notebook_path(notebook)
            final = self._unique(parent, safe_name(name))
            os.makedirs(os.path.join(parent, final))
            return {"name": final}

    def rename_section(self, notebook: str, old: str, new: str) -> dict[str, str]:
        with self._lock:
            return {"name": self._move_dir(self._section_path(notebook, old), new)}

    def delete_section(self, notebook: str, name: str) -> None:
        with self._lock:
            path = self._section_path(notebook, name)
            self._trash(path, f"{os.path.basename(os.path.dirname(path))}-{os.path.basename(path)}")

    # ---- legacy SQLite import ---------------------------------------------------

    def import_legacy(self, boards: list[dict[str, Any]]) -> int:
        """One-time import of v1 SQLite boards into Imported/Boards, keeping ids, versions and timestamps."""
        with self._lock:
            marker = os.path.join(self.root, META_DIR, LEGACY_MARKER)
            if os.path.exists(marker):
                return 0
            self._scan()
            count = 0
            if boards:
                sec_path = self._ensure_dir(self._ensure_dir(self.root, LEGACY_NOTEBOOK), LEGACY_SECTION)
                for b in boards:
                    if b["id"] in self._index:
                        continue  # a previous run died before writing the marker
                    try:
                        base = safe_name(b["name"])
                    except ValueError:
                        base = DEFAULT_PAGE_NAME
                    path = os.path.join(sec_path, self._unique(sec_path, base, PAGE_EXT) + PAGE_EXT)
                    _write_json(path, _page_doc(b["id"], b["version"], b["created_at"], b["updated_at"], b["scene"]))
                    self._index[b["id"]] = path
                    count += 1
            os.makedirs(os.path.dirname(marker), exist_ok=True)
            with open(marker, "w", encoding="utf-8") as f:
                f.write(f"{now_iso()} imported {count} board(s)\n")
            return count
