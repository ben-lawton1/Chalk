// Unit tests for input/keyboard and isTextEntry (WP3). Commands are mocked so these do not depend on core/scene.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NUDGE, NUDGE_SHIFT } from '../constants';
import { getState, resetState, setInteraction, setSelection, setState } from '../state/store';
import * as actions from '../state/actions';
import { flushSave } from '../persistence/autosave';
import { handleKeyDown, inTerminalPanel, SHORTCUTS, TERMINAL_TOGGLE_EVENT, type KeyLike } from './keyboard';
import { cancelGesture, isTextEntry } from './pointer';

vi.mock('../state/actions');
vi.mock('../persistence/autosave');
vi.mock('./pointer', async (orig) => ({ ...(await orig<typeof import('./pointer')>()), cancelGesture: vi.fn() }));

function key(k: string, o: Partial<KeyLike> = {}): KeyLike {
  return { key: k, code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, repeat: false, target: null, ...o };
}
const ctrl = (k: string, o: Partial<KeyLike> = {}): KeyLike => key(k, { ctrlKey: true, ...o });
const t = (o: object): EventTarget => o as unknown as EventTarget;

beforeEach(() => {
  resetState();
});

describe('isTextEntry', () => {
  it('is true for text inputs, textareas, selects and contenteditable', () => {
    expect(isTextEntry(t({ tagName: 'INPUT', type: 'text' }))).toBe(true);
    expect(isTextEntry(t({ tagName: 'input' }))).toBe(true);
    expect(isTextEntry(t({ tagName: 'INPUT', type: 'number' }))).toBe(true);
    expect(isTextEntry(t({ tagName: 'TEXTAREA' }))).toBe(true);
    expect(isTextEntry(t({ tagName: 'SELECT' }))).toBe(true);
    expect(isTextEntry(t({ tagName: 'DIV', isContentEditable: true }))).toBe(true);
  });
  it('is false for range/color/checkbox inputs, buttons and null', () => {
    for (const type of ['range', 'color', 'checkbox', 'radio', 'button', 'file']) {
      expect(isTextEntry(t({ tagName: 'INPUT', type }))).toBe(false);
    }
    expect(isTextEntry(t({ tagName: 'BUTTON' }))).toBe(false);
    expect(isTextEntry(t({ tagName: 'DIV' }))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe('guards', () => {
  it('ignores keys whose target is a text field', () => {
    expect(handleKeyDown(key('Delete', { target: t({ tagName: 'TEXTAREA' }) }))).toBe(false);
    expect(handleKeyDown(key('r', { code: 'KeyR', target: t({ tagName: 'INPUT', type: 'text' }) }))).toBe(false);
    expect(actions.deleteSelection).not.toHaveBeenCalled();
    expect(actions.setTool).not.toHaveBeenCalled();
  });
  it('step 0 save/zoom combos work even in a textarea', () => {
    const target = t({ tagName: 'TEXTAREA' });
    expect(handleKeyDown(ctrl('=', { code: 'Equal', target }))).toBe(true);
    expect(actions.zoomIn).toHaveBeenCalledTimes(1);
    expect(handleKeyDown(ctrl('-', { code: 'Minus', target }))).toBe(true);
    expect(actions.zoomOut).toHaveBeenCalledTimes(1);
    expect(handleKeyDown(ctrl('0', { code: 'Digit0', target }))).toBe(true);
    expect(actions.resetZoom).toHaveBeenCalledTimes(1);
    expect(handleKeyDown(ctrl('+', { code: 'NumpadAdd', shiftKey: true, target }))).toBe(true);
    expect(actions.zoomIn).toHaveBeenCalledTimes(2);
  });
  it('Ctrl+S saves, toasts, and works while editing', async () => {
    vi.mocked(flushSave).mockResolvedValue(undefined);
    setState({ editing: { id: 'x', before: { elements: [], selectedIds: [] } } });
    expect(handleKeyDown(ctrl('s'))).toBe(true);
    expect(flushSave).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(getState().toast?.message).toBe('Saved');
  });
  it('Ctrl+S reports a failed save', async () => {
    vi.mocked(flushSave).mockRejectedValue(new Error('x'));
    handleKeyDown(ctrl('S'));
    await new Promise((r) => setTimeout(r, 0));
    expect(getState().toast?.kind).toBe('error');
  });
  it('Alt+Ctrl+S is not the save combo', () => {
    expect(handleKeyDown(ctrl('s', { altKey: true }))).toBe(false);
    expect(flushSave).not.toHaveBeenCalled();
  });
  it('a range-input target is not ignored', () => {
    expect(handleKeyDown(key('Delete', { target: t({ tagName: 'INPUT', type: 'range' }) }))).toBe(true);
    expect(actions.deleteSelection).toHaveBeenCalledTimes(1);
  });
  it('ignores everything but step 0 while editing', () => {
    setState({ editing: { id: 'x', before: { elements: [], selectedIds: [] } } });
    expect(handleKeyDown(key('Delete'))).toBe(false);
    expect(handleKeyDown(key('Escape'))).toBe(false);
    expect(handleKeyDown(ctrl('z'))).toBe(false);
    expect(actions.deleteSelection).not.toHaveBeenCalled();
    expect(actions.undo).not.toHaveBeenCalled();
    expect(handleKeyDown(ctrl('=', { code: 'Equal' }))).toBe(true);
  });
  it('with a dialog open only Escape is handled', () => {
    setState({ dialog: 'help' });
    expect(handleKeyDown(key('Delete'))).toBe(false);
    expect(handleKeyDown(key('r', { code: 'KeyR' }))).toBe(false);
    expect(actions.deleteSelection).not.toHaveBeenCalled();
    expect(handleKeyDown(key('Escape'))).toBe(true);
    expect(actions.closeDialog).toHaveBeenCalledTimes(1);
  });
});

describe('gesture guard', () => {
  beforeEach(() => setInteraction({ gestureActive: true }));

  it('runs no command: Ctrl+D returns true (preventDefault) without duplicating', () => {
    expect(handleKeyDown(ctrl('d'))).toBe(true);
    expect(actions.duplicateSelection).not.toHaveBeenCalled();
  });
  it('plain keys return false and run nothing', () => {
    expect(handleKeyDown(key('Delete'))).toBe(false);
    expect(handleKeyDown(key('r', { code: 'KeyR' }))).toBe(false);
    expect(handleKeyDown(key('ArrowLeft'))).toBe(false);
    expect(actions.deleteSelection).not.toHaveBeenCalled();
    expect(actions.setTool).not.toHaveBeenCalled();
    expect(actions.nudgeSelection).not.toHaveBeenCalled();
  });
  it('step 0 combos are swallowed without running', () => {
    expect(handleKeyDown(ctrl('=', { code: 'Equal' }))).toBe(true);
    expect(handleKeyDown(ctrl('s'))).toBe(true);
    expect(actions.zoomIn).not.toHaveBeenCalled();
    expect(flushSave).not.toHaveBeenCalled();
  });
  it('Escape cancels the gesture and nothing else', () => {
    setSelection(['a']);
    expect(handleKeyDown(key('Escape'))).toBe(true);
    expect(cancelGesture).toHaveBeenCalledTimes(1);
    expect(actions.clearSelection).not.toHaveBeenCalled();
    expect(actions.setTool).not.toHaveBeenCalled();
  });
});

describe('Escape order', () => {
  it('clears a non-empty selection first', () => {
    setSelection(['a']);
    expect(handleKeyDown(key('Escape'))).toBe(true);
    expect(actions.clearSelection).toHaveBeenCalledTimes(1);
    expect(actions.setTool).not.toHaveBeenCalled();
  });
  it('then switches to the select tool', () => {
    expect(handleKeyDown(key('Escape'))).toBe(true);
    expect(actions.setTool).toHaveBeenCalledWith('select');
    expect(cancelGesture).not.toHaveBeenCalled();
  });
});

describe('Ctrl/Cmd combos', () => {
  it('undo, redo (two ways), duplicate, select all', () => {
    expect(handleKeyDown(ctrl('z'))).toBe(true);
    expect(actions.undo).toHaveBeenCalledTimes(1);
    expect(handleKeyDown(ctrl('Z', { shiftKey: true }))).toBe(true);
    expect(handleKeyDown(ctrl('y'))).toBe(true);
    expect(actions.redo).toHaveBeenCalledTimes(2);
    expect(handleKeyDown(key('d', { metaKey: true }))).toBe(true);
    expect(actions.duplicateSelection).toHaveBeenCalledTimes(1);
    expect(handleKeyDown(ctrl('a'))).toBe(true);
    expect(actions.selectAll).toHaveBeenCalledTimes(1);
  });
  it('bracket keys reorder, with Shift for front/back', () => {
    handleKeyDown(ctrl(']', { code: 'BracketRight' }));
    handleKeyDown(ctrl('}', { code: 'BracketRight', shiftKey: true }));
    handleKeyDown(ctrl('[', { code: 'BracketLeft' }));
    handleKeyDown(ctrl('{', { code: 'BracketLeft', shiftKey: true }));
    expect(vi.mocked(actions.reorderSelection).mock.calls.map((c) => c[0])).toEqual(['forward', 'front', 'backward', 'back']);
  });
  it('Ctrl+C / X / V are not handled, so the native clipboard events fire', () => {
    expect(handleKeyDown(ctrl('c'))).toBe(false);
    expect(handleKeyDown(ctrl('x'))).toBe(false);
    expect(handleKeyDown(ctrl('v'))).toBe(false);
    expect(handleKeyDown(ctrl('r'))).toBe(false);
  });
});

describe('shifted keys', () => {
  it('? opens help, Shift+1 fits, Shift+2 zooms to selection (before the modifier guard)', () => {
    expect(handleKeyDown(key('?', { code: 'Slash', shiftKey: true }))).toBe(true);
    expect(actions.openDialog).toHaveBeenCalledWith('help');
    expect(handleKeyDown(key('!', { code: 'Digit1', shiftKey: true }))).toBe(true);
    expect(actions.zoomToFit).toHaveBeenCalledTimes(1);
    expect(handleKeyDown(key('@', { code: 'Digit2', shiftKey: true }))).toBe(true);
    expect(actions.zoomToSelection).toHaveBeenCalledTimes(1);
    expect(actions.setTool).not.toHaveBeenCalled();
  });
  it('Ctrl+Backslash toggles the sidebar', () => {
    expect(handleKeyDown(ctrl('\\', { code: 'Backslash' }))).toBe(true);
    expect(actions.toggleSidebar).toHaveBeenCalledTimes(1);
    expect(handleKeyDown(key('\\', { code: 'Backslash' }))).toBe(false);
    expect(actions.toggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('Home goes back to the page corner, but not with Shift or Alt', () => {
    expect(handleKeyDown(key('Home'))).toBe(true);
    expect(actions.goHome).toHaveBeenCalledTimes(1);
    expect(handleKeyDown(key('Home', { shiftKey: true }))).toBe(false);
    expect(actions.goHome).toHaveBeenCalledTimes(1);
  });
  it('Shift+arrow nudges by NUDGE_SHIFT and plain arrows by NUDGE', () => {
    handleKeyDown(key('ArrowRight', { shiftKey: true }));
    handleKeyDown(key('ArrowUp'));
    handleKeyDown(key('ArrowLeft'));
    handleKeyDown(key('ArrowDown', { shiftKey: true }));
    expect(vi.mocked(actions.nudgeSelection).mock.calls).toEqual([
      [NUDGE_SHIFT, 0], [0, -NUDGE], [-NUDGE, 0], [0, NUDGE_SHIFT],
    ]);
  });
});

describe('edit and tool keys', () => {
  it('Delete and Backspace delete', () => {
    expect(handleKeyDown(key('Delete'))).toBe(true);
    expect(handleKeyDown(key('Backspace'))).toBe(true);
    expect(actions.deleteSelection).toHaveBeenCalledTimes(2);
  });
  it('Enter returns the result of editSelection', () => {
    vi.mocked(actions.editSelection).mockReturnValue(true);
    expect(handleKeyDown(key('Enter'))).toBe(true);
    vi.mocked(actions.editSelection).mockReturnValue(false);
    expect(handleKeyDown(key('Enter'))).toBe(false);
  });
  it('letter keys pick tools', () => {
    expect(handleKeyDown(key('r', { code: 'KeyR' }))).toBe(true);
    expect(actions.setTool).toHaveBeenLastCalledWith('rectangle');
    handleKeyDown(key('V', { code: 'KeyV' }));
    expect(actions.setTool).toHaveBeenLastCalledWith('select');
    handleKeyDown(key('h', { code: 'KeyH' }));
    expect(actions.setTool).toHaveBeenLastCalledWith('hand');
    handleKeyDown(key('a', { code: 'KeyA' }));
    expect(actions.setTool).toHaveBeenLastCalledWith('arrow');
    handleKeyDown(key('t', { code: 'KeyT' }));
    expect(actions.setTool).toHaveBeenLastCalledWith('text');
    handleKeyDown(key('p', { code: 'KeyP' }));
    expect(actions.setTool).toHaveBeenLastCalledWith('pen');
    handleKeyDown(key('e', { code: 'KeyE' }));
    expect(actions.setTool).toHaveBeenLastCalledWith('eraser');
  });
  it('digit keys pick tools via code', () => {
    const expected = ['select', 'rectangle', 'diamond', 'ellipse', 'triangle', 'arrow', 'line', 'text'];
    for (let i = 1; i <= 8; i++) {
      expect(handleKeyDown(key(String(i), { code: `Digit${i}` }))).toBe(true);
      expect(actions.setTool).toHaveBeenLastCalledWith(expected[i - 1]);
    }
    expect(handleKeyDown(key('9', { code: 'Digit9' }))).toBe(false);
  });
  it('Q toggles the tool lock once per press (not on key repeat)', () => {
    expect(handleKeyDown(key('q', { code: 'KeyQ' }))).toBe(true);
    expect(handleKeyDown(key('q', { code: 'KeyQ', repeat: true }))).toBe(true);
    expect(actions.toggleToolLock).toHaveBeenCalledTimes(1);
  });
  it('tool keys do nothing with Alt or Shift held, and unknown keys are unhandled', () => {
    expect(handleKeyDown(key('r', { code: 'KeyR', altKey: true }))).toBe(false);
    expect(handleKeyDown(key('R', { code: 'KeyR', shiftKey: true }))).toBe(false);
    expect(handleKeyDown(key('z', { code: 'KeyZ' }))).toBe(false);
    expect(actions.setTool).not.toHaveBeenCalled();
  });
});

describe('SHORTCUTS', () => {
  it('covers every group and has no empty fields', () => {
    expect(new Set(SHORTCUTS.map((s) => s.group))).toEqual(new Set(['Tools', 'Edit', 'View', 'File', 'Pen & touch', 'Notes']));
    for (const s of SHORTCUTS) {
      expect(s.keys).not.toBe('');
      expect(s.description).not.toBe('');
    }
  });
});

describe('terminal panel', () => {
  const inside = t({ tagName: 'TEXTAREA', closest: (sel: string) => (sel === '.terminal-panel' ? {} : null) });
  const outside = t({ tagName: 'DIV', closest: () => null });

  it('inTerminalPanel looks for the .terminal-panel ancestor', () => {
    expect(inTerminalPanel(inside)).toBe(true);
    expect(inTerminalPanel(outside)).toBe(false);
    expect(inTerminalPanel(null)).toBe(false);
    expect(inTerminalPanel(t({ tagName: 'DIV' }))).toBe(false);
  });

  it('Ctrl+backquote toggles the terminal from anywhere, also from inside it', () => {
    const target = new EventTarget();
    const seen = vi.fn();
    target.addEventListener(TERMINAL_TOGGLE_EVENT, seen);
    vi.stubGlobal('window', target);
    try {
      expect(handleKeyDown(ctrl('`', { code: 'Backquote' }))).toBe(true);
      expect(handleKeyDown(ctrl('`', { code: 'Backquote', target: inside }))).toBe(true);
      expect(seen).toHaveBeenCalledTimes(2);
      expect(handleKeyDown(ctrl('`', { code: 'Backquote', repeat: true }))).toBe(true);
      expect(seen).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Ctrl+S and the zoom combos are not taken inside the terminal, but still are outside', () => {
    expect(handleKeyDown(ctrl('s', { target: inside }))).toBe(false);
    expect(handleKeyDown(ctrl('=', { code: 'Equal', target: inside }))).toBe(false);
    expect(handleKeyDown(ctrl('-', { code: 'Minus', target: inside }))).toBe(false);
    expect(handleKeyDown(ctrl('0', { code: 'Digit0', target: inside }))).toBe(false);
    expect(actions.zoomIn).not.toHaveBeenCalled();
    expect(actions.resetZoom).not.toHaveBeenCalled();
    expect(handleKeyDown(ctrl('=', { code: 'Equal', target: outside }))).toBe(true);
    expect(actions.zoomIn).toHaveBeenCalledTimes(1);
  });

  it('plain keys typed in the terminal are not shortcuts', () => {
    expect(handleKeyDown(key('r', { target: inside }))).toBe(false);
    expect(handleKeyDown(key('Escape', { target: t({ tagName: 'BUTTON', closest: () => ({}) }) }))).toBe(false);
  });
});
