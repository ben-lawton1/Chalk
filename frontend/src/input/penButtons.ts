// Which pen button is meant, from the signals the browser reports (not from the button's position on the pen) (v3).

export type PenAction = 'tip' | 'erase' | 'lasso';

/** PointerEvent.button for the eraser button / the eraser end of the pen. */
const BUTTON_ERASER = 5;
/** PointerEvent.buttons bits: barrel (like a right click) and eraser. */
const BUTTONS_BARREL = 2;
const BUTTONS_ERASER = 32;

/**
 * 'erase' for the eraser signal (button 5 or buttons & 32), 'lasso' for the barrel signal (button 2 or buttons & 2),
 * else 'tip'. `swapped` exchanges the two, for a stylus that reports its buttons the other way round.
 */
export function classifyPen(button: number, buttons: number, swapped: boolean): PenAction {
  const eraserSignal = button === BUTTON_ERASER || (buttons & BUTTONS_ERASER) !== 0;
  const barrelSignal = button === 2 || (buttons & BUTTONS_BARREL) !== 0;
  if (eraserSignal) return swapped ? 'lasso' : 'erase';
  if (barrelSignal) return swapped ? 'erase' : 'lasso';
  return 'tip';
}

/** A ring the size of the eraser (ERASER_RADIUS_PX = 10), as a CSS cursor; shown while the pen hovers with the eraser button held. */
export const ERASER_CURSOR =
  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'10\' fill=\'none\' stroke=\'white\' stroke-width=\'1.5\'/%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'10.75\' fill=\'none\' stroke=\'black\' stroke-opacity=\'.5\'/%3E%3C/svg%3E") 12 12, cell';
