// Root component: sidebar, the canvas stage and all floating chrome, the help button and modal dialogs. Owner: WP4.
import { openDialog } from '../state/actions';
import { TID } from '../testids';
import { Canvas } from './Canvas';
import { HelpDialog } from './HelpDialog';
import { Hints } from './Hints';
import { Icon } from './icons';
import { Sidebar } from './Sidebar';
import { StylePanel } from './StylePanel';
import { TextEditor } from './TextEditor';
import { Toast } from './Toast';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';
import { ZoomControls } from './ZoomControls';
import { useAppState } from './hooks';

export function App() {
  const dialog = useAppState((s) => s.dialog);
  return (
    <>
      <Sidebar />
      {/* The stage is everything right of the sidebar: canvas and text editor share its coordinate space. */}
      <div className="stage">
        <Canvas />
        <TextEditor />
      </div>
      <TopBar />
      <Toolbar />
      <StylePanel />
      <ZoomControls />
      <Hints />
      <button
        type="button"
        className="help-button"
        data-testid={TID.helpButton}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts — ?"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => openDialog('help')}
      >
        <Icon name="help" size={20} />
      </button>
      <Toast />
      {dialog === 'help' && <HelpDialog />}
    </>
  );
}
