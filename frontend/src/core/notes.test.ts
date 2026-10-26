// Unit tests for core/notes: plain text and emptiness helpers (v4).
import { describe, expect, it } from 'vitest';
import type { NotesDoc, NotesJSON } from '../types';
import { isNotesEmpty, notesText } from './notes';

const p = (...text: string[]): NotesJSON => ({ type: 'paragraph', ...(text.length ? { content: text.map((t) => ({ type: 'text', text: t })) } : {}) });
const doc = (...content: NotesJSON[]): NotesDoc => ({ width: 760, doc: { type: 'doc', content } });

describe('notesText', () => {
  it('is empty for null and for an empty doc', () => {
    expect(notesText(null)).toBe('');
    expect(notesText({ width: 760, doc: { type: 'doc' } })).toBe('');
  });
  it('joins top-level blocks with a newline and concatenates inline runs', () => {
    expect(notesText(doc(p('Hello ', 'world'), p(), p('bye')))).toBe('Hello world\n\nbye');
  });
  it('walks lists, hard breaks and page links', () => {
    const list: NotesJSON = { type: 'bulletList', content: [
      { type: 'listItem', content: [p('one')] }, { type: 'listItem', content: [p('two')] },
    ] };
    const para: NotesJSON = { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'pageLink', attrs: { id: 'x', label: 'Page' } }] };
    expect(notesText(doc(list, para))).toBe('one\ntwo\na\nPage');
  });
});

describe('isNotesEmpty', () => {
  it('is true for null, an empty doc and empty paragraphs', () => {
    expect(isNotesEmpty(null)).toBe(true);
    expect(isNotesEmpty({ width: 760, doc: { type: 'doc' } })).toBe(true);
    expect(isNotesEmpty(doc(p(), p()))).toBe(true);
  });
  it('is false with text or any other block', () => {
    expect(isNotesEmpty(doc(p('x')))).toBe(false);
    expect(isNotesEmpty(doc({ type: 'horizontalRule' }))).toBe(false);
    expect(isNotesEmpty(doc({ type: 'heading', attrs: { level: 1 } }))).toBe(false);
  });
});
