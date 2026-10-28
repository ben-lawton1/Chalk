// The slash menu's command registry (data-driven: adding a command is one entry in SLASH_COMMANDS), plus the pure pieces that are unit
// tested: the filter and ranking, and the `/table 4x5` argument parser.
import type { Editor, Range } from '@tiptap/core';
import { TABLE_MAX_COLS, TABLE_MAX_ROWS } from '../../constants';

export type CommandGroup = 'Basic blocks' | 'Code and data' | 'Links' | 'Style';
export const COMMAND_GROUPS: readonly CommandGroup[] = ['Basic blocks', 'Code and data', 'Links', 'Style'];

/** What a command may ask of the menu (things only the UI can do). */
export interface SlashContext {
  /** Switch the menu in place to the table size step. */
  openTableStep(): void;
  /** Open the inline URL prompt at the caret. */
  openLinkPrompt(): void;
  /** Create a page in the current section (not opened) and insert a link to it at the caret. */
  newPage(): void;
}

export interface SlashCommand {
  id: string;
  title: string;
  /** Extra names the filter matches, without the slash. */
  aliases: readonly string[];
  group: CommandGroup;
  /** A short glyph shown in the row's icon tile. */
  icon: string;
  description: string;
  /** Runs after the user picks the command. It must delete the `/query` range itself (see `startFrom`). */
  run(editor: Editor, range: Range, ctx: SlashContext): void;
}

/** A chain that has focused the editor and removed the `/query` text: the starting point of most commands. */
function startFrom(editor: Editor, range: Range) {
  return editor.chain().focus().deleteRange(range);
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  // Basic blocks
  { id: 'text', title: 'Text', aliases: ['p', 'paragraph', 'plain'], group: 'Basic blocks', icon: 'T', description: 'Plain text',
    run: (e, r) => startFrom(e, r).setParagraph().run() },
  { id: 'h1', title: 'Heading 1', aliases: ['h1', 'heading', 'title', 'h'], group: 'Basic blocks', icon: 'H1', description: 'Big section heading',
    run: (e, r) => startFrom(e, r).setNode('heading', { level: 1 }).run() },
  { id: 'h2', title: 'Heading 2', aliases: ['h2', 'heading', 'subtitle'], group: 'Basic blocks', icon: 'H2', description: 'Medium section heading',
    run: (e, r) => startFrom(e, r).setNode('heading', { level: 2 }).run() },
  { id: 'h3', title: 'Heading 3', aliases: ['h3', 'heading', 'subheading'], group: 'Basic blocks', icon: 'H3', description: 'Small section heading',
    run: (e, r) => startFrom(e, r).setNode('heading', { level: 3 }).run() },
  { id: 'bullet', title: 'Bulleted list', aliases: ['bullet', 'ul', 'list', 'unordered'], group: 'Basic blocks', icon: '•', description: 'A simple bulleted list',
    run: (e, r) => startFrom(e, r).toggleBulletList().run() },
  { id: 'numbered', title: 'Numbered list', aliases: ['numbered', 'ol', 'list', 'ordered'], group: 'Basic blocks', icon: '1.', description: 'A list with numbering',
    run: (e, r) => startFrom(e, r).toggleOrderedList().run() },
  { id: 'todo', title: 'To-do list', aliases: ['todo', 'task', 'checkbox', 'check'], group: 'Basic blocks', icon: '☑', description: 'Track tasks with checkboxes',
    run: (e, r) => startFrom(e, r).toggleTaskList().run() },
  { id: 'toggle', title: 'Toggle list', aliases: ['toggle', 'details', 'collapse'], group: 'Basic blocks', icon: '▸', description: 'Hide and show content inside',
    run: (e, r) => startFrom(e, r).setDetails().run() },
  { id: 'quote', title: 'Quote', aliases: ['quote', 'blockquote', 'citation'], group: 'Basic blocks', icon: '❝', description: 'Capture a quote',
    run: (e, r) => startFrom(e, r).setBlockquote().run() },
  { id: 'divider', title: 'Divider', aliases: ['divider', 'hr', 'rule', 'line', 'separator'], group: 'Basic blocks', icon: '―', description: 'Visually divide blocks',
    run: (e, r) => startFrom(e, r).setHorizontalRule().run() },
  { id: 'callout', title: 'Callout', aliases: ['callout', 'note', 'info', 'tip'], group: 'Basic blocks', icon: '💡', description: 'Make writing stand out',
    run: (e, r) => startFrom(e, r).toggleCallout().run() },

  // Code and data
  { id: 'code', title: 'Code block', aliases: ['code', 'codeblock', 'snippet', 'pre'], group: 'Code and data', icon: '</>', description: 'A block of code with highlighting',
    run: (e, r) => startFrom(e, r).setCodeBlock().run() },
  { id: 'inline', title: 'Inline code', aliases: ['inline', 'inlinecode', 'mono', 'code'], group: 'Code and data', icon: '`', description: 'Wrap the selection, or code for the next typed text',
    // With a selection the mark wraps it; otherwise the stored mark makes the next typed text code (it ends at the next ` or Ctrl+E).
    run: (e, r) => startFrom(e, r).setMark('code').run() },
  { id: 'table', title: 'Table', aliases: ['table', 'grid', 'rows', 'columns'], group: 'Code and data', icon: '▦', description: 'Rows and columns; type /table 4x5 for a size',
    run: (_e, _r, ctx) => ctx.openTableStep() },

  // Links
  { id: 'page', title: 'Link to page', aliases: ['page', 'link', 'mention', 'at'], group: 'Links', icon: '@', description: 'Link to another page',
    run: (e, r) => startFrom(e, r).insertContent('@').run() },
  { id: 'newpage', title: 'New page', aliases: ['newpage', 'new', 'createpage', 'add'], group: 'Links', icon: '+', description: 'Create a page here and link to it',
    run: (e, r, ctx) => { startFrom(e, r).run(); ctx.newPage(); } },
  { id: 'url', title: 'Web link', aliases: ['url', 'link', 'web', 'http', 'href'], group: 'Links', icon: '🔗', description: 'Link to a web address',
    run: (e, r, ctx) => { startFrom(e, r).run(); ctx.openLinkPrompt(); } },

  // Style
  { id: 'highlight', title: 'Highlight', aliases: ['highlight', 'mark', 'marker'], group: 'Style', icon: 'H', description: 'Highlight text',
    run: (e, r) => startFrom(e, r).toggleHighlight().run() },
  { id: 'bold', title: 'Bold', aliases: ['bold', 'strong', 'b'], group: 'Style', icon: 'B', description: 'Bold text',
    run: (e, r) => startFrom(e, r).toggleBold().run() },
  { id: 'italic', title: 'Italic', aliases: ['italic', 'emphasis', 'em', 'i'], group: 'Style', icon: 'I', description: 'Italic text',
    run: (e, r) => startFrom(e, r).toggleItalic().run() },
  { id: 'strike', title: 'Strikethrough', aliases: ['strike', 'strikethrough', 'del', 'cross'], group: 'Style', icon: 'S', description: 'Strike through text',
    run: (e, r) => startFrom(e, r).toggleStrike().run() },
];

// ---------------------------------------------------------------------------
// Filter and ranking (pure)
// ---------------------------------------------------------------------------

export interface Searchable {
  title: string;
  aliases: readonly string[];
}

/** Lower rank is better: 0 exact title or alias, 1 title prefix, 2 alias prefix, 3 word of the title starts with it, 4 inside the title, 5 inside an alias. */
function rankOf(c: Searchable, q: string): number | null {
  const title = c.title.toLowerCase();
  const aliases = c.aliases.map((a) => a.toLowerCase());
  if (title === q || aliases.includes(q)) return 0;
  if (title.startsWith(q)) return 1;
  if (aliases.some((a) => a.startsWith(q))) return 2;
  if (title.split(/\s+/).some((w) => w.startsWith(q))) return 3;
  if (title.includes(q)) return 4;
  if (aliases.some((a) => a.includes(q))) return 5;
  return null;
}

function rankAll<T extends Searchable>(commands: readonly T[], q: string): T[] {
  const scored: { c: T; rank: number; index: number }[] = [];
  commands.forEach((c, index) => {
    const rank = rankOf(c, q);
    if (rank !== null) scored.push({ c, rank, index });
  });
  scored.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return scored.map((s) => s.c);
}

/**
 * The commands that match what was typed after the `/`, best first (registry order breaks ties). Matching is case-insensitive on the title
 * and the aliases. An empty query returns everything in registry order. A query with spaces is tried whole first ("heading 1"), then by its
 * first word, so `table 4x5` still finds Table.
 */
export function filterCommands<T extends Searchable>(commands: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (q === '') return [...commands];
  const whole = rankAll(commands, q);
  if (whole.length > 0 || !q.includes(' ')) return whole;
  return rankAll(commands, q.split(' ')[0] ?? q);
}

// ---------------------------------------------------------------------------
// /table arguments (pure)
// ---------------------------------------------------------------------------

export interface TableSize {
  rows: number;
  cols: number;
}

/** An integer in [1, max]; anything unusable (NaN, 0, negative) becomes 1. */
export function clampTableDim(n: number, max: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.trunc(n), 1), max);
}

export function clampTableSize(rows: number, cols: number): TableSize {
  return { rows: clampTableDim(rows, TABLE_MAX_ROWS), cols: clampTableDim(cols, TABLE_MAX_COLS) };
}

/**
 * `table 4x5`, `table 4 x 5`, `table 4×5` and `table 4 5` (rows, then columns) typed after the slash. Returns the clamped size, or null
 * when the query is not that form. Huge numbers are clamped to TABLE_MAX_ROWS x TABLE_MAX_COLS.
 */
export function parseTableArgs(query: string): TableSize | null {
  const m = /^\s*table\s+(\d{1,9})(?:\s*[x×]\s*|\s+)(\d{1,9})\s*$/i.exec(query);
  if (!m) return null;
  return clampTableSize(Number(m[1]), Number(m[2]));
}
