import { useMemo } from 'react';
import { useMyGames, type UserLobbyHistory } from '../../hooks/useLobby';
import './MyGames.css';

interface MyGamesProps {
  userUid: string;
  onBack: () => void;
}

function MyGames({ userUid, onBack }: MyGamesProps): React.ReactElement {
  const { myLobbies, isLoading, error, closingGameIds, closeGame } = useMyGames(userUid);

  const [publicGames, privateGames] = useMemo((): [UserLobbyHistory[], UserLobbyHistory[]] => {
    const publicList: UserLobbyHistory[] = [];
    const privateList: UserLobbyHistory[] = [];
    myLobbies.forEach((lobby) => {
      if (lobby.visibility === 'private') {
        privateList.push(lobby);
      } else {
        publicList.push(lobby);
      }
    });
    return [publicList, privateList];
  }, [myLobbies]);

  return (
    <div className="my-games-screen">
      <div className="my-games-background">
        <div className="my-games-overlay"></div>
      </div>

      <div className="my-games-content">
        <button className="my-games-back-button" onClick={onBack}>
          ← Back
        </button>

        <h1 className="my-games-heading">My Games</h1>
        <p className="my-games-subheading">All public and private games you have created.</p>

        {error && (
          <div className="my-games-error">
            <span>{error}</span>
          </div>
        )}

        <div className="my-games-columns">
          <div className="my-games-column">
            <div className="my-games-column-header">
              <h2>Public Games</h2>
              <span className="my-games-count">{publicGames.length}</span>
            </div>
            {isLoading ? (
              <div className="my-games-empty">Loading your public games...</div>
            ) : publicGames.length === 0 ? (
              <div className="my-games-empty">No public games yet.</div>
            ) : (
              <div className="my-games-list">
                {publicGames.map((lobby) => (
                  <div key={lobby.docId} className="my-games-card">
                    <div className="my-games-card-info">
                      <div className="my-games-code-label">Game Code</div>
                      <div className="my-games-code-value">{lobby.gameId}</div>
                    </div>
                    <button
                      className="my-games-close-btn"
                      onClick={() => closeGame(lobby.lobbyDocId ?? lobby.docId)}
                      disabled={closingGameIds.has(lobby.lobbyDocId ?? lobby.docId)}
                    >
                      {closingGameIds.has(lobby.lobbyDocId ?? lobby.docId) ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="my-games-column">
            <div className="my-games-column-header">
              <h2>Private Games</h2>
              <span className="my-games-count">{privateGames.length}</span>
            </div>
            {isLoading ? (
              <div className="my-games-empty">Loading your private games...</div>
            ) : privateGames.length === 0 ? (
              <div className="my-games-empty">No private games yet.</div>
            ) : (
              <div className="my-games-list">
                {privateGames.map((lobby) => (
                  <div key={lobby.docId} className="my-games-card">
                    <div className="my-games-card-info">
                      <div className="my-games-code-label">Game Code</div>
                      <div className="my-games-code-value">{lobby.gameId}</div>
                    </div>
                    <button
                      className="my-games-close-btn"
                      onClick={() => closeGame(lobby.lobbyDocId ?? lobby.docId)}
                      disabled={closingGameIds.has(lobby.lobbyDocId ?? lobby.docId)}
                    >
                      {closingGameIds.has(lobby.lobbyDocId ?? lobby.docId) ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MyGames;
