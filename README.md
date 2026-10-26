# Chalk

> The future of whiteboarding.

Chalk is a small, readable, MIT-licensed whiteboard in the spirit of Excalidraw, organised like OneNote. Pages live in sections inside notebooks, stored as plain files in a folder on your PC. Each page starts in its top-left corner and grows right and down. Drag shapes onto it, type text anywhere, and connect boxes with arrows that stay attached when you move them. The rendering, geometry, arrow binding and text editor are our own code (about 11k lines of TypeScript, tests included, plus a small Python API), so you can read the whole engine in an afternoon and bend it to your own ideas.

Everything runs in Docker. Nothing is installed on your machine: no Node, no Python, no npm packages.

![Chalk: three labelled shapes connected by arrows](docs/screenshot.png)

## Quick start

You need Docker Desktop (or any Docker with Compose v2).

1. Choose where your notebooks live. Copy `.env.example` to `.env` (git-ignored) and set `CHALK_LIBRARY` to a folder on your PC, for example `CHALK_LIBRARY=C:/Users/you/Documents/Chalk`. Without a `.env`, Chalk uses `%USERPROFILE%/Documents/Chalk`. If your Documents folder is redirected into OneDrive, point at the OneDrive path (`C:/Users/you/OneDrive/Documents/Chalk`).
2. From the repository root:

   ```sh
   docker compose up --build
   ```

Then open <http://localhost:8080>. The first build takes a few minutes (`npm ci` plus `vite build`); later builds reuse the cache. Add `-d` to run in the background, and use `docker compose down` to stop it. Your pages stay in the library folder.

Check that the server is up: <http://localhost:8080/api/health> returns `{"status":"ok"}`.

## Features

- **Shapes:** rectangle (sharp or round), diamond, ellipse and triangle, drawn hand-sketched with [rough.js](https://roughjs.com/). Drag them from the toolbar (a dashed, true-size preview follows the pointer), press a tool key and drag, or press a tool key and click to place one at the default size.
- **Select and edit:** click, Shift+click and marquee selection; hollow shapes are selectable from inside. Move (Shift locks the axis), resize with 8 handles (flip, Shift keeps the aspect, Alt resizes from the center), delete, duplicate (Ctrl+D or Alt+drag), copy/cut/paste, z-order and arrow-key nudging.
- **Text anywhere:** double-click the empty canvas, or use the text tool. Double-click a shape to label it; labels wrap, are centered, and the shape grows to fit. Free text can be turned into a fixed-width wrapping box by dragging its side handle.
- **Arrows that connect:** hover a shape to see the binding target, drag from one shape to another and both ends attach. Arrows follow when shapes move, resize or grow, freeze in place if a shape is deleted, and get their bindings back on undo. Shift snaps to 15 degrees, Ctrl avoids connecting, Alt anchors at the exact point. Arrows can carry labels; the line tool draws plain lines.
- **Style:** stroke and background color (palette or custom), fill style, stroke width and style, sloppiness, edges, opacity, font size and family, text alignment and arrowheads. Styles are sticky: they apply to the selection and become the defaults for the next shape.
- **Pages with a home corner:** like a OneNote page, the canvas starts at its top-left corner and extends without limit to the right and down. You can't scroll above or left of it. New pages open at 100% in that corner; `Home` (or the house button) takes you back. Pan with the wheel, Shift+wheel, Space+drag, middle mouse or the hand tool; zoom with Ctrl+wheel, the buttons or the keys; zoom to fit, zoom to selection, and a "Back to content" button.
- **Notebooks, sections and pages:** the left sidebar shows your library as a tree (`Ctrl+\` hides it). Add, rename and delete notebooks, sections and pages from it; deleting needs a second click to confirm. Every page saves automatically, and the view of each page is remembered. If a page is changed somewhere else you get a conflict banner (Reload or Keep mine), and unsaved work is also backed up in the browser and restored after a crash or a lost connection.
- **Pen and touch:** a stylus draws pressure-sensitive ink (the Pen button opens a tray with 3 pens, each with its own colour and size, plus an eraser and a lasso). The pen's eraser button erases and its barrel button lassos, like OneNote. A finger pans, two fingers pinch-zoom, a tap selects and a double tap edits; a resting palm is ignored. See [Pen and touch](#pen-and-touch).
- **Dark theme:** a dark canvas, white strokes by default and a restrained green accent.
- **Undo and redo** for every change, with merged slider and nudge steps.
- **Files:** export and import `.chalk.json`, and export a crisp 2x PNG on the dark page background.

### Pen and touch

Meant for a touchscreen laptop with a stylus (written for a Lenovo Yoga 9i and an MPP-style pen), in Edge or Chrome.

| Input | What it does |
|---|---|
| Pen tip | Draws with the current tool. With the Pen tool: ink, with the pressure of the pen. Inside a selection it moves or resizes it instead. |
| Pen, eraser button held, drag | Erases every shape, text, arrow and stroke the ring passes over (one undo step) |
| Pen, barrel button held, drag | Lasso: draw a loop and everything mostly inside it is selected; then move, delete, duplicate, style or copy it as usual |
| Finger, drag | Pans the page, with any tool (a finger never draws). Dragging on the selection moves or resizes it |
| Two fingers, pinch | Zoom |
| Tap | Select the element (or clear the selection) |
| Double tap | Edit a shape's label or a text; on empty canvas, write new text |
| `P` / `E` | Pen / eraser |

The **Pen** button in the toolbar opens the pen tray: three pens, an eraser and a lasso. Click the active pen again for its colour and size (they apply to new strokes only and are remembered). The lasso chip does the same as the barrel button, for mouse and touch.

A hand resting on the screen is ignored while the pen is touching or hovering, and for half a second after it leaves. If a pan or pinch started just before the pen arrived, it is undone.

**If the pen buttons do the wrong thing on Windows:** open Settings, Bluetooth & devices, Pen & Windows Ink, and check the Lenovo Pen Settings app. The shortcuts must be left as "Eraser" for the eraser button and "Right-click" for the barrel button, not remapped to apps. If the two are simply reversed on your pen, open the pen options (click the active pen in the tray) and tick **Swap pen buttons**.

### Keyboard shortcuts

Press `?` in the app for the full list. The essentials:

| Keys | Action |
|---|---|
| `V` / `H` | Select / hand (pan) |
| `R` `D` `O` `5` | Rectangle, diamond, ellipse, triangle (or `2` `3` `4` `5`) |
| `A` / `L` / `T` | Arrow / line / text (or `6` `7` `8`) |
| `P` / `E` | Pen / eraser |
| `Q` | Keep the tool after drawing (lock) |
| Double-click, `Enter` | Edit text or label (double-click on empty canvas: new text) |
| `Esc`, `Ctrl+Enter` | Finish editing / cancel / clear selection |
| `Delete`, `Ctrl+D`, `Alt`+drag | Delete, duplicate, duplicate while moving |
| `Ctrl+C` `Ctrl+X` `Ctrl+V`, `Ctrl+A` | Copy, cut, paste, select all |
| `Ctrl+Z`, `Ctrl+Shift+Z` or `Ctrl+Y` | Undo, redo |
| `Ctrl+]` / `Ctrl+[` (add `Shift`) | Bring forward / send backward (to front / to back) |
| Arrow keys (`Shift`) | Nudge by 1 (10) |
| `Shift` while drawing / `Alt` while drawing | Square or circle / from the center |
| Wheel, `Shift`+wheel, `Space`+drag | Pan |
| `Ctrl`+wheel, `Ctrl`+`=` / `-` / `0` | Zoom at the cursor, zoom in / out / 100% |
| `Shift+1` / `Shift+2` | Zoom to fit everything / to the selection |
| `Home` | Back to the top-left of the page at 100% |
| `Ctrl+\` | Show or hide the sidebar |
| `Ctrl+S` | Save now (autosave runs anyway) |

## Development mode (hot reload)

```sh
docker compose -f compose.dev.yaml up --build
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the Python API on <http://localhost:8000>. Saving a file under `frontend/src` hot-reloads the page; saving a file under `backend/app` restarts uvicorn. File watching uses polling, because bind mounts on Windows and WSL2 deliver no change events. Dev pages live in their own volume (`chalk-dev-library`), separate from your real library; set `CHALK_DEV_LIBRARY` to a host folder if you want to see them in Explorer. `docker compose -f compose.dev.yaml down` stops it; add `-v` only if you want to wipe the **dev** library.

After changing `frontend/package.json` or its lockfile, rebuild with `docker compose -f compose.dev.yaml up --build -V`.

Docker leaves an empty `frontend/node_modules` folder in the repository as a mount point. That is harmless and git-ignored.

## Running the tests (all in Docker)

Unit tests and the typecheck (sources are mounted read-only, so no rebuild is needed after an edit):

```sh
docker compose -f compose.test.yaml run --rm web-unit                      # tsc --noEmit + vitest
docker compose -f compose.test.yaml run --rm web-unit npx vitest run src/core/binding.test.ts
docker compose -f compose.test.yaml run --rm api-unit                      # pytest
```

End-to-end tests (Playwright in Chromium against a throwaway instance of the production image; it always rebuilds first):

```sh
docker compose -f compose.test.yaml up --build --force-recreate --abort-on-container-exit --exit-code-from e2e app-test e2e
docker compose -f compose.test.yaml down
```

Screenshots of the scenarios land in `e2e/artifacts/screens/`, and a Playwright HTML report with traces of failures in `e2e/artifacts/report/` (both git-ignored). To iterate on a single spec:

```sh
docker compose -f compose.test.yaml up -d --build --force-recreate --wait app-test
docker compose -f compose.test.yaml run --rm --build e2e npx playwright test tests/arrows.spec.ts --retries 0
docker compose -f compose.test.yaml down
```

The test instance has its own library in `/tmp` inside the container and never touches yours.

## Project structure

```
Dockerfile, compose.yaml, compose.dev.yaml, compose.test.yaml   one image, three Compose projects
backend/app/        FastAPI app: models.py (API contract), library.py (the folder library), db.py (one-time v1 SQLite import), routes.py, main.py
backend/tests/      pytest
frontend/src/
  types.ts, constants.ts, testids.ts     shared contracts
  core/        pure TypeScript: geometry, arrow binding, scene operations, text layout, ink, serialization
  state/       the store, undo history and the command layer (actions.ts)
  render/      canvas drawing (rough.js, perfect-freehand for ink), selection overlay, PNG/JSON export
  tools/       one gesture state machine per tool (select, shape, arrow, text, hand, pen, eraser, lasso)
  input/       pointer router (mouse, pen buttons, palm rejection), touch gestures, keyboard shortcuts, clipboard
  persistence/ API client, board lifecycle, autosave and conflict handling, local backup
  ui/          the React chrome (toolbar, style panel, menus, dialogs, text editor)
  testing/     the window.__CHALK__ hook used by the e2e suite
e2e/tests/          Playwright specs, helpers and the shared test ids
docs/HACKING.md     how to extend Chalk (add a shape, a tool, a style, ...)
```

Data flows one way: input becomes a command in `state/actions.ts`, which calls pure functions in `core/`, which return new immutable arrays, which the store publishes to the canvas, the React chrome and autosave. `docs/HACKING.md` has the recipes.

## What is out of scope (and where it would go)

These are deliberate omissions for a first version. Each has a clear seam, so you know where to start.

| Feature | Why it is out | Seam |
|---|---|---|
| Rotation | Multiplies the cost of hit testing, resize, binding and the text overlay. Not requested. | Add `angle` plus `MIGRATIONS[2]`; the geometry functions all take an element. |
| Multi-point, curved or elbow arrows | Straight connectors cover "connect boxes". | `ArrowElement.via?: Point[]`; `resolveArrow` uses the first and last segments. |
| Point eraser, highlighter, pen tilt, ruler | The eraser removes whole strokes; the pen has no highlighter mode. | `tools/eraser.ts` (split `InkElement.points`), a pen kind in `PenSettings`. |
| Typed note-taking | The next feature. | A flowing text element beside the free-placed `text` one. |
| Groups and frames | Bookkeeping that would bloat the core. | `groupIds`, and selection expansion in `tools/select.ts`. |
| Images and embeds | Needs blob storage. | `/api/files` plus an `image` element. |
| Real-time collaboration, auth | This is a local single-user app. | Per-element version fields, a WebSocket route. |
| SVG export | Needs a second renderer and an embedded font. | `gen.toPaths(drawable)` in `render/export.ts`. |
| Light theme toggle | v2 went dark; element colors are literal. | CSS tokens plus a color transform in `drawScene`. |
| Moving or reordering pages and sections | Pages sort by name; renaming covers most needs. | A `PUT /boards/{id}` location field plus drag and drop in `ui/Sidebar.tsx`. |
| Search across pages | Needs an index over every page file. | A `/api/search` route over `library.py`. |
| Grid snapping and alignment guides | Nice to have. | One function applied to the delta in `moveElements`. |
| Mobile layout, i18n | Desktop first (touch gestures and the pen work on a laptop). | `ui/*`. |
| System-clipboard images, copy as PNG | Unavailable on the non-secure e2e origin. | `input/clipboard.ts`. |

## Your data and backups

Your pages are ordinary files in the library folder (`CHALK_LIBRARY`), bind-mounted into the container at `/library`. Nothing about them is stored in the repository or pushed to GitHub.

```
Chalk/                          your CHALK_LIBRARY folder
  Work/                         a notebook (a folder)
    Projects/                   a section (a folder)
      Roadmap.chalk             a page (JSON; the file name is the page name)
  .chalk/trash/                 deleted pages, sections and notebooks are moved here, not erased
```

- **Back up:** copy the folder. Each `.chalk` file is self-contained JSON (`{"type":"chalk/page", "id", "version", ..., "scene"}`).
- **Change things in Explorer:** you can rename, move or copy notebooks, sections and pages while Chalk runs. The sidebar picks up changes when the window gets focus. A copied page gets a new id automatically. Names that Windows can't store (`a/b`, `CON`) are adjusted, and duplicates get ` (2)`.
- **Undo a delete:** move the item back out of `.chalk/trash/` (strip the timestamp prefix from its name).
- **Boards from Chalk v1** (the SQLite database on the `chalk_chalk-data` volume) are imported once, on the first start, into the notebook `Imported`, section `Boards`. The first time you open one, its colours are converted to the dark palette and content that sat left of or above the old canvas origin is moved onto the page. The database itself is left untouched; you can delete the volume once you're happy (`docker volume rm chalk_chalk-data`).
- **OneDrive:** a library inside OneDrive is backed up to the cloud. Right-click the Chalk folder and choose "Always keep on this device", so Docker never sees cloud-only placeholder files. Saves are atomic and retry briefly if OneDrive holds a file open. Docker creates an empty `frontend/node_modules` folder in this repository; don't let a sync tool fill it.
- **Export a single page:** Menu, then "Export as JSON" gives a portable `.chalk.json`, and "Import scene…" loads one onto the current page.

## Versions

Exact pins (all licenses are MIT, ISC, BSD, Apache-2.0, or OFL-1.1 for the font):

| Part | Version |
|---|---|
| Node image | `node:24.22.1-trixie-slim` |
| Python image | `python:3.14.9-slim-trixie` (venv at `/opt/venv` inside the image) |
| React, React DOM | 19.3.1 |
| rough.js | 4.6.6 |
| perfect-freehand | 1.2.2 |
| @fontsource/caveat | 5.3.0 |
| Vite / @vitejs/plugin-react | 8.3.5 / 6.1.2 |
| TypeScript | 6.0.3 |
| Vitest | 5.0.5 |
| FastAPI / Pydantic / Uvicorn | 0.161.1 / 2.14.1 / 0.54.0 |
| pytest / httpx2 | 9.1.1 / 2.16.0 |
| Playwright (npm and image) | 1.64.1 / `mcr.microsoft.com/playwright:v1.64.1-noble` |

No fallback pins were needed: every version above works as written.

## License

MIT. Copyright (c) 2026 The Chalk authors. See [LICENSE](LICENSE).
