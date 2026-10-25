// PNG and JSON export/import, drawn by the same drawScene as the live canvas (WP2).
import type { ChalkElement, Rect } from '../types';
import { EXPORT_PADDING, EXPORT_SCALE, MAX_CANVAS_SIDE } from '../constants';
import { expandRect } from '../core/math';
import { getCommonBounds } from '../core/geometry';
import { SceneParseError, parseSceneFile, toSceneFile } from '../core/serialize';
import { drawScene } from './drawScene';

interface FrameOptions { scale?: number; padding?: number }
interface RenderOptions extends FrameOptions { background?: string | null }

/** Padded content bounds and the pixel scale to render them at (reduced to fit MAX_CANVAS_SIDE). Null for no elements. */
export function computeExportFrame(elements: readonly ChalkElement[], o: FrameOptions = {}): { bounds: Rect; scale: number } | null {
  const common = elements.length > 0 ? getCommonBounds(elements) : null;
  if (!common) return null;
  const bounds = expandRect(common, o.padding ?? EXPORT_PADDING);
  let scale = o.scale ?? EXPORT_SCALE;
  const longest = Math.max(bounds.width, bounds.height);
  if (longest * scale > MAX_CANVAS_SIDE) scale = MAX_CANVAS_SIDE / longest;
  return { bounds, scale };
}

/** Renders the whole scene to a new canvas (white background unless `background` says otherwise). Null if empty. */
export function renderToCanvas(elements: readonly ChalkElement[], o: RenderOptions = {}): HTMLCanvasElement | null {
  const frame = computeExportFrame(elements, o);
  if (!frame) return null;
  const { bounds, scale } = frame;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(bounds.width * scale));
  canvas.height = Math.max(1, Math.ceil(bounds.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawScene(ctx, elements, {
    viewport: { scrollX: -bounds.x, scrollY: -bounds.y, zoom: 1 },
    dpr: scale,
    width: bounds.width,
    height: bounds.height,
    background: o.background === undefined ? '#ffffff' : o.background,
    grid: false,
    hiddenTextId: null,
  });
  return canvas;
}

export function exportPngBlob(elements: readonly ChalkElement[], o: RenderOptions = {}): Promise<Blob | null> {
  const canvas = renderToCanvas(elements, o);
  if (!canvas) return Promise.resolve(null);
  return new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
}

/** Downloads `<name>.png`. Returns false when there is nothing to export. */
export async function exportPng(elements: readonly ChalkElement[], name: string): Promise<boolean> {
  const blob = await exportPngBlob(elements);
  if (!blob) return false;
  downloadBlob(blob, `${safeFileName(name)}.png`);
  return true;
}

/** Downloads `<name>.chalk.json`, a pretty-printed SceneFile. */
export function exportSceneJson(elements: readonly ChalkElement[], name: string): void {
  const json = JSON.stringify(toSceneFile(elements), null, 2);
  downloadBlob(new Blob([json], { type: 'application/json' }), `${safeFileName(name)}.chalk.json`);
}

/** Reads and validates a scene file. Throws SceneParseError for anything unusable. */
export async function importSceneJson(file: File): Promise<ChalkElement[]> {
  const text = await file.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SceneParseError('File is not valid JSON');
  }
  return parseSceneFile(json);
}

/** Saves a blob through a temporary <a download>; the object URL is revoked after 1s. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File-system safe base name: unsafe characters become `_`, whitespace becomes `-`, max 80 chars, never empty. */
export function safeFileName(name: string): string {
  const cleaned = name.trim().replace(/[^A-Za-z0-9 _.-]/g, '_').replace(/\s+/g, '-').slice(0, 80);
  return cleaned === '' ? 'chalk' : cleaned;
}
