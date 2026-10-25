// Canvas host: two stacked canvases (static scene + interactive overlay), sizing, DPR, redraw scheduling (WP2).
import { useEffect, useRef } from 'react';
import { CANVAS_BACKGROUND, SHOW_GRID } from '../constants';
import { TID } from '../testids';
import { getState, setState, subscribe } from '../state/store';
import { attachPointerInput } from '../input/pointer';
import { createFrameScheduler, setupCanvas } from '../render/canvas';
import { clearTextMetricsCache, drawScene } from '../render/drawScene';
import { drawOverlay } from '../render/drawOverlay';

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const staticRef = useRef<HTMLCanvasElement>(null);
  const interactiveRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const staticCanvas = staticRef.current;
    const interactiveCanvas = interactiveRef.current;
    if (!container || !staticCanvas || !interactiveCanvas) return undefined;

    let dpr = window.devicePixelRatio || 1;
    let width = 0;
    let height = 0;
    let staticCtx: CanvasRenderingContext2D | null = null;
    let overlayCtx: CanvasRenderingContext2D | null = null;

    // Both draw functions read the store at draw time, never a stale closure.
    const staticLayer = createFrameScheduler(() => {
      if (!staticCtx) return;
      const s = getState();
      drawScene(staticCtx, s.elements, {
        viewport: s.viewport, dpr, width, height, background: CANVAS_BACKGROUND, grid: SHOW_GRID,
        hiddenTextId: s.editing?.id ?? null,
      });
    });
    const overlayLayer = createFrameScheduler(() => {
      if (!overlayCtx) return;
      const s = getState();
      drawOverlay(overlayCtx, {
        elements: s.elements, selectedIds: s.selectedIds, viewport: s.viewport, interaction: s.interaction,
        editingId: s.editing?.id ?? null, dpr, width, height,
      });
    });
    const requestBoth = (): void => {
      staticLayer.request();
      overlayLayer.request();
    };

    /** Measures the container and resizes both backing stores. */
    const layout = (): void => {
      dpr = window.devicePixelRatio || 1;
      width = container.clientWidth;
      height = container.clientHeight;
      staticCtx = setupCanvas(staticCanvas, width, height, dpr);
      overlayCtx = setupCanvas(interactiveCanvas, width, height, dpr);
      const size = getState().viewportSize;
      if (size.width !== width || size.height !== height) setState({ viewportSize: { width, height } });
      requestBoth();
    };
    layout();

    let detachPointer: () => void = () => {};
    try {
      detachPointer = attachPointerInput(interactiveCanvas);
    } catch (err) {
      console.error('Canvas: attachPointerInput failed', err);
    }

    const observer = new ResizeObserver(layout);
    observer.observe(container);

    // A DPR change (browser zoom, moving between monitors) does not resize the container.
    let dprQuery: MediaQueryList | null = null;
    const onDprChange = (): void => {
      layout();
      armDprListener();
    };
    function armDprListener(): void {
      dprQuery?.removeEventListener('change', onDprChange);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      dprQuery.addEventListener('change', onDprChange);
    }
    armDprListener();

    const onFontsLoaded = (): void => {
      clearTextMetricsCache();
      requestBoth();
    };
    document.fonts?.addEventListener?.('loadingdone', onFontsLoaded);

    const unsubscribe = subscribe((next, prev) => {
      const sceneChanged = next.elements !== prev.elements || next.viewport !== prev.viewport
        || next.viewportSize !== prev.viewportSize || next.editing !== prev.editing;
      if (sceneChanged) staticLayer.request();
      if (sceneChanged || next.selectedIds !== prev.selectedIds || next.interaction !== prev.interaction) overlayLayer.request();
    });

    requestBoth();

    return () => {
      unsubscribe();
      detachPointer();
      observer.disconnect();
      dprQuery?.removeEventListener('change', onDprChange);
      document.fonts?.removeEventListener?.('loadingdone', onFontsLoaded);
      staticLayer.cancel();
      overlayLayer.cancel();
    };
  }, []);

  // This component owns the layout (see spec 7.1): styles.css must not style the container or canvases.
  return (
    <div
      ref={containerRef}
      className="canvas-container"
      data-testid={TID.canvasContainer}
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: 'var(--z-canvas)' }}
    >
      <canvas ref={staticRef} data-testid={TID.canvasStatic} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <canvas ref={interactiveRef} data-testid={TID.canvasInteractive} style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />
    </div>
  );
}
