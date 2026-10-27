// The page notes column: a Tiptap editor in a DOM layer above the canvases, placed with the viewport like TextEditor (translate + scale).
// Inactive: pointer-events none, so clicks, ink and touch go to the canvas. Active (notes mode): the column takes input.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor, JSONContent } from '@tiptap/react';
import { Selection } from '@tiptap/pm/state';
import { NOTES_CARET_KEY, NOTES_WIDTH, NOTES_X, NOTES_Y } from '../../constants';
import { isNotesEmpty } from '../../core/notes';
import { clampCaret, isBelowNotes, isSafeOpenUrl, panToCaret } from '../../core/notesView';
import { screenToWorld, worldToScreen } from '../../core/viewport';
import { handleWheel } from '../../input/pointer';
import { setNotes, setNotesBounds } from '../../state/actions';
import { registerNotesHost } from '../../state/notesHost';
import { getState, setViewport } from '../../state/store';
import { TID } from '../../testids';
import type { NotesDoc, NotesJSON, Point } from '../../types';
import { useAppState } from '../hooks';
import { createNotesExtensions } from './editor';
import { LinkPrompt, openLinkPrompt } from './LinkPrompt';
import { NotesMenus } from './NotesMenus';
import type { LinkPromptState } from './LinkPrompt';
import { attachNotesTouchPan } from './touchPan';

const EMPTY_DOC: NotesJSON = { type: 'doc', content: [{ type: 'paragraph' }] };
const EDITOR_PROPS = { attributes: { class: 'notes-editor', 'data-testid': TID.notesEditor, tabindex: '-1', spellcheck: 'true' } };

function readCaret(boardId: string): number | null {
  try {
    const raw = window.localStorage.getItem(NOTES_CARET_KEY + boardId);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
function writeCaret(boardId: string, pos: number): void {
  try {
    window.localStorage.setItem(NOTES_CARET_KEY + boardId, String(pos));
  } catch {
    /* storage may be unavailable */
  }
}

/** The editor is keyed by the board id: a page switch builds a fresh editor (and so a fresh undo history) from the store's notes. */
export function NotesLayer() {
  const boardId = useAppState((s) => s.board?.id ?? null);
  if (!boardId) return null;
  return <NotesEditor key={boardId} boardId={boardId} />;
}

function NotesEditor(props: { boardId: string }) {
  const { boardId } = props;
  const viewport = useAppState((s) => s.viewport);
  const active = useAppState((s) => s.notesActive);
  const width = useAppState((s) => s.notes?.width ?? NOTES_WIDTH);
  const layerRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  /** The last notes object this editor wrote to, or read from, the store. Anything else in the store is an external replacement. */
  const synced = useRef<NotesDoc | null>(getState().notes);
  const widthRef = useRef(width);
  widthRef.current = width;
  const [linkPrompt, setLinkPrompt] = useState<LinkPromptState | null>(null);
  const editorRef = useRef<Editor | null>(null);

  const extensions = useMemo(
    () => createNotesExtensions({ onLinkShortcut: () => { if (editorRef.current) setLinkPrompt(openLinkPrompt(editorRef.current)); } }),
    [],
  );

  /** Pans (never zooms) so the caret line is visible. */
  function ensureCaretVisible(editor: Editor): void {
    const layer = layerRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const c = editor.view.coordsAtPos(editor.state.selection.head);
    const v = getState().viewport;
    const topLeft = screenToWorld({ x: c.left - rect.left, y: c.top - rect.top }, v);
    const bottom = screenToWorld({ x: c.left - rect.left, y: c.bottom - rect.top }, v);
    setViewport(panToCaret(v, { x: topLeft.x, top: topLeft.y, bottom: bottom.y }, getState().viewportSize));
  }

  // Options that are compared by identity on every render (content, editorProps) must be stable, or Tiptap re-applies them each time.
  const initialContent = useRef((getState().notes?.doc ?? EMPTY_DOC) as JSONContent).current;
  const editor = useEditor({
    extensions,
    content: initialContent,
    editorProps: EDITOR_PROPS,
    onUpdate: ({ editor: ed }) => {
      const next: NotesDoc = { width: widthRef.current, doc: ed.getJSON() as NotesJSON };
      synced.current = next;
      setNotes(next);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      if (!ed.isFocused || !getState().notesActive) return;
      writeCaret(boardId, ed.state.selection.head);
      ensureCaretVisible(ed);
    },
  });
  editorRef.current = editor;

  // An external replacement of the notes (conflict reload, keep mine, replaceScene) goes into the editor without echoing and without undo.
  const notes = useAppState((s) => s.notes);
  useEffect(() => {
    if (!editor || notes === synced.current) return;
    synced.current = notes;
    editor.chain().setMeta('addToHistory', false).setContent((notes?.doc ?? EMPTY_DOC) as JSONContent, { emitUpdate: false }).run();
  }, [notes, editor]);

  // Register with the actions layer (enter / leave notes mode).
  useEffect(() => {
    if (!editor) return;
    registerNotesHost({
      focusAt(world: Point | null) {
        const view = editor.view;
        const layer = layerRef.current;
        const docSize = editor.state.doc.content.size;
        let pos: number;
        if (world && layer) {
          const rect = layer.getBoundingClientRect();
          const s = worldToScreen(world, getState().viewport);
          const hit = isBelowNotes(world, getState().notesBounds) ? null : view.posAtCoords({ left: rect.left + s.x, top: rect.top + s.y });
          pos = hit ? hit.pos : docSize;
        } else {
          pos = clampCaret(readCaret(boardId), docSize, docSize);
        }
        const tr = editor.state.tr.setSelection(Selection.near(editor.state.doc.resolve(clampCaret(pos, docSize)), 1));
        view.dispatch(tr);
        view.focus();
        ensureCaretVisible(editor);
        writeCaret(boardId, editor.state.selection.head);
      },
      blur() {
        // ProseMirror reads native caret moves (arrows, End) asynchronously; flush them so the saved caret is current.
        try {
          (editor.view as unknown as { domObserver?: { flush?: () => void } }).domObserver?.flush?.();
        } catch {
          /* internal API; the saved caret may then lag by one move */
        }
        if (editor.isFocused) writeCaret(boardId, editor.state.selection.head);
        setLinkPrompt(null);
        editor.commands.blur();
      },
    });
    return () => registerNotesHost(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, boardId]);

  // Wheel over the column pans or zooms the page (React's onWheel is passive); touch pans too.
  useEffect(() => {
    const column = columnRef.current;
    const layer = layerRef.current;
    if (!column || !layer) return;
    column.addEventListener('wheel', handleWheel, { passive: false });
    const detachTouch = attachNotesTouchPan(column, layer);
    return () => {
      column.removeEventListener('wheel', handleWheel);
      detachTouch();
    };
  }, []);

  // The rendered column's world rect feeds zoom to fit and "Back to content".
  useEffect(() => {
    const column = columnRef.current;
    if (!column || typeof ResizeObserver === 'undefined') return;
    const measure = (): void => setNotesBounds({ x: NOTES_X, y: NOTES_Y, width: widthRef.current, height: column.offsetHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(column);
    measure();
    return () => {
      ro.disconnect();
      setNotesBounds(null);
    };
  }, []);

  // Closing notes mode closes the link prompt.
  useEffect(() => {
    if (!active) setLinkPrompt(null);
  }, [active]);

  /** Web links: a plain click opens one while notes mode is off; in notes mode only Ctrl/Cmd+click does (a plain click edits). */
  function onColumnClick(e: ReactMouseEvent<HTMLDivElement>): void {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    const a = e.target.closest('a[href]');
    if (!a || !e.currentTarget.contains(a)) return;
    if (getState().notesActive && !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    if (isSafeOpenUrl(href)) window.open(href as string, '_blank', 'noopener,noreferrer');
  }
  /** The tooltip carries the URL plus a hint; set on hover so it follows the mode. */
  function onColumnMouseOver(e: ReactMouseEvent<HTMLDivElement>): void {
    if (!(e.target instanceof Element)) return;
    const a = e.target.closest('a[href]');
    const href = a?.getAttribute('href');
    if (!a || !href) return;
    a.setAttribute('title', getState().notesActive ? `${href}\nCtrl+click to open` : href);
  }

  const origin = worldToScreen({ x: NOTES_X, y: NOTES_Y }, viewport);
  const style: CSSProperties = {
    left: origin.x,
    top: origin.y,
    width,
    transform: `scale(${viewport.zoom})`,
    transformOrigin: '0 0',
  };
  const empty = isNotesEmpty(notes);

  return (
    <div ref={layerRef} className="notes-layer" data-testid={TID.notesLayer} data-active={active ? 'true' : 'false'}>
      <div
        ref={columnRef}
        className={`notes-column${active ? ' active' : ''}`}
        data-testid={TID.notesColumn}
        data-empty={empty ? 'true' : 'false'}
        style={style}
        onClick={onColumnClick}
        onMouseOver={onColumnMouseOver}
      >
        <EditorContent editor={editor} />
      </div>
      {editor && <NotesMenus editor={editor} onLinkPrompt={(ed) => setLinkPrompt(openLinkPrompt(ed))} />}
      {editor && linkPrompt && <LinkPrompt editor={editor} state={linkPrompt} onClose={() => setLinkPrompt(null)} />}
    </div>
  );
}
