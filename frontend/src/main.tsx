// App boot: fonts, test hook, React root, input and persistence; every step is isolated so one failure cannot blank the app. Owner: WP4.
import '@fontsource/caveat/400.css';
import './ui/styles.css';
import { createRoot } from 'react-dom/client';
import { FONT_LOAD_TIMEOUT_MS } from './constants';
import { clearTextCache } from './core/text';
import { remeasureText } from './state/actions';
import { installTestHook } from './testing/testHook';
import { attachKeyboard } from './input/keyboard';
import { attachClipboard } from './input/clipboard';
import { startAutosave } from './persistence/autosave';
import { initBoards } from './persistence/boards';
import { App } from './ui/App';

function attempt(name: string, fn: () => unknown): void {
  try {
    const r = fn();
    if (r instanceof Promise) r.catch((err: unknown) => console.warn(`boot: ${name} failed`, err));
  } catch (err) {
    console.warn(`boot: ${name} failed`, err);
  }
}

async function boot(): Promise<void> {
  // 1. fonts (never block longer than FONT_LOAD_TIMEOUT_MS)
  try {
    await Promise.race([document.fonts.load('24px Caveat'), new Promise((r) => setTimeout(r, FONT_LOAD_TIMEOUT_MS))]);
  } catch {
    // font loading is best effort
  }
  document.fonts?.addEventListener?.('loadingdone', () => {
    attempt('clearTextCache', clearTextCache);
    attempt('remeasureText', remeasureText);
  });
  // 2. test hook, 3. React (rendered directly, without a dev double-mount wrapper), 4. input + persistence
  attempt('installTestHook', installTestHook);
  createRoot(document.getElementById('root')!).render(<App />);
  attempt('attachKeyboard', attachKeyboard);
  attempt('attachClipboard', attachClipboard);
  attempt('startAutosave', startAutosave);
  attempt('initBoards', initBoards);
}

void boot();
