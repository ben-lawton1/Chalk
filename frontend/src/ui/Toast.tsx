// Transient bottom-center toast driven by the store's `toast` state. Owner: WP4.
import { TID } from '../testids';
import { useAppState } from './hooks';

export function Toast() {
  const toast = useAppState((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      data-testid={TID.toast}
      role="status"
      className={`toast toast-${toast.kind}`}
      data-kind={toast.kind}
    >
      {toast.message}
    </div>
  );
}
