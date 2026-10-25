// Interactive-layer overlay: hover, selection, handles, bind target, drop preview, marquee, all in screen space (WP2).
import type { ChalkElement, Interaction, Outline, Rect, Viewport } from '../types';
import { ENDPOINT_RADIUS_PX, HANDLE_SIZE_PX, SELECTION_COLOR, SELECTION_PADDING_PX } from '../constants';
import { worldToScreen } from '../core/viewport';
import { SHAPES } from '../core/shapes';
import { getBounds, getHandleMode, getHandlePositions, getOutline, getSelectionBox, isBindable } from '../core/geometry';
import { indexById } from '../core/binding';

export interface OverlayInput {
  elements: readonly ChalkElement[]; selectedIds: readonly string[]; viewport: Viewport;
  interaction: Interaction; editingId: string | null; dpr: number; width: number; height: number;
}

const MARQUEE_FILL = 'rgba(79,124,255,0.08)';

/** Rect in world units to a screen-space rect. */
function toScreenRect(r: Rect, v: Viewport): Rect {
  const tl = worldToScreen({ x: r.x, y: r.y }, v);
  return { x: tl.x, y: tl.y, width: r.width * v.zoom, height: r.height * v.zoom };
}

/** Adds the outline (world) to the current path in screen space. */
function pathOutline(ctx: CanvasRenderingContext2D, o: Outline, v: Viewport): void {
  ctx.beginPath();
  if (o.kind === 'ellipse') {
    const c = worldToScreen({ x: o.cx, y: o.cy }, v);
    ctx.ellipse(c.x, c.y, Math.abs(o.rx * v.zoom), Math.abs(o.ry * v.zoom), 0, 0, Math.PI * 2);
    return;
  }
  o.points.forEach((p, i) => {
    const s = worldToScreen(p, v);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
}

/** Adds the visual outline of any element (shape outline, text bounds, arrow segment) to the path. */
function pathElement(ctx: CanvasRenderingContext2D, el: ChalkElement, v: Viewport): void {
  if (el.type === 'arrow') {
    const a = worldToScreen(el.start, v);
    const b = worldToScreen(el.end, v);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  } else if (el.type === 'shape') {
    pathOutline(ctx, SHAPES[el.shape].outline({ x: el.x, y: el.y, width: el.width, height: el.height }), v);
  } else {
    const r = toScreenRect(getBounds(el), v);
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.width, r.height);
  }
}

/** Draws everything that is not scene content. Clears the layer first. */
export function drawOverlay(ctx: CanvasRenderingContext2D, input: OverlayInput): void {
  const { elements, selectedIds, viewport: v, interaction, editingId, dpr } = input;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const byId = indexById(elements);
  const sel = selectedIds.filter((id) => id !== editingId && byId.has(id));
  const selSet = new Set(sel);

  // 1. Hover.
  const hover = interaction.hoverId !== null ? byId.get(interaction.hoverId) : undefined;
  if (hover && !selSet.has(hover.id) && hover.id !== editingId) {
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1;
    pathElement(ctx, hover, v);
    ctx.stroke();
    ctx.restore();
  }

  // 2. Selection.
  if (sel.length > 0) {
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    if (sel.length >= 2) {
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      for (const id of sel) {
        const r = toScreenRect(getBounds(byId.get(id)!), v);
        ctx.strokeRect(r.x - SELECTION_PADDING_PX, r.y - SELECTION_PADDING_PX, r.width + 2 * SELECTION_PADDING_PX, r.height + 2 * SELECTION_PADDING_PX);
      }
      ctx.setLineDash([]);
    }
    const mode = getHandleMode(elements, sel);
    if (mode === 'box' || mode === 'text') {
      const box = getSelectionBox(elements, sel);
      if (box) {
        const r = toScreenRect(box, v);
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x - SELECTION_PADDING_PX, r.y - SELECTION_PADDING_PX, r.width + 2 * SELECTION_PADDING_PX, r.height + 2 * SELECTION_PADDING_PX);
        // getHandlePositions applies the selection padding itself, so it takes the unpadded box.
        const positions = getHandlePositions(box, v, mode);
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        for (const p of Object.values(positions)) {
          if (!p) continue;
          ctx.beginPath();
          ctx.rect(p.x - HANDLE_SIZE_PX / 2, p.y - HANDLE_SIZE_PX / 2, HANDLE_SIZE_PX, HANDLE_SIZE_PX);
          ctx.fill();
          ctx.stroke();
        }
      }
    } else if (mode === 'endpoints') {
      const arrow = byId.get(sel[0]!);
      if (arrow && arrow.type === 'arrow') {
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        for (const pt of [arrow.start, arrow.end]) {
          const s = worldToScreen(pt, v);
          ctx.beginPath();
          ctx.arc(s.x, s.y, ENDPOINT_RADIUS_PX, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // 3. Binding target highlight.
  const bt = interaction.bindTarget;
  const target = bt ? byId.get(bt.elementId) : undefined;
  if (bt && target && isBindable(target)) {
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.35;
    pathOutline(ctx, getOutline(target), v);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const f = worldToScreen(bt.focus, v);
    ctx.fillStyle = SELECTION_COLOR;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 4. Palette drop preview.
  const dp = interaction.dropPreview;
  if (dp) {
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    pathOutline(ctx, SHAPES[dp.kind].outline(dp.rect), v);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Marquee.
  const m = interaction.marquee;
  if (m) {
    const r = toScreenRect(m, v);
    ctx.save();
    ctx.fillStyle = MARQUEE_FILL;
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    ctx.restore();
  }
}
