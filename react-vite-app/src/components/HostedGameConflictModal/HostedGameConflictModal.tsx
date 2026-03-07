import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { LobbyDoc } from '../../services/lobbyService';
import './HostedGameConflictModal.css';

export interface HostedGameConflictModalProps {
  existingLobbies: LobbyDoc[];
  onClose: () => void;
  onJoinHostedGame: (docId: string) => void;
  onCloseAndCreateNew: (docIdToClose: string) => Promise<void>;
}

/**
 * Modal shown when user tries to host a new game but already has an active hosted game.
 * Offers: cancel, join the existing lobby, or close it and create the new game.
 */
function HostedGameConflictModal({
  existingLobbies,
  onClose,
  onJoinHostedGame,
  onCloseAndCreateNew
}: HostedGameConflictModalProps): React.ReactElement {
  const primaryLobby = existingLobbies[0];
  const [isClosing, setIsClosing] = useState(false);

  const handleCloseAndCreate = async (): Promise<void> => {
    setIsClosing(true);
    try {
      await onCloseAndCreateNew(primaryLobby.docId);
      onClose();
    } finally {
      setIsClosing(false);
    }
  };

  const handleJoinHosted = (): void => {
    onJoinHostedGame(primaryLobby.docId);
    onClose();
  };

  return createPortal(
    <div
      className="hosted-conflict-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hosted-conflict-title"
    >
      <div className="hosted-conflict-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="hosted-conflict-body">
          <h3 id="hosted-conflict-title" className="hosted-conflict-title">
            Already hosting a game
          </h3>
          <p className="hosted-conflict-message">
            You already have an active game (code: <strong>{primaryLobby.gameId}</strong>).
            Close it first or switch to that lobby.
          </p>
          <div className="hosted-conflict-actions">
            <button className="hosted-conflict-cancel" onClick={onClose}>
              Cancel
            </button>
            <button className="hosted-conflict-goto" onClick={handleJoinHosted}>
              Join hosted game
            </button>
            <button
              className="hosted-conflict-close"
              onClick={handleCloseAndCreate}
              disabled={isClosing}
            >
              {isClosing ? 'Closing...' : 'Close hosted game'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default HostedGameConflictModal;
