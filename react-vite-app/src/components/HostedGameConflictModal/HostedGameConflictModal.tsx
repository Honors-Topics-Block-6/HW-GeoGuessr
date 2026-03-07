import { createPortal } from 'react-dom';
import type { LobbyDoc } from '../../services/lobbyService';
import './HostedGameConflictModal.css';

export interface HostedGameConflictModalProps {
  existingLobbies: LobbyDoc[];
  onClose: () => void;
  onCloseHostedGame: (docId: string) => Promise<void>;
  onGoToLobby: (docId: string) => void;
}

/**
 * Modal shown when user tries to host a new game but already has an active hosted game.
 * Offers: close the existing game, or go to the existing lobby.
 */
function HostedGameConflictModal({
  existingLobbies,
  onClose,
  onCloseHostedGame,
  onGoToLobby
}: HostedGameConflictModalProps): React.ReactElement {
  const primaryLobby = existingLobbies[0];

  const handleCloseGame = async (): Promise<void> => {
    await onCloseHostedGame(primaryLobby.docId);
    onClose();
  };

  const handleGoToLobby = (): void => {
    onGoToLobby(primaryLobby.docId);
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
            <button className="hosted-conflict-close" onClick={handleCloseGame}>
              Close hosted game
            </button>
            <button className="hosted-conflict-goto" onClick={handleGoToLobby}>
              Go to lobby
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default HostedGameConflictModal;
