import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useFriends } from '../../hooks/useFriends';
import { subscribeToAllPresence, type PresenceMap, type PresenceData } from '../../services/presenceService';
import { searchUsersByUsername, type UserLookup } from '../../services/friendService';
import './FriendsPanel.css';

interface FirestoreTimestamp {
  toDate: () => Date;
}

interface Friend {
  pairId: string;
  friendUid: string;
  friendUsername: string;
}

interface IncomingRequest {
  id: string;
  fromUid: string;
  fromUsername: string;
}

interface OutgoingRequest {
  id: string;
  toUid: string;
  toUsername: string;
}

type FriendsTab = 'friends' | 'requests' | 'add';
type AddFriendMode = 'uid' | 'username';

export interface FriendsPanelProps {
  onBack: () => void;
  onOpenChat: (friendUid: string, friendUsername: string) => void;
}

function FriendsPanel({ onBack, onOpenChat }: FriendsPanelProps): React.ReactElement {
  const { user, userDoc } = useAuth();
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    sendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
    loading,
    error: friendsError
  } = useFriends(user?.uid, userDoc?.username ?? '');

  const [addUid, setAddUid] = useState<string>('');
  const [addUsername, setAddUsername] = useState<string>('');
  const [addMode, setAddMode] = useState<AddFriendMode>('uid');
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState<boolean>(false);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<UserLookup[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [presenceMap, setPresenceMap] = useState<PresenceMap>({});
  const [tab, setTab] = useState<FriendsTab>('friends');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState<boolean>(false);

  // Subscribe to presence for online status
  useEffect(() => {
    const unsubscribe = subscribeToAllPresence((data) => {
      setPresenceMap(data);
    });
    return () => unsubscribe();
  }, []);

  const isUserOnline = (uid: string): boolean => {
    const presence = presenceMap[uid];
    if (!presence || !presence.online) return false;
    if (!presence.lastSeen) return false;
    const lastSeen = typeof presence.lastSeen === 'object' && presence.lastSeen !== null && 'toDate' in presence.lastSeen
      ? (presence.lastSeen as FirestoreTimestamp).toDate()
      : new Date();
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    return lastSeen > twoMinutesAgo;
  };

  const handleAddFriend = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setAddError(null);
    setAddSuccess(null);

    setAddLoading(true);
    try {
      const trimmedUid = addUid.trim();
      if (!trimmedUid) {
        setAddError('Please enter a user ID.');
        return;
      }

      await sendRequest(trimmedUid);
      setAddSuccess('Friend request sent!');
      setAddUid('');
      setTimeout(() => setAddSuccess(null), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send request.';
      setAddError(message);
    } finally {
      setAddLoading(false);
    }
  };

  const handleSearchByUsername = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setAddError(null);
    setAddSuccess(null);
    setSearchResults([]);

    const trimmed = addUsername.trim();
    if (!trimmed) {
      setAddError('Please enter a User ID, username, or email.');
      return;
    }

    setSearchLoading(true);
    try {
      const results = await searchUsersByUsername(trimmed, 10);
      // Never show the current user as a search target
      const filtered = results.filter(r => r.uid !== user?.uid);
      setSearchResults(filtered);
      if (filtered.length === 0) {
        setAddError('No users found with that username.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to search users.';
      setAddError(message);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSendFromSearch = async (targetUid: string): Promise<void> => {
    setActionLoading(targetUid);
    setAddError(null);
    setAddSuccess(null);
    try {
      await sendRequest(targetUid);
      setAddSuccess('Friend request sent!');
      // Optimistically remove from results to avoid double-sends
      setSearchResults(prev => prev.filter(r => r.uid !== targetUid));
      setTimeout(() => setAddSuccess(null), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send request.';
      setAddError(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAccept = async (requestId: string): Promise<void> => {
    setActionLoading(requestId);
    try {
      await acceptRequest(requestId);
    } catch (err) {
      console.error('Accept failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (requestId: string): Promise<void> => {
    setActionLoading(requestId);
    try {
      await declineRequest(requestId);
    } catch (err) {
      console.error('Decline failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (requestId: string): Promise<void> => {
    setActionLoading(requestId);
    try {
      await cancelRequest(requestId);
    } catch (err) {
      console.error('Cancel failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveFriend = async (friendUid: string): Promise<void> => {
    setActionLoading(friendUid);
    try {
      await removeFriend(friendUid);
      setConfirmRemove(null);
    } catch (err) {
      console.error('Remove failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const requestCount = (incomingRequests as IncomingRequest[]).length;

  return (
    <div className="friends-panel">
      <div className="friends-background">
        <div className="friends-overlay"></div>
      </div>
      <div className="friends-card">
        <button className="friends-back-button" onClick={onBack}>
          ← Back
        </button>

        <h1 className="friends-title">Friends</h1>

        {friendsError && <div className="friends-error">{friendsError}</div>}

        {/* Tabs */}
        <div className="friends-tabs">
          <button
            className={`friends-tab ${tab === 'friends' ? 'active' : ''}`}
            onClick={() => setTab('friends')}
          >
            Friends ({(friends as Friend[]).length})
          </button>
          <button
            className={`friends-tab ${tab === 'requests' ? 'active' : ''}`}
            onClick={() => setTab('requests')}
          >
            Requests
            {requestCount > 0 && <span className="friends-tab-badge">{requestCount}</span>}
          </button>
          <button
            className={`friends-tab ${tab === 'add' ? 'active' : ''}`}
            onClick={() => setTab('add')}
          >
            Add Friend
          </button>
        </div>

        {/* Friends List Tab */}
        {tab === 'friends' && (
          <div className="friends-list-section">
            {loading ? (
              <div className="friends-loading">Loading friends...</div>
            ) : (friends as Friend[]).length === 0 ? (
              <div className="friends-empty">
                <span className="friends-empty-icon">👥</span>
                <p>No friends yet</p>
                <p className="friends-empty-hint">Add friends by their User ID, username, or email!</p>
              </div>
            ) : (
              <div className="friends-list">
                {(friends as Friend[]).map((friend: Friend) => {
                  const online = isUserOnline(friend.friendUid);
                  return (
                    <div key={friend.pairId} className="friend-item">
                      <div className="friend-info">
                        <span className={`friend-online-dot ${online ? 'online' : 'offline'}`}></span>
                        <span className="friend-username">{friend.friendUsername}</span>
                        {online && (
                          <span className="friend-status-text">Online</span>
                        )}
                      </div>
                      <div className="friend-actions">
                        <button
                          className="friend-chat-button"
                          onClick={() => onOpenChat(friend.friendUid, friend.friendUsername)}
                        >
                          Chat
                        </button>
                        {confirmRemove === friend.friendUid ? (
                          <div className="friend-confirm-remove">
                            <button
                              className="friend-confirm-yes"
                              onClick={() => handleRemoveFriend(friend.friendUid)}
                              disabled={actionLoading === friend.friendUid}
                            >
                              {actionLoading === friend.friendUid ? '...' : 'Yes'}
                            </button>
                            <button
                              className="friend-confirm-no"
                              onClick={() => setConfirmRemove(null)}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            className="friend-remove-button"
                            onClick={() => setConfirmRemove(friend.friendUid)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Requests Tab */}
        {tab === 'requests' && (
          <div className="friends-requests-section">
            {/* Incoming */}
            <div className="requests-group">
              <h3 className="requests-group-title">Incoming Requests</h3>
              {(incomingRequests as IncomingRequest[]).length === 0 ? (
                <div className="requests-empty">No pending requests</div>
              ) : (
                <div className="requests-list">
                  {(incomingRequests as IncomingRequest[]).map((req: IncomingRequest) => (
                    <div key={req.id} className="request-item">
                      <div className="request-info">
                        <span className="request-username">{req.fromUsername}</span>
                        <span className="request-uid">{req.fromUid}</span>
                      </div>
                      <div className="request-actions">
                        <button
                          className="request-accept"
                          onClick={() => handleAccept(req.id)}
                          disabled={actionLoading === req.id}
                        >
                          {actionLoading === req.id ? '...' : 'Accept'}
                        </button>
                        <button
                          className="request-decline"
                          onClick={() => handleDecline(req.id)}
                          disabled={actionLoading === req.id}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing */}
            <div className="requests-group">
              <h3 className="requests-group-title">Sent Requests</h3>
              {(outgoingRequests as OutgoingRequest[]).length === 0 ? (
                <div className="requests-empty">No sent requests</div>
              ) : (
                <div className="requests-list">
                  {(outgoingRequests as OutgoingRequest[]).map((req: OutgoingRequest) => (
                    <div key={req.id} className="request-item outgoing">
                      <div className="request-info">
                        <span className="request-username">{req.toUsername}</span>
                        <span className="request-uid">{req.toUid}</span>
                      </div>
                      <button
                        className="request-cancel"
                        onClick={() => handleCancel(req.id)}
                        disabled={actionLoading === req.id}
                      >
                        {actionLoading === req.id ? '...' : 'Cancel'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add Friend Tab */}
        {tab === 'add' && (
          <div className="friends-add-section">
            <div className="add-friend-info">
              <p>Add a friend by entering their User ID, username, or email address.</p>
              <div className="your-uid-box">
                <span className="your-uid-label">Your User ID:</span>
                <code className="your-uid-value">{user?.uid}</code>
                <button
                  className="copy-uid-button"
                  onClick={() => {
                    navigator.clipboard.writeText(user?.uid || '');
                    setCopiedUid(true);
                    setTimeout(() => setCopiedUid(false), 2000);
                  }}
                >
                  {copiedUid ? '✓' : 'Copy'}
                </button>
              </div>
            </div>

            {addError && <div className="add-friend-error">{addError}</div>}
            {addSuccess && <div className="add-friend-success">{addSuccess}</div>}

            <form onSubmit={handleAddFriend} className="add-friend-form">
              <input
                type="text"
                className="add-friend-input"
                placeholder="Enter User ID, username, or email..."
                value={addUid}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setAddUid(e.target.value);
                  setAddError(null);
                  setAddSuccess(null);
                  setSearchResults([]);
                }}
              >
                By User ID
              </button>
              <button
                type="button"
                className={`add-friend-mode-button ${addMode === 'username' ? 'active' : ''}`}
                onClick={() => {
                  setAddMode('username');
                  setAddError(null);
                  setAddSuccess(null);
                }}
              >
                By Username
              </button>
            </div>

            {addMode === 'uid' ? (
              <form onSubmit={handleAddFriend} className="add-friend-form">
                <input
                  type="text"
                  className="add-friend-input"
                  placeholder="Enter friend's User ID..."
                  value={addUid}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setAddUid(e.target.value);
                    setAddError(null);
                  }}
                  disabled={addLoading}
                />
                <button
                  type="submit"
                  className="add-friend-submit"
                  disabled={addLoading || !addUid.trim()}
                >
                  {addLoading ? 'Sending...' : 'Send Request'}
                </button>
              </form>
            ) : (
              <>
                <form onSubmit={handleSearchByUsername} className="add-friend-form">
                  <input
                    type="text"
                    className="add-friend-input"
                    placeholder="Search username (exact match)..."
                    value={addUsername}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setAddUsername(e.target.value);
                      setAddError(null);
                    }}
                    disabled={searchLoading}
                  />
                  <button
                    type="submit"
                    className="add-friend-submit"
                    disabled={searchLoading || !addUsername.trim()}
                  >
                    {searchLoading ? 'Searching...' : 'Search'}
                  </button>
                </form>

                {searchResults.length > 0 && (
                  <div className="add-friend-results">
                    {searchResults.map((u) => (
                      <div key={u.uid} className="add-friend-result-item">
                        <div className="add-friend-result-info">
                          <span className="add-friend-result-username">{u.username}</span>
                          <span className="add-friend-result-uid">{u.uid}</span>
                        </div>
                        <button
                          type="button"
                          className="add-friend-result-send"
                          onClick={() => handleSendFromSearch(u.uid)}
                          disabled={actionLoading === u.uid}
                        >
                          {actionLoading === u.uid ? '...' : 'Send Request'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FriendsPanel;
