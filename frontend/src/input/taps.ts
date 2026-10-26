// Double-tap detection shared by the touch gestures and the pen (the browser's dblclick is honoured for the mouse only) (v3).
import type { Point } from '../types';
import { DOUBLE_TAP_MS, DOUBLE_TAP_SLOP_PX } from '../constants';

export interface TapTracker {
  /** Records a tap at `screen`; true when it is the second tap of a double tap (the next tap starts over). */
  tap(screen: Point): boolean;
  reset(): void;
}

export function createTapTracker(now: () => number = Date.now): TapTracker {
  let last: { at: number; screen: Point } | null = null;
  return {
    tap(screen) {
      const t = now();
      const prev = last;
      if (prev && t - prev.at <= DOUBLE_TAP_MS && Math.hypot(screen.x - prev.screen.x, screen.y - prev.screen.y) <= DOUBLE_TAP_SLOP_PX) {
        last = null;
        return true;
      }
      last = { at: t, screen };
      return false;
    },
    reset() {
      last = null;
    },
  };
}
