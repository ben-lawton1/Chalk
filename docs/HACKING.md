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
                                                       - input/pointer.ts (cursor)
```

Folder rules (nothing imports "upwards", so there are no cycles):

| Folder | May import |
|---|---|
| `types.ts`, `testids.ts` | nothing |
| `constants.ts` | types only |
| `core/*` | types, constants, other `core/*` |
| `state/*` | the above plus `state/*` |
| `render/*` | types, constants, `core/*`, roughjs. Never `state/*` or React |
| `tools/*` | types, constants, `core/*`, `state/*` |
| `input/*` | the above plus `tools/*`, autosave |
| `persistence/*` | types, constants, `core/*`, `state/*` |
| `ui/*`, `main.tsx` | anything |

Inside `core/` the order is `math -> ids -> viewport -> shapes -> text -> geometry -> binding -> scene -> serialize`; a module imports only modules before it.

### Coding rules worth knowing

- **Elements are immutable.** Never mutate an element, a state array or `DEFAULT_STYLE`; spread into a new object. Many functions return the input array (`===`) when nothing changed, and autosave and the render caches rely on that. Keep it that way.
- **Arrows re-route inside `core/`.** `moveElements`, `resizeElements`, `setElementText`, `applyStyleToElements`, `removeElements`, `duplicateElements` and friends already call `updateBoundArrows`. Tools and UI code never do.
- **One undo entry per command** in `state/actions.ts`. Gestures push a single entry when they finish. Use a `mergeKey` for things that should collapse (sliders, nudging).
- **Named exports only**, no classes (except `Error` subclasses), React 19 without a dev double-mount wrapper.
- **No `crypto.randomUUID` or `navigator.clipboard`.** The e2e suite runs on a non-secure origin (`http://app-test:8000`), where they do not exist.
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

`backend/app/models.py`, then `backend/app/routes.py`, then `frontend/src/types.ts`, then `frontend/src/persistence/api.ts`. Add a case to `backend/tests/test_boards.py`.

### Change the scene file format

Bump `SCENE_FILE_VERSION` in `constants.ts` and add a migration in `core/serialize.ts`:

```ts
MIGRATIONS[1] = (f) => ({ ...f, version: 2, /* transform the old shape here */ });
```

Older files are migrated on import and on board load; files from a newer Chalk are rejected with a clear message.

### Tune the feel

Everything numeric lives in `constants.ts`, with units in the comments: drag thresholds, hit tolerance, zoom limits, autosave timing, bind distance. Change a number and the whole app follows.

## Testing your change

```sh
docker compose -f compose.test.yaml run --rm web-unit        # typecheck + unit tests
docker compose -f compose.test.yaml run --rm api-unit        # backend tests
docker compose -f compose.test.yaml up --build --force-recreate --abort-on-container-exit --exit-code-from e2e app-test e2e
docker compose -f compose.test.yaml down
```

The browser suite drives the real app with `page.mouse` and reads state through `window.__CHALK__` (`testing/testHook.ts`): `getElements()`, `getSelectedIds()`, `getAppState()`, `worldToScreen()`, `getElementScreenBounds(id)`, `flushSave()`, `whenRendered()`. It never sleeps; it polls. Test ids come from `testids.ts`, so UI and tests cannot drift apart.

Tips when writing an e2e test:

- Create your own board through the API (`freshBoard` or `seededBoard` in `e2e/tests/helpers.ts`); two workers run in parallel.
- On a fresh empty board the viewport is the identity, so world coordinates equal screen coordinates. Seeded boards get the same through `localStorage['chalk:viewport:<id>']`.
- Drag with at least 20 px of movement (thresholds are 3-8 px), using `steps`.
- Floating panels sit on top of the canvas: with something selected, the style panel covers the left 232 px. Deselect first if you need to click there.

## Debugging tips

- **Dev mode** (`docker compose -f compose.dev.yaml up --build`, <http://localhost:5173>) hot-reloads both the frontend and the API.
- Open the browser console and type `__CHALK__.getAppState()` or `__CHALK__.getElements()`.
- A stuck gesture usually means a tool did not clear its state in `onCancel`; `cancelGesture()` in `input/pointer.ts` is the single place every Escape, `pointercancel` and window blur goes through.
- Boards are in `/data/chalk.db`. To inspect one: `docker compose exec app python -c "import sqlite3; print(sqlite3.connect('/data/chalk.db').execute('select id, name, version from boards').fetchall())"` (check the table name in `backend/app/db.py`).
