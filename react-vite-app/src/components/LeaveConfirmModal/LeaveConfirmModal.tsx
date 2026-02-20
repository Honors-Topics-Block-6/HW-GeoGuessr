import { createPortal } from 'react-dom';
import './LeaveConfirmModal.css';

export interface LeaveConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  isDuel?: boolean;
}

function LeaveConfirmModal({ onConfirm, onCancel, isDuel = false }: LeaveConfirmModalProps): React.ReactElement {
  const message = isDuel
    ? 'Are you sure you want to leave this duel? This will count as a forfeit.'
    : 'Are you sure you want to leave? Your progress will be lost.';

  const leaveLabel = isDuel ? 'Leave Duel' : 'Leave Game';

  return createPortal(
    <div className="leave-confirm-overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="leave-confirm-title">
      <div className="leave-confirm-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="leave-confirm-body">
          <h3 id="leave-confirm-title" className="leave-confirm-title">
            Leave Game?
          </h3>
          <p className="leave-confirm-message">{message}</p>
          <div className="leave-confirm-actions">
            <button className="leave-confirm-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button className="leave-confirm-leave" onClick={onConfirm}>
              {leaveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default LeaveConfirmModal;
