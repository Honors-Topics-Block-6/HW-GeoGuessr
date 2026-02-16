import { useState, useEffect } from 'react'
import { getAllFriendships, adminRemoveFriend, getUserFriendRequests } from '../../services/friendService'
import { getChatId, getChatMessages, adminDeleteMessage } from '../../services/chatService'
import './FriendsManagement.css'

export interface FirestoreTimestamp {
  toDate: () => Date
  seconds?: number
}

export interface Friendship {
  id: string
  users?: string[]
  usernames?: Record<string, string>
  since?: FirestoreTimestamp | string | null
}

export interface ChatMessage {
  id: string
  senderUsername?: string
  senderUid?: string
  text: string
  sentAt?: FirestoreTimestamp | string | null
  read?: boolean
}

export interface FriendRequest {
  id: string
  direction: 'incoming' | 'outgoing'
  fromUsername?: string
  fromUid?: string
  toUsername?: string
  toUid?: string
  status: string
  createdAt?: FirestoreTimestamp | string | null
  respondedAt?: FirestoreTimestamp | string | null
}

export interface ChatViewState {
  uid1: string
  uid2: string
  username1: string
  username2: string
}

export interface RequestViewState {
  uid: string
  username: string
}

export interface FriendsManagementProps {}

function FriendsManagement(_props: FriendsManagementProps): React.JSX.Element {
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Chat viewer state
  const [viewingChat, setViewingChat] = useState<ChatViewState | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState<boolean>(false)

  // Request viewer state
  const [viewingRequests, setViewingRequests] = useState<RequestViewState | null>(null)
  const [userRequests, setUserRequests] = useState<FriendRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState<boolean>(false)

  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchFriendships = async (): Promise<void> => {
    try {
      setLoading(true)
      const data = await getAllFriendships()
      setFriendships(data as Friendship[])
      setError(null)
    } catch (err) {
      console.error('Error fetching friendships:', err)
      setError('Failed to load friendships.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFriendships()
  }, [])

  const handleRemoveFriendship = async (uid1: string, uid2: string, pairId: string): Promise<void> => {
    setActionLoading(pairId)
    try {
      await adminRemoveFriend(uid1, uid2)
      setFriendships(prev => prev.filter(f => f.id !== pairId))
      // If we're viewing this chat, close it
      if (viewingChat && getChatId(uid1, uid2) === getChatId(viewingChat.uid1, viewingChat.uid2)) {
        setViewingChat(null)
        setChatMessages([])
      }
    } catch (err) {
      console.error('Error removing friendship:', err)
      setError((err as Error).message || 'Failed to remove friendship.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleViewChat = async (uid1: string, uid2: string, username1: string, username2: string): Promise<void> => {
    setViewingChat({ uid1, uid2, username1, username2 })
    setChatLoading(true)
    setChatMessages([])
    try {
      const chatId = getChatId(uid1, uid2)
      const msgs = await getChatMessages(chatId)
      setChatMessages(msgs as ChatMessage[])
    } catch (err) {
      console.error('Error loading chat:', err)
    } finally {
      setChatLoading(false)
    }
  }

  const handleDeleteMessage = async (messageId: string): Promise<void> => {
    if (!viewingChat) return
    setActionLoading(messageId)
    try {
      const chatId = getChatId(viewingChat.uid1, viewingChat.uid2)
      await adminDeleteMessage(chatId, messageId)
      setChatMessages(prev => prev.filter(m => m.id !== messageId))
    } catch (err) {
      console.error('Error deleting message:', err)
      setError((err as Error).message || 'Failed to delete message.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleViewRequests = async (uid: string, username: string): Promise<void> => {
    setViewingRequests({ uid, username })
    setRequestsLoading(true)
    setUserRequests([])
    try {
      const requests = await getUserFriendRequests(uid)
      setUserRequests(requests as FriendRequest[])
    } catch (err) {
      console.error('Error loading requests:', err)
    } finally {
      setRequestsLoading(false)
    }
  }

  const formatTime = (timestamp: FirestoreTimestamp | string | null | undefined): string => {
    if (!timestamp) return '\u2014'
    const date = typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp
      ? timestamp.toDate()
      : new Date(timestamp as string)
    if (isNaN(date.getTime())) return '\u2014'
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  if (loading) {
    return (
      <div className="friends-mgmt">
        <div className="friends-mgmt-loading">Loading friendships...</div>
      </div>
    )
  }

  return (
    <div className="friends-mgmt">
      <div className="friends-mgmt-header">
        <h3>Friends &amp; Chat Management</h3>
        <span className="friends-mgmt-count">{friendships.length} friendship{friendships.length !== 1 ? 's' : ''}</span>
      </div>

      {error && <div className="friends-mgmt-error">{error}</div>}

      {/* Friendships Table */}
      <div className="friends-mgmt-section">
        <div className="friends-mgmt-section-title">All Friendships</div>
        {friendships.length === 0 ? (
          <div className="friends-mgmt-empty">No friendships found.</div>
        ) : (
          <div className="friends-mgmt-table-wrapper">
            <table className="friends-mgmt-table">
              <thead>
                <tr>
                  <th>User 1</th>
                  <th>User 2</th>
                  <th>Since</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {friendships.map(f => {
                  const [uid1, uid2] = f.users || []
                  const name1 = f.usernames?.[uid1] || uid1
                  const name2 = f.usernames?.[uid2] || uid2
                  return (
                    <tr key={f.id}>
                      <td>
                        <div className="friends-mgmt-user">
                          <span className="friends-mgmt-username">{name1}</span>
                          <span className="friends-mgmt-uid">{uid1}</span>
                        </div>
                      </td>
                      <td>
                        <div className="friends-mgmt-user">
                          <span className="friends-mgmt-username">{name2}</span>
                          <span className="friends-mgmt-uid">{uid2}</span>
                        </div>
                      </td>
                      <td className="friends-mgmt-date">{formatTime(f.since)}</td>
                      <td className="friends-mgmt-actions">
                        <button
                          className="friends-mgmt-chat-btn"
                          onClick={() => handleViewChat(uid1, uid2, name1, name2)}
                        >
                          View Chat
                        </button>
                        <button
                          className="friends-mgmt-req-btn"
                          onClick={() => handleViewRequests(uid1, name1)}
                        >
                          Requests
                        </button>
                        <button
                          className="friends-mgmt-remove-btn"
                          onClick={() => handleRemoveFriendship(uid1, uid2, f.id)}
                          disabled={actionLoading === f.id}
                        >
                          {actionLoading === f.id ? 'Removing...' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chat Viewer */}
      {viewingChat && (
        <div className="friends-mgmt-section">
          <div className="friends-mgmt-section-title">
            Chat: {viewingChat.username1} &harr; {viewingChat.username2}
            <button className="friends-mgmt-close-btn" onClick={() => { setViewingChat(null); setChatMessages([]); }}>
              Close
            </button>
          </div>
          {chatLoading ? (
            <div className="friends-mgmt-loading">Loading messages...</div>
          ) : chatMessages.length === 0 ? (
            <div className="friends-mgmt-empty">No messages in this chat.</div>
          ) : (
            <div className="friends-mgmt-chat-list">
              {chatMessages.map(msg => (
                <div key={msg.id} className="friends-mgmt-chat-msg">
                  <div className="friends-mgmt-chat-msg-header">
                    <span className="friends-mgmt-chat-sender">{msg.senderUsername || msg.senderUid}</span>
                    <span className="friends-mgmt-chat-time">{formatTime(msg.sentAt)}</span>
                    <span className={`friends-mgmt-chat-read ${msg.read ? 'read' : 'unread'}`}>
                      {msg.read ? 'Read' : 'Unread'}
                    </span>
                  </div>
                  <div className="friends-mgmt-chat-msg-body">
                    <p className="friends-mgmt-chat-text">{msg.text}</p>
                    <button
                      className="friends-mgmt-delete-msg-btn"
                      onClick={() => handleDeleteMessage(msg.id)}
                      disabled={actionLoading === msg.id}
                    >
                      {actionLoading === msg.id ? '...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Requests Viewer */}
      {viewingRequests && (
        <div className="friends-mgmt-section">
          <div className="friends-mgmt-section-title">
            Requests for {viewingRequests.username}
            <button className="friends-mgmt-close-btn" onClick={() => { setViewingRequests(null); setUserRequests([]); }}>
              Close
            </button>
          </div>
          {requestsLoading ? (
            <div className="friends-mgmt-loading">Loading requests...</div>
          ) : userRequests.length === 0 ? (
            <div className="friends-mgmt-empty">No friend requests found.</div>
          ) : (
            <div className="friends-mgmt-table-wrapper">
              <table className="friends-mgmt-table">
                <thead>
                  <tr>
                    <th>Direction</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Responded</th>
                  </tr>
                </thead>
                <tbody>
                  {userRequests.map(req => (
                    <tr key={req.id}>
                      <td>
                        <span className={`friends-mgmt-direction ${req.direction}`}>
                          {req.direction === 'incoming' ? 'Incoming' : 'Outgoing'}
                        </span>
                      </td>
                      <td>{req.fromUsername || req.fromUid}</td>
                      <td>{req.toUsername || req.toUid}</td>
                      <td>
                        <span className={`friends-mgmt-status ${req.status}`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="friends-mgmt-date">{formatTime(req.createdAt)}</td>
                      <td className="friends-mgmt-date">{formatTime(req.respondedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default FriendsManagement
