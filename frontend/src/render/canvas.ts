// Canvas backing-store setup, rAF frame scheduling and whenRendered() (WP2).

export interface FrameScheduler { request(): void; cancel(): void }

/** Schedulers that currently have a frame queued. */
const pending = new Set<FrameScheduler>();

/** Sizes the backing store to cssW x cssH at `dpr` and the CSS box to cssW x cssH px. */
export function setupCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number, dpr: number): CanvasRenderingContext2D {
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  return canvas.getContext('2d')!;
}

/** Coalesces request() calls into one requestAnimationFrame that runs draw() once (errors are logged, never thrown). */
export function createFrameScheduler(draw: () => void): FrameScheduler {
  let handle: number | null = null;
  const scheduler: FrameScheduler = {
    request() {
      if (handle !== null) return;
      pending.add(scheduler);
      handle = requestAnimationFrame(() => {
        handle = null;
        pending.delete(scheduler);
        try {
          draw();
        } catch (err) {
          console.error('frame draw failed', err);
        }
      });
    },
    cancel() {
      if (handle !== null) {
        cancelAnimationFrame(handle);
        handle = null;
      }
      pending.delete(scheduler);
    },
  };
  return scheduler;
}

/**
 * Resolves on the first animation frame, queued after the pending draws, in which no scheduler
 * has a frame pending. Draws that request further draws are waited for too.
 */
export function whenRendered(): Promise<void> {
  return new Promise<void>((resolve) => {
    const check = (): void => {
      if (pending.size === 0) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}
