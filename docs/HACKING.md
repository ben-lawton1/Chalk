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
| `ui/*`, `main.tsx` | anything. `ui/notes/` (the page notes editor and its menus) and `ui/terminal/` (the terminal panel) follow the same rule; `ui/notes/menuBridge.ts` and `ui/terminal/session.ts` / `prefs.ts` stay free of React so they can be unit tested in plain node. `state/notesHost.ts` is how `state/` and `input/` reach the mounted editor without importing `ui/` |

Inside `core/` the order is `math -> ids -> viewport -> shapes -> text -> ink -> geometry -> binding -> scene -> notes -> serialize`; a module imports only modules before it. `notesView` and `pageLinks` (the notes column geometry, and page link resolution and ranking) import only types and constants, so they can sit anywhere; `notes` (restoring a notes document from a file) needs only `math` and is imported by `serialize`.

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

### Page notes (v4)

Every page has one typed document, the notes column, next to the drawing. It is a Tiptap 3 (ProseMirror) editor in a DOM layer, not a canvas element, so none of the element machinery (undo entries, hit testing, `core/scene.ts`) applies to it.

```
ui/notes/NotesLayer.tsx  (one editor per board id, above both canvases, placed like TextEditor: translate + scale from the viewport)
   |  docChanged            |  focus / blur / caret                  |  ResizeObserver
   v                        v                                        v
state/actions.setNotes   state/notesHost.ts (focusAt, blur)       setNotesBounds
   |                        ^                                        |
   v                        |  enterNotesMode / leaveNotesMode       v
AppState.notes  <-- persistence (autosave, backup, conflict reload)   AppState.notesBounds -> zoomToFit, "Back to content"
```

- **The layer and notes mode.** `AppState` has `notes: NotesDoc | null` (`{ width, doc }`, `doc` is ProseMirror JSON), `notesActive` (notes mode, a flag, not a `ToolId`) and `notesBounds` (the measured world rect of the column, transient). When `notesActive` is false the layer has `pointer-events: none`, so clicks, marquees, ink and touch reach the canvas; page-link chips keep `pointer-events: auto`. `enterNotesMode(world?)` and `leaveNotesMode()` in `state/actions.ts` are the only way in and out: the N key and the toolbar button, the double-click path (`enterNotesIfInColumn`, decided with the pure `inNotesColumn` in `core/notesView.ts`), choosing a tool (`setTool` leaves), a canvas pointerdown in `input/pointer.ts`, a page switch and Esc (`NotesFallbackKeys`, lowest priority so an open menu eats the key first). `state/notesHost.ts` is the seam that lets `state/` and `input/` focus or blur the mounted editor without importing `ui/`. The caret per page is remembered in `localStorage['chalk:notes-caret:<boardId>']`; `core/notesView.ts` has the clamping and pan-to-caret maths.
- **Store sync.** The editor is keyed by board id, so a page switch builds a fresh editor (a fresh undo history) from `state.notes`. On every document change the layer calls `setNotes({ width, doc: editor.getJSON() })` (no undo entry; ProseMirror's history owns undo while you type). The layer remembers the last object it wrote; a different object in the store (a conflict reload, an import) is an outside replacement and goes into the editor with `setContent(..., { emitUpdate: false })`. Never echo the editor's own update back.
- **Persistence.** `toSceneFile(elements, notes)` writes `notes`; `parseSceneNotes` reads it through `core/notes.restoreNotes`, which validates defensively (depth, node count, text size, width clamped to [320, 2000]) and returns `null` for anything bad, so broken notes never stop the elements loading. Autosave treats a new `notes` object as dirty, and the local backup and the keepalive flush go through `toSceneFile`. Clipboard payloads carry elements only.
- **Scene v4.** `SCENE_FILE_VERSION = 4` (and `SCENE_VERSION = 4` in `backend/app/models.py`). `MIGRATIONS[3]` (v3 to v4) is the identity: v3 files simply have no `notes`. The bump is there so that an old cached tab cannot silently drop notes when it saves. The backend envelope check accepts versions 1 to 4 and stores `notes` untouched.
- **Menus: `menuBridge`.** The `/` slash menu, the `@` / `[[` page picker and the table size step are React components in a body portal (`MenuPopup.tsx`; it flips above the caret near the bottom of the stage and clamps to the stage, so it stays above the terminal panel, and it does not scale with the zoom). The Tiptap `Suggestion` plugins (`suggestions.ts`) only decide when a menu is open; their render hooks call `setMenu` / `clearMenu` in `ui/notes/menuBridge.ts`, a tiny external store that `NotesMenus.tsx` reads with `useSyncExternalStore`. While a menu is open it registers a key handler, and the plugin's `onKeyDown` passes keys to it, so arrows, Enter, Tab and Esc go to the menu first.
- **Page links.** `ui/notes/extensions/pageLink.ts` is an inline atom node `pageLink { id, label }` drawn as a chip. `core/pageLinks.ts` (pure) resolves a stored link against the library tree (live name, or the stored label with "missing" set) and ranks pages for the picker (current section, then notebook, then the rest; the current page is excluded). Clicking a chip calls `openBoard(id)`. "New page" goes through `persistence/library.createPageQuietly`, which creates the page without opening it.

### Terminal panel (v4)

The terminal is a dock panel (`ui/terminal/`) talking to the host bridge (`bridge/`, Go) over a WebSocket. Pieces:

- `ui/terminal/session.ts`: `TerminalSession`, the WebSocket client (binary frames = raw PTY bytes both ways; text frames are JSON: `resize` out, `exit` and `error` in). It takes a socket factory so `session.test.ts` drives it with a fake socket. No React, no xterm.
- `ui/terminal/prefs.ts`: `localStorage['chalk:terminal']` = `{open, height}` (always try/catch) and the height clamp (120 px to 70% of the window).
- `ui/terminal/terminalStore.ts`: its own tiny store (not `AppState`: sessions and xterm instances are not serializable and must outlive page switches). It owns the tabs, the bridge status (`/health`, `/profiles`; polling every 3 s while the panel is open and the bridge offline), the xterm instances (one hidden `.terminal-host` div per tab, so hiding the panel or switching tabs never loses output) and the `--terminal-h` CSS variable on `<html>` (0px when hidden).
- `ui/terminal/TerminalPanel.tsx`: the button and the panel (tab strip, profile menu, resize grip, offline and "process exited" overlays), read through `useSyncExternalStore`.
- xterm (`@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`) is imported dynamically the first time a session is created, so it is a separate chunk. It uses the DOM renderer, so the e2e suite reads `.xterm-rows`.
- Layout: `.stage` has `bottom: var(--terminal-h)` and every bottom-anchored island adds `var(--terminal-h)` to its offset. A new bottom-anchored element must do the same.
- Keys: `input/keyboard.ts` handles only Ctrl+\` (it dispatches the window event `TERMINAL_TOGGLE_EVENT`; `input/` may not import `ui/`). For any target inside `.terminal-panel`, Ctrl+S, Ctrl+=, Ctrl+-, Ctrl+0 and all plain keys are left alone; Ctrl+C copies via a hidden textarea when text is selected (`navigator.clipboard` does not exist on the e2e origin).
- Folder rule: `ui/terminal/` may import anything below `ui/`, but `session.ts` and `prefs.ts` stay free of React and xterm so they remain unit-testable in plain node. Only `terminalStore.ts` touches xterm.
- The bridge URL comes from `GET /api/config` (`terminalUrl`, env `CHALK_TERMINAL_URL`). The e2e suite points it at the `term-test` service, whose only profile is the Linux `shell`.


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
| `GET /config` | `{terminalUrl}`: where the browser finds the terminal bridge (env `CHALK_TERMINAL_URL`) |
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
MIGRATIONS[4] = (f) => ({ ...f, version: 5, /* transform the old shape here */ });
```

`MIGRATIONS[1]` (v1 to v2) is the example to copy; `MIGRATIONS[2]` (v2 to v3, which added `ink`) and `MIGRATIONS[3]` (v3 to v4, which added the page `notes`) are the identity, there so that an old cached tab cannot silently drop ink or notes when it saves. It maps the light v1 palette to the dark one, and moves content at negative coordinates onto the page with `moveElements`, which keeps arrow bindings intact. A migrated page differs from the server copy, so autosave writes it back once.

Older files are migrated on import and on board load; files from a newer Chalk are rejected with a clear message.

### Tune the feel

Everything numeric lives in `constants.ts`, with units in the comments: drag thresholds, hit tolerance, zoom limits, autosave timing, bind distance. Change a number and the whole app follows.

The pen and touch feel is in the same file. `INK_THINNING`, `INK_SMOOTHING` and `INK_STREAMLINE` shape the ink (how much pressure thins the line, how much the outline is smoothed and the input streamlined) and `INK_MIN_SAMPLE_PX` skips redundant samples. `ERASER_RADIUS_PX`, `LASSO_MIN_INSIDE` (how much of an element must be inside the loop) and `LASSO_MIN_SAMPLE_PX` tune the eraser and lasso. `TOUCH_TAP_SLOP_PX`, `TOUCH_TAP_MAX_MS`, `DOUBLE_TAP_MS` and `DOUBLE_TAP_SLOP_PX` define a tap and a double tap; `TOUCH_HIT_TOLERANCE_PX`, `TOUCH_HANDLE_HIT_PX` and `PEN_HANDLE_HIT_PX` make fingers and pens easier to aim; `PALM_GRACE_MS` is how long a finger is ignored after the pen leaves. `PEN_COLORS`, `PEN_SIZES` and `DEFAULT_PENS` set what the pen tray offers.

### Add a slash command

The slash menu is data-driven: one entry in `SLASH_COMMANDS` in `ui/notes/commands.ts`, nothing else. Say you want a "Warning" block that is a callout:

```ts
{ id: 'warning', title: 'Warning', aliases: ['warn', 'danger'], group: 'Basic blocks', icon: '!', description: 'A callout that stands out',
  run: (e, r) => startFrom(e, r).toggleCallout().run() },
```

`id` is the test id suffix (`slash-item-warning`), `aliases` are what `/warn` matches (titles and aliases, prefix matches first), `group` is one of `COMMAND_GROUPS`, and `run(editor, range, ctx)` must delete the typed `/query` itself, which is what `startFrom` does (focus, then `deleteRange`). Chain whatever Tiptap command you need after it. Commands that need UI (the table size step, the link prompt, creating a page) call a `ctx` method instead; to add one, extend `SlashContext` and implement it in `SlashMenu.tsx`. The filter and ranking are pure (`filterCommands`) and tested in `commands.test.ts`; add a case there if your aliases collide with existing ones. Add the command to the README slash table too.

### Add a notes block

A block is a Tiptap node plus CSS, and optionally a slash entry. `ui/notes/extensions/callout.ts` is the smallest example.

1. **The node.** Create `ui/notes/extensions/<name>.ts` with `Node.create({ name, group: 'block', content: 'block+', parseHTML, renderHTML, addCommands })`. Add a command (for example `toggleCallout`) and declare it in the `declare module '@tiptap/core'` block so it type-checks. Keep attributes JSON-friendly: the document is stored as ProseMirror JSON in the page file.
2. **Register it** in the list in `ui/notes/editor.ts` (`createNotesExtensions`). A node type that is not registered is dropped by Tiptap when a page loads, so an older Chalk that opens a page with your block loses it on its next save. Adding a node needs no migration (the stored JSON stays valid), but one that changes the meaning of existing content does: bump the scene version, see "Change the scene file format".
3. **Style it** in the notes section of `ui/styles.css` under `.notes-editor` (for the callout: `.notes-editor div[data-callout]`). Sizes are in world px at 16px base, because the column scales with the page zoom. Use the dark tokens from `:root`.
4. **Optional entry points.** A slash entry (previous recipe), and a markdown shortcut as an input rule in `ui/notes/extensions/markdownRules.ts`. Add a row to `SHORTCUTS` in `input/keyboard.ts` for any new key or rule (the help dialog renders it) and to the README.
5. **Tests.** A node with logic gets a unit test next to it (see `blockMove.test.ts`); add its scenario to `e2e/tests/notes.spec.ts`, reading the document through `__CHALK__.getNotes()` / `getNotesText()`. If the node holds data that must survive a load, check `core/notes.ts` (`restoreNotes`) does not reject it: it only limits depth, node count and text size, and leaves unknown types for Tiptap.

### Add a built-in terminal profile

Profiles are decided by the bridge, never by the browser (the browser only sends an id). Edit `bridge/profiles.go`: add an entry to the list returned for the platform (`id`, `Name`, `Command`, `Args`, `Cwd`) and a case to the profile tests. The panel needs no change: `/profiles` feeds the `▾` menu. A personal profile that does not belong in the repo goes in `%USERPROFILE%\.chalk\terminal.json` instead (see the README).

## Testing your change

```sh
docker compose -f compose.test.yaml run --rm web-unit        # typecheck + unit tests
docker compose -f compose.test.yaml run --rm api-unit        # backend tests
docker compose -f compose.tools.yaml run --rm bridge-unit        # terminal bridge (Go)
docker compose -f compose.test.yaml up --build --force-recreate --abort-on-container-exit --exit-code-from e2e app-test e2e
docker compose -f compose.test.yaml down
```

The whole e2e run takes about ten minutes, so when a single tool call has a time limit run it in two halves by file name, against the same running stack:

```sh
docker compose -f compose.test.yaml up -d --build --force-recreate --wait app-test term-test
docker compose -f compose.test.yaml run --rm --build e2e npx playwright test 'tests/[a-n]*'
docker compose -f compose.test.yaml run --rm e2e npx playwright test 'tests/[o-z]*'
docker compose -f compose.test.yaml down
```

The pen and touch specs (`e2e/tests/pen-touch.spec.ts`) dispatch synthetic `PointerEvent`s with `pointerType` `pen` or `touch` through the helpers `ptrEvents`, `penStroke`, `penEraserDrag`, `penBarrelDrag`, `fingerDrag`, `fingerTap` and `pinch` (Playwright's mouse cannot produce them).

The browser suite drives the real app with `page.mouse` and reads state through `window.__CHALK__` (`testing/testHook.ts`): `getElements()`, `getSelectedIds()`, `getAppState()`, `worldToScreen()`, `getElementScreenBounds(id)`, `flushSave()`, `whenRendered()`, and for the notes `getNotes()` (a deep copy of the ProseMirror JSON) and `getNotesText()` (plain text, blocks joined by a newline), with `notesActive` in `getAppState()`. The terminal specs need the `term-test` service (the Linux build of the bridge); the notes specs are `notes-editor`, `notes-menus` and `notes`. It never sleeps; it polls. Test ids come from `testids.ts`, so UI and tests cannot drift apart.

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
