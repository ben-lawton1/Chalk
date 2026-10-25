// Bottom-left island: zoom out/reset/in/fit and undo/redo. Owner: WP4.
import { redo, resetZoom, undo, zoomIn, zoomOut, zoomToFit } from '../state/actions';
import { TID } from '../testids';
import { useAppState } from './hooks';
import { Icon } from './icons';
import type { IconName } from './icons';

function Btn(props: { testId: string; icon: IconName; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="icon-btn"
      data-testid={props.testId}
      aria-label={props.title.split(' — ')[0]}
      title={props.title}
      disabled={props.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
    >
      <Icon name={props.icon} size={18} />
    </button>
  );
}

export function ZoomControls() {
  const zoom = useAppState((s) => s.viewport.zoom);
  const canUndo = useAppState((s) => s.canUndo);
  const canRedo = useAppState((s) => s.canRedo);
  return (
    <div className="island zoom-controls">
      <Btn testId={TID.zoomOut} icon="zoomOut" title="Zoom out — Ctrl + −" onClick={() => zoomOut()} />
      <button
        type="button"
        className="icon-btn zoom-reset"
        data-testid={TID.zoomReset}
        title="Reset zoom to 100% — Ctrl + 0"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => resetZoom()}
      >
        {`${Math.round(zoom * 100)}%`}
      </button>
      <Btn testId={TID.zoomIn} icon="zoomIn" title="Zoom in — Ctrl + =" onClick={() => zoomIn()} />
      <Btn testId={TID.zoomFit} icon="fit" title="Zoom to fit everything — Shift + 1" onClick={() => zoomToFit()} />
      <span className="zoom-sep" aria-hidden="true" />
      <Btn testId={TID.undo} icon="undo" title="Undo — Ctrl + Z" disabled={!canUndo} onClick={() => undo()} />
      <Btn testId={TID.redo} icon="redo" title="Redo — Ctrl + Shift + Z" disabled={!canRedo} onClick={() => redo()} />
    </div>
  );
}
