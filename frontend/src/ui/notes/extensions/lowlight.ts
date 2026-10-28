// The fixed syntax-highlighting language set for notes code blocks (kept small so the bundle stays small).
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

export const NOTES_LANGUAGES = [
  'plaintext', 'bash', 'shell', 'powershell', 'javascript', 'typescript', 'json', 'python', 'go', 'rust', 'sql', 'css', 'xml', 'yaml', 'markdown', 'diff',
] as const;

export const lowlight = createLowlight({
  plaintext, bash, shell, powershell, javascript, typescript, json, python, go, rust, sql, css, xml, yaml, markdown, diff,
});
// Common aliases people type after ```
lowlight.registerAlias({ bash: ['sh', 'zsh'], shell: ['console'], powershell: ['ps1', 'pwsh'], javascript: ['js'], typescript: ['ts'], python: ['py'], xml: ['html'], yaml: ['yml'], markdown: ['md'], plaintext: ['text', 'txt'] });
