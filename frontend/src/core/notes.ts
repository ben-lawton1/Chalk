// Page notes (v4): defensive restore of a notes document read from a file, plus plain-text and emptiness helpers.
import type { NotesDoc, NotesJSON } from '../types';
import { NOTES_MAX_DEPTH, NOTES_MAX_NODES, NOTES_MAX_TEXT_LENGTH, NOTES_MAX_WIDTH, NOTES_MIN_WIDTH } from '../constants';
import { clamp } from './math';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** JSON-safe deep copy of attrs; null when it holds anything that is not JSON data (or nests too deep). */
function copyJsonValue(v: unknown, depth: number): unknown {
  if (depth > NOTES_MAX_DEPTH) throw new Error('too deep');
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('bad number');
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => copyJsonValue(x, depth + 1));
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = copyJsonValue(x, depth + 1);
    return out;
  }
  throw new Error('not json');
}

function copyAttrs(raw: unknown): Record<string, unknown> {
  return copyJsonValue(raw, 0) as Record<string, unknown>;
}

interface Budget { nodes: number; text: number }

/** Copies one node, enforcing the depth, node-count and text-length limits. Throws on anything malformed. */
function copyNode(raw: unknown, depth: number, budget: Budget): NotesJSON {
  if (depth > NOTES_MAX_DEPTH) throw new Error('too deep');
  if (!isPlainObject(raw) || typeof raw.type !== 'string' || raw.type === '') throw new Error('bad node');
  if (++budget.nodes > NOTES_MAX_NODES) throw new Error('too many nodes');
  const out: NotesJSON = { type: raw.type };
  if (raw.attrs !== undefined) {
    if (!isPlainObject(raw.attrs)) throw new Error('bad attrs');
    out.attrs = copyAttrs(raw.attrs);
  }
  if (raw.text !== undefined) {
    if (typeof raw.text !== 'string') throw new Error('bad text');
    budget.text += raw.text.length;
    if (budget.text > NOTES_MAX_TEXT_LENGTH) throw new Error('too much text');
    out.text = raw.text;
  }
  if (raw.content !== undefined) {
    if (!Array.isArray(raw.content)) throw new Error('bad content');
    out.content = raw.content.map((c) => copyNode(c, depth + 1, budget));
  }
  if (raw.marks !== undefined) {
    if (!Array.isArray(raw.marks)) throw new Error('bad marks');
    out.marks = raw.marks.map((m) => {
      if (!isPlainObject(m) || typeof m.type !== 'string') throw new Error('bad mark');
      if (m.attrs === undefined) return { type: m.type };
      if (!isPlainObject(m.attrs)) throw new Error('bad mark attrs');
      return { type: m.type, attrs: copyAttrs(m.attrs) };
    });
  }
  return out;
}

/**
 * Validates `raw` (the `notes` field of a scene file) and returns a clean deep copy, or null for anything unusable: a
 * non-object, a doc that is not `{ type: 'doc' }`, a non-finite width, or a document over the depth, size or text limits.
 * Never throws. Unknown node types are kept: the editor drops them when it loads the document.
 */
export function restoreNotes(raw: unknown): NotesDoc | null {
  if (!isPlainObject(raw) || typeof raw.width !== 'number' || !Number.isFinite(raw.width)) return null;
  if (!isPlainObject(raw.doc) || raw.doc.type !== 'doc') return null;
  try {
    const doc = copyNode(raw.doc, 0, { nodes: 0, text: 0 });
    return { width: clamp(raw.width, NOTES_MIN_WIDTH, NOTES_MAX_WIDTH), doc };
  } catch {
    return null;
  }
}

const INLINE_TYPES: ReadonlySet<string> = new Set(['text', 'hardBreak', 'pageLink']);

function nodeText(n: NotesJSON): string {
  if (typeof n.text === 'string') return n.text;
  if (n.type === 'hardBreak') return '\n';
  if (n.type === 'pageLink') return typeof n.attrs?.label === 'string' ? n.attrs.label : '';
  const kids = n.content ?? [];
  if (kids.every((k) => INLINE_TYPES.has(k.type))) return kids.map(nodeText).join('');
  return kids.map(nodeText).join('\n');
}

/** Plain text of a notes document: one line per text block (list items, table cells and so on included), joined by `\n`. */
export function notesText(notes: NotesDoc | null): string {
  if (!notes) return '';
  return (notes.doc.content ?? []).map(nodeText).join('\n');
}

/** True when the notes hold nothing visible: no document, or only empty paragraphs. */
export function isNotesEmpty(notes: NotesDoc | null): boolean {
  if (!notes) return true;
  return (notes.doc.content ?? []).every((n) => n.type === 'paragraph' && notesText({ width: notes.width, doc: { type: 'doc', content: [n] } }) === '');
}
