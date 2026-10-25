// Keyboard shortcut help dialog: renders SHORTCUTS verbatim, grouped, in two columns. Owner: WP4.
import { SHORTCUTS } from '../input/keyboard';
import { closeDialog } from '../state/actions';
import { TID } from '../testids';
import type { ShortcutInfo } from '../types';
import { Icon } from './icons';

type Group = ShortcutInfo['group'];
const LEFT: readonly Group[] = ['Tools', 'View', 'File'];
const RIGHT: readonly Group[] = ['Edit'];

function Column(props: { groups: readonly Group[] }) {
  return (
    <div className="help-col">
      {props.groups.map((g) => {
        const rows = SHORTCUTS.filter((s) => s.group === g);
        if (rows.length === 0) return null;
        return (
          <section key={g} className="help-group">
            <h3>{g}</h3>
            {rows.map((s, i) => (
              <div key={`${s.keys}|${i}`} className="help-row">
                <span className="help-desc">{s.description}</span>
                <span className="keys">{s.keys}</span>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function HelpDialog() {
  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="dialog wide" data-testid={TID.helpDialog} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="dialog-header">
          <h2 className="dialog-title">Keyboard shortcuts</h2>
          <button type="button" className="icon-btn" data-testid={TID.helpClose} aria-label="Close" title="Close — Esc"
            onMouseDown={(e) => e.preventDefault()} onClick={() => closeDialog()}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="dialog-body">
          <div className="help-columns">
            <Column groups={LEFT} />
            <Column groups={RIGHT} />
          </div>
        </div>
      </div>
    </div>
  );
}
