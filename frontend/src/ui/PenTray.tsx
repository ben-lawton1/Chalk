// Pen tray: 3 pens (colour + size), the eraser and the lasso; the options popover of the active pen. Owner: v3.
import { useEffect, useRef, useState } from 'react';
import { PEN_COLORS, PEN_SIZES } from '../constants';
import { setActivePen, setPenButtonsSwapped, setTool, updatePen } from '../state/actions';
import { TID, tidPenColor, tidPenSize, tidPenSlot } from '../testids';
import type { PenSettings } from '../types';
import { useAppState } from './hooks';
import { Icon } from './icons';

/** A short wavy stroke in the pen's colour and thickness (capped so the biggest pen still fits the chip). */
function Squiggle({ pen }: { pen: PenSettings }) {
  return (
    <svg width="40" height="22" viewBox="0 0 40 22" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 14c4-9 7-9 10 0s6 9 10 0 6-9 9-4 3 4 5 2" stroke={pen.color} strokeWidth={Math.min(pen.size, 9)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PenTray() {
  const open = useAppState((s) => s.penTrayOpen);
  const tool = useAppState((s) => s.tool);
  const pens = useAppState((s) => s.pens);
  const activePen = useAppState((s) => s.activePen);
  const swapped = useAppState((s) => s.penButtonsSwapped);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const showOptions = open && optionsOpen && tool === 'pen';

  // Closing the tray (or leaving the pen tool) also closes the popover, so it is not open the next time.
  useEffect(() => {
    if (!open || tool !== 'pen') setOptionsOpen(false);
  }, [open, tool]);

  // Escape or a pointerdown outside the tray closes the popover. Escape is consumed so it does not also reset the tool.
  useEffect(() => {
    if (!showOptions) return undefined;
    const onDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOptionsOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOptionsOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [showOptions]);

  if (!open) return null;

  function onPenChip(i: number): void {
    if (tool === 'pen' && activePen === i) {
      setOptionsOpen((o) => !o);
      return;
    }
    setActivePen(i);
    setTool('pen');
    setOptionsOpen(false);
  }

  const active = pens[activePen];

  return (
    <div ref={rootRef} className="island pen-tray" data-testid={TID.penTray} role="toolbar" aria-label="Pens">
      <div className="pen-row">
        {pens.map((pen, i) => (
          <button
            key={i}
            type="button"
            className="pen-chip"
            data-testid={tidPenSlot(i)}
            aria-pressed={tool === 'pen' && activePen === i}
            aria-label={`Pen ${i + 1}`}
            title={`Pen ${i + 1}${tool === 'pen' && activePen === i ? ' — click again for options' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPenChip(i)}
          >
            <Squiggle pen={pen} />
          </button>
        ))}
        <span className="toolbar-sep" aria-hidden="true" />
        <button
          type="button"
          className="pen-chip tool"
          data-testid={TID.penEraser}
          aria-pressed={tool === 'eraser'}
          aria-label="Eraser"
          title="Eraser — E"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setTool('eraser'); setOptionsOpen(false); }}
        >
          <Icon name="eraser" size={24} />
        </button>
        <button
          type="button"
          className="pen-chip tool"
          data-testid={TID.penLasso}
          aria-pressed={tool === 'lasso'}
          aria-label="Lasso select"
          title="Lasso select"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setTool('lasso'); setOptionsOpen(false); }}
        >
          <Icon name="lasso" size={24} />
        </button>
      </div>

      {showOptions && active && (
        <div className="pen-options" data-testid={TID.penOptions} role="group" aria-label={`Options for pen ${activePen + 1}`}>
          <div className="panel-label">Colour</div>
          <div className="panel-row">
            {PEN_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                className="swatch big"
                data-testid={tidPenColor(i)}
                aria-pressed={active.color.toLowerCase() === c}
                aria-label={`Pen colour ${c}`}
                title={c}
                style={{ background: c }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updatePen(activePen, { color: c })}
              />
            ))}
          </div>
          <div className="panel-label spaced">Size</div>
          <div className="panel-row">
            {PEN_SIZES.map((w, i) => (
              <button
                key={w}
                type="button"
                className="opt big"
                data-testid={tidPenSize(i)}
                aria-pressed={active.size === w}
                aria-label={`Pen size ${w}`}
                title={`Size ${w}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updatePen(activePen, { size: w })}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r={Math.min(10, 1 + w * 0.7)} fill="currentColor" />
                </svg>
              </button>
            ))}
          </div>
          <label className="pen-swap">
            <input
              type="checkbox"
              data-testid={TID.penSwapButtons}
              checked={swapped}
              onChange={(e) => setPenButtonsSwapped(e.target.checked)}
            />
            <span>Swap pen buttons</span>
          </label>
          <div className="pen-hint">Eraser button erases, barrel button lassos. Swap if yours are reversed.</div>
        </div>
      )}
    </div>
  );
}
