# Hacking on Chalk

Chalk is built so you can read it in an afternoon and change it in minutes. This guide shows the map, the rules, and recipes for the most likely changes. Everything runs in Docker (see the [README](../README.md) for the commands); nothing needs installing on your machine.

## The map

Data flows one way:

```
pointer / keyboard / clipboard / UI click
        |
        v
input/*  routes  -->  tools/*  (one gesture state machine per tool)  --+
ui/* buttons  ---------------------------------------------------------+
                                                                       v
                        state/actions.ts  (commands; one undo entry each)
                                                                       | calls pure functions
                                                                       v
                        core/*  (pure: scene ops, geometry, bindings, text layout)
                                                                       | returns new arrays / objects
                                                                       v
                        state/store.ts setState  -->  subscribers:
                                                       - ui/Canvas.tsx  -> render/*  (two canvases, rAF)
                                                       - the React chrome (useAppState)
                                                       - persistence/autosave.ts
                                                       - persistence/library.ts (sidebar tree refresh)
                                                       - input/pointer.ts (cursor)
```

Pages are stored by the backend as files: `backend/app/library.py` maps `<library>/<Notebook>/<Section>/<Page>.chalk` to the `/api` routes. The frontend never sees paths, only ids plus `notebook` / `section` names.

Folder rules (nothing imports "upwards", so there are no cycles):

| Folder | May import |
|---|---|
| `types.ts`, `testids.ts` | nothing |
| `constants.ts` | types only |
| `core/*` | types, constants, other `core/*` |
| `state/*` | the above plus `state/*` |
| `render/*` | types, constants, `core/*`, roughjs, perfect-freehand. Never `state/*` or React |
| `tools/*` | types, constants, `core/*`, `state/*` |
| `input/*` | the above plus `tools/*`, autosave |
| `persistence/*` | types, constants, `core/*`, `state/*` |
| `ui/*`, `main.tsx` | anything |

Inside `core/` the order is `math -> ids -> viewport -> shapes -> text -> ink -> geometry -> binding -> scene -> serialize`; a module imports only modules before it.

### Pointer routing (v3)

`input/pointer.ts` decides on pointerdown who gets a gesture. Touch never draws, and the pen's buttons are recognised by the signal the browser reports, not by where they sit on the pen (`input/penButtons.ts`; the "Swap pen buttons" option exchanges the two).

| Input | Route |
|---|---|
| Mouse, left button | `TOOLS[tool]` (hand tool, Space and middle button pan, as before) |
| Pen tip | the same, except with the pen, eraser or lasso tool: down on the selection (a handle or inside its padded box) goes to `selectTool`; down elsewhere clears the selection and runs the tool |
| Pen, eraser button (`button 5` or `buttons & 32`) | `eraserTool`, whatever the tool is |
| Pen, barrel button (`button 2` or `buttons & 2`) | `lassoTool`, whatever the tool is |
| Touch | `input/touch.ts`, a state machine with an injectable clock: one finger pans (or moves the selection when it starts on it), two pinch, a tap selects, a double tap edits |
| Pen near the screen | touches are ignored (palm rejection); a pen down also undoes a pan or pinch that began just before |

`cancelGesture()` is still the single cancel path and now also cancels a touch gesture. The native `dblclick` is honoured only after a mouse pointerdown; pen and touch double taps come from `createTapTracker` (`input/taps.ts`). The route ends on pointermove when no button bit of 1, 2, 4 or 32 is set (32 is the pen's eraser).

### Coding rules worth knowing

- **Elements are immutable.** Never mutate an element, a state array or `DEFAULT_STYLE`; spread into a new object. Many functions return the input array (`===`) when nothing changed, and autosave and the render caches rely on that. Keep it that way.
- **Arrows re-route inside `core/`.** `moveElements`, `resizeElements`, `setElementText`, `applyStyleToElements`, `removeElements`, `duplicateElements` and friends already call `updateBoundArrows`. Tools and UI code never do.
- **Ink tools are sticky.** The pen, eraser and lasso never call `finishCreation()`, and a finished stroke is not selected.
- **One undo entry per command** in `state/actions.ts`. Gestures push a single entry when they finish. Use a `mergeKey` for things that should collapse (sliders, nudging).
- **Named exports only**, no classes (except `Error` subclasses), React 19 without a dev double-mount wrapper.
- **No `crypto.randomUUID` or `navigator.clipboard`.** The e2e suite runs on a non-secure origin (`http://app-test:8000`), where they do not exist.
- **The page starts at (0, 0).** `setViewport` in `state/store.ts` clamps every viewport with `clampViewport(v, pageOrigin(bounds))` from `core/viewport.ts`, so nothing can scroll above or left of the page (content at negative coordinates widens the limit so it stays reachable). Set the viewport only through `setViewport`.
- **The canvas sits in a stage.** `ui/App.tsx` puts the canvas and text editor in a fixed `.stage` that starts at `var(--sidebar-w)` (264px with the sidebar open, 0 closed). Screen coordinates are stage-relative. Chrome that is anchored left or centred offsets by `--sidebar-w`.
- **Ink is not rough.js.** An `ink` element (`core/ink.ts`) is a freehand stroke: `x`/`y` is the min corner of its points and `points` are relative to it (`{x, y, p}`, pressure 0..1), so a move only changes x/y and the cached outline survives drags. `style.strokeWidth` is the pen size, and ink ignores the other style fields. `render/ink.ts` turns the points into a `Path2D` with perfect-freehand (cached by the `points` array) and fills it. Ink is not bindable and has no text. A stroke in progress lives in `interaction.liveInk` and is drawn on the overlay only; the scene changes once, on pointer up.
- **Hand-drawn shapes are deterministic.** Each element has a `seed`, so the same element always looks the same. `render/roughShapes.ts` caches drawables and survives drags.

## Recipes

### Add a shape (a hexagon)

1. In `types.ts`: `export type ShapeKind = 'rectangle' | 'diamond' | 'ellipse' | 'triangle' | 'hexagon';`
2. In `core/shapes.ts`: append `'hexagon'` to `SHAPE_KINDS` and add an entry to `SHAPES`:

   ```ts
   hexagon: {
     kind: 'hexagon', title: 'Hexagon', shortcuts: ['9'], defaultSize: { width: 160, height: 120 },
     outline: (r) => ({ kind: 'polygon', points: [
       { x: r.x + r.width * 0.25, y: r.y }, { x: r.x + r.width * 0.75, y: r.y }, { x: r.x + r.width, y: r.y + r.height / 2 },
       { x: r.x + r.width * 0.75, y: r.y + r.height }, { x: r.x + r.width * 0.25, y: r.y + r.height }, { x: r.x, y: r.y + r.height / 2 } ] }),
     labelBox: (r) => insetRect({ x: r.x + r.width * 0.2, y: r.y, width: r.width * 0.6, height: r.height }, LABEL_PADDING),
     icon: 'M7 4h10l5 8-5 8H7l-5-8z',
   },
   ```

3. That is all for the product. The tool, toolbar button, palette drag, shortcut, hit test, arrow binding, rendering, label, style panel and file import come from the registry. TypeScript tells you if you forgot a field.
4. Housekeeping: add a line for the new key to `SHORTCUTS` in `input/keyboard.ts` (the help dialog prints that table), and extend the tests that list the four kinds (`core/shapes.test.ts`, and the "unknown shape kinds" case in `core/serialize.test.ts` if it uses your name).

The outline can be a `polygon`, or an `ellipse`. Add an optional `path(r, style)` (as the rectangle does for round corners) to draw an SVG path instead of the outline.

### Add a tool

1. Write `tools/sticky.ts` exporting `stickyTool: Tool` (`onPointerDown`, `onPointerMove`, `onPointerUp`, `onCancel`; copy `tools/hand.ts`, the smallest one).
2. Add `'sticky'` to `ToolId` in `types.ts`.
3. Add one line each to `TOOLS`, `TOOL_INFO` and `TOOLBAR` in `tools/index.ts`.
4. Add an icon: a path in `PATHS` and the name in `IconName` in `ui/icons.tsx`.

The pointer router, keyboard shortcut lookup and toolbar pick it up automatically. A gesture that changes the scene takes a `takeSnapshot()` when it starts and calls `pushUndo(snapshot)` once when it ends, and `onCancel` restores the pre-gesture state (see `tools/shape.ts`).

### Add a style property

1. Add a field to `Style` in `types.ts` and a value to `DEFAULT_STYLE` in `constants.ts`.
2. Validate it in `restoreStyle` in `core/serialize.ts` (old files without the field must still load).
3. Read it in `render/roughShapes.ts` (and `drawScene.ts` for text).
4. Add a control in `ui/StylePanel.tsx`, a section flag in `ui/stylePanelModel.ts` if it only applies to some selections, and a test id helper in `testids.ts` (keep the e2e copy identical: `e2e/tests/testids.ts`).

### Change how arrows anchor

Edit `chooseFixedPoint` in `core/binding.ts`. The default is center-directed (`[0.5, 0.5]`); releasing deep inside a shape, or holding Alt, stores the exact point instead. `resolveArrow` turns an arrow plus its bound shapes into endpoints; `BIND_GAP` in `constants.ts` is the visual gap.

### Add an API field

`backend/app/models.py`, then `backend/app/routes.py` (and `library.py` if it is stored), then `frontend/src/types.ts`, then `frontend/src/persistence/api.ts`. Add a case to `backend/tests/test_boards.py` or `test_library.py`.

The routes, all under `/api`:

| Route | Does |
|---|---|
| `GET /library` | `{path, notebooks: [{name, sections: [{name, pages: [summary]}]}]}`, naturally sorted |
| `GET /boards`, `POST /boards` | flat list (newest first); create, optionally in `{notebook, section}` |
| `GET` / `PUT` / `DELETE /boards/{id}` | load; checked save (`baseVersion`, 409 on conflict), a new `name` renames the file; move to trash |
| `POST /notebooks`, `PUT` / `DELETE /notebooks/{nb}` | create, rename, trash a notebook |
| `POST /notebooks/{nb}/sections`, `PUT` / `DELETE /notebooks/{nb}/sections/{sec}` | the same for sections |

The server may change a name (unsafe characters become `-`, duplicates get ` (2)`), so clients adopt the `name` in each response.

### The library on disk

`library.py` rescans the folders on every listing; only parsed page headers are cached, by path, mtime and size, so edits made in Explorer show up at once. Writes are atomic (temp file plus `os.replace`, retried briefly on `PermissionError` for OneDrive). An id that is missing from the index triggers one rescan, so a page that was moved still resolves. A copied page gets a fresh id. A page file is `{"type": "chalk/page", "formatVersion": 1, "id", "version", "createdAt", "updatedAt", "scene"}`. Deletes move into `<library>/.chalk/trash/`. On startup, `main.py` imports boards from a v1 SQLite file (`CHALK_DB_PATH`) once, into `Imported/Boards`, and writes the marker `.chalk/legacy-imported`.

### Change the scene file format

Bump `SCENE_FILE_VERSION` in `constants.ts` (and `SCENE_VERSION` in `backend/app/models.py`, used for new empty pages) and add a migration in `core/serialize.ts`:

```ts
MIGRATIONS[3] = (f) => ({ ...f, version: 4, /* transform the old shape here */ });
```

`MIGRATIONS[1]` (v1 to v2) is the example to copy; `MIGRATIONS[2]` (v2 to v3, which added `ink`) is the identity, there so that an old cached tab cannot silently drop ink when it saves. It maps the light v1 palette to the dark one, and moves content at negative coordinates onto the page with `moveElements`, which keeps arrow bindings intact. A migrated page differs from the server copy, so autosave writes it back once.

Older files are migrated on import and on board load; files from a newer Chalk are rejected with a clear message.

### Tune the feel

Everything numeric lives in `constants.ts`, with units in the comments: drag thresholds, hit tolerance, zoom limits, autosave timing, bind distance. Change a number and the whole app follows.

The pen and touch feel is in the same file. `INK_THINNING`, `INK_SMOOTHING` and `INK_STREAMLINE` shape the ink (how much pressure thins the line, how much the outline is smoothed and the input streamlined) and `INK_MIN_SAMPLE_PX` skips redundant samples. `ERASER_RADIUS_PX`, `LASSO_MIN_INSIDE` (how much of an element must be inside the loop) and `LASSO_MIN_SAMPLE_PX` tune the eraser and lasso. `TOUCH_TAP_SLOP_PX`, `TOUCH_TAP_MAX_MS`, `DOUBLE_TAP_MS` and `DOUBLE_TAP_SLOP_PX` define a tap and a double tap; `TOUCH_HIT_TOLERANCE_PX`, `TOUCH_HANDLE_HIT_PX` and `PEN_HANDLE_HIT_PX` make fingers and pens easier to aim; `PALM_GRACE_MS` is how long a finger is ignored after the pen leaves. `PEN_COLORS`, `PEN_SIZES` and `DEFAULT_PENS` set what the pen tray offers.

## Testing your change

```sh
docker compose -f compose.test.yaml run --rm web-unit        # typecheck + unit tests
docker compose -f compose.test.yaml run --rm api-unit        # backend tests
docker compose -f compose.test.yaml up --build --force-recreate --abort-on-container-exit --exit-code-from e2e app-test e2e
docker compose -f compose.test.yaml down
```

The pen and touch specs (`e2e/tests/pen-touch.spec.ts`) dispatch synthetic `PointerEvent`s with `pointerType` `pen` or `touch` through the helpers `ptrEvents`, `penStroke`, `penEraserDrag`, `penBarrelDrag`, `fingerDrag`, `fingerTap` and `pinch` (Playwright's mouse cannot produce them).

The browser suite drives the real app with `page.mouse` and reads state through `window.__CHALK__` (`testing/testHook.ts`): `getElements()`, `getSelectedIds()`, `getAppState()`, `worldToScreen()`, `getElementScreenBounds(id)`, `flushSave()`, `whenRendered()`. It never sleeps; it polls. Test ids come from `testids.ts`, so UI and tests cannot drift apart.

Tips when writing an e2e test:

- Create your own board through the API (`freshBoard` or `seededBoard` in `e2e/tests/helpers.ts`); two workers run in parallel.
- On a fresh empty board the viewport is the identity, so world coordinates equal screen coordinates. Seeded boards get the same through `localStorage['chalk:viewport:<id>']`.
- The `test` fixture in `helpers.ts` starts every page with the sidebar closed, so the stage begins at client (0, 0). Call `withSidebar(page)` to open it. `worldToScreen` and `getElementScreenBounds` in the hook return client coordinates either way.
- Every spec shares one library, and new pages without a location land in the same default section, so names come back as `Untitled page (N)`. Match names with a regex, or create your own notebook with a random suffix.
- Drag with at least 20 px of movement (thresholds are 3-8 px), using `steps`.
- Floating panels sit on top of the canvas: with something selected, the style panel covers the left 232 px. Deselect first if you need to click there.

## Debugging tips

- **Dev mode** (`docker compose -f compose.dev.yaml up --build`, <http://localhost:5173>) hot-reloads both the frontend and the API.
- Open the browser console and type `__CHALK__.getAppState()` or `__CHALK__.getElements()`.
- A stuck gesture usually means a tool did not clear its state in `onCancel`; `cancelGesture()` in `input/pointer.ts` is the single place every Escape, `pointercancel` and window blur goes through.
- Pages are plain JSON files in your library folder; open one in any editor. `curl localhost:8080/api/library` shows what the server sees.
