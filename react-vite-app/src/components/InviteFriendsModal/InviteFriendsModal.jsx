import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useFriends } from '../../hooks/useFriends';
import { subscribeToAllPresence } from '../../services/presenceService';
import { getChatId, sendLobbyInvite } from '../../services/chatService';
import './InviteFriendsModal.css';

/**
 * Modal popup that shows the user's friends list with "Invite" buttons.
 * Sends a lobby invite as a special chat message to the friend.
 *
 * @param {{ onClose: function, lobbyDocId: string, difficulty: string }} props
 */
function InviteFriendsModal({ onClose, lobbyDocId, difficulty }) {
  const { user, userDoc } = useAuth();
  const { friends, loading } = useFriends(user?.uid, userDoc?.username);
  const [presenceMap, setPresenceMap] = useState({});
  const [invitedFriends, setInvitedFriends] = useState(new Set());
  const [invitingFriend, setInvitingFriend] = useState(null);

  // Subscribe to presence for online status
  useEffect(() => {
    const unsubscribe = subscribeToAllPresence((data) => {
      setPresenceMap(data);
    });
    return () => unsubscribe();
  }, []);

  const isUserOnline = (uid) => {
    const presence = presenceMap[uid];
    if (!presence || !presence.online) return false;
    if (!presence.lastSeen) return false;
    const lastSeen = presence.lastSeen.toDate ? presence.lastSeen.toDate() : new Date(presence.lastSeen);
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    return lastSeen > twoMinutesAgo;
  };

  const handleInvite = async (friendUid) => {
    setInvitingFriend(friendUid);
    try {
      const username = userDoc?.username || 'Player';
      const chatId = getChatId(user.uid, friendUid);
      await sendLobbyInvite(chatId, user.uid, username, lobbyDocId, difficulty);
      setInvitedFriends(prev => new Set([...prev, friendUid]));
    } catch (err) {
      console.error('Failed to send invite:', err);
    } finally {
      setInvitingFriend(null);
    }
  };

  // Sort: online friends first
  const sortedFriends = [...friends].sort((a, b) => {
    const aOnline = isUserOnline(a.friendUid);
    const bOnline = isUserOnline(b.friendUid);
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return 0;
  });

  return createPortal(
    <div className="invite-overlay" onClick={onClose}>
      <div className="invite-modal" onClick={e => e.stopPropagation()}>
        <div className="invite-header">
          <h3 className="invite-title">Invite Friends</h3>
          <button className="invite-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="invite-body">
          {loading ? (
            <div className="invite-loading">Loading friends...</div>
          ) : friends.length === 0 ? (
            <div className="invite-empty">
              <span className="invite-empty-icon">👥</span>
              <p>No friends yet</p>
              <p className="invite-empty-hint">Add friends from your profile to invite them!</p>
            </div>
          ) : (
            <div className="invite-list">
              {sortedFriends.map(friend => {
                const online = isUserOnline(friend.friendUid);
                const invited = invitedFriends.has(friend.friendUid);
                const inviting = invitingFriend === friend.friendUid;
                return (
                  <div key={friend.pairId} className="invite-item">
                    <div className="invite-friend-info">
                      <span className={`invite-online-dot ${online ? 'online' : 'offline'}`} />
                      <span className="invite-friend-name">{friend.friendUsername}</span>
                      {online && <span className="invite-status-text">Online</span>}
                    </div>
                    <button
                      className={`invite-btn ${invited ? 'invited' : ''}`}
                      onClick={() => handleInvite(friend.friendUid)}
                      disabled={invited || inviting}
                    >
                      {inviting ? 'Sending...' : invited ? 'Invited \u2713' : 'Invite'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default InviteFriendsModal;
