import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent, type ChangeEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useChat, type ChatMessage } from '../../hooks/useChat';
import { censorText } from '../../utils/chatCensor';
import './ChatWindow.css';

interface FirestoreTimestamp {
  toDate: () => Date;
  toMillis?: () => number;
}

export interface ChatWindowProps {
  friendUid: string;
  friendUsername: string;
  onBack: () => void;
  onJoinLobby?: (msg: ChatMessage) => void;
}

function ChatWindow({ friendUid, friendUsername, onBack, onJoinLobby }: ChatWindowProps): React.ReactElement {
  const { user, userDoc } = useAuth();
  const { messages, sendMessage, loading } = useChat(
    user?.uid ?? null,
    userDoc?.username || 'You',
    friendUid
  );

  const [text, setText] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const emojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
    '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
    '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸',
    '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️',
    '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡',
    '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓',
    '😴', '😵', '😵‍💫', '🤐', '🤗', '🤔', '🫢', '🫣', '🫡', '🤫',
    '🤭', '🙄', '😬', '😮‍💨', '😮', '😲', '🥱', '😪', '😷', '🤒',
    '🤕', '🤢', '🤮', '🤧', '😇', '🥴', '🤥', '🤠', '🥹', '🫠',
    '👋', '🤚', '✋', '🖐️', '👌', '🤌', '🤏', '✌️', '🤞', '🫰',
    '🤟', '🤘', '🤙', '👍', '👎', '👊', '✊', '🤛', '🤜', '👏',
    '🙌', '🫶', '🙏', '🤝', '💪', '🦾', '🧠', '🫀', '🫁', '🦵',
    '🦶', '👀', '👁️', '👄', '🫦', '💋', '❤️', '🧡', '💛', '💚',
    '💙', '💜', '🤎', '🖤', '🤍', '💔', '❤️‍🔥', '❤️‍🩹', '💖', '💘',
    '💕', '💞', '💓', '💗', '💝', '💯', '✨', '⚡', '🔥', '💥',
    '💫', '🎉', '🎊', '🎯', '🏆', '🥇', '🥈', '🥉', '🎮', '🕹️',
    '🎲', '🧩', '🧠', '📍', '🗺️', '🧭', '🌍', '🌎', '🌏', '🌟',
    '🌈', '☀️', '⛅', '🌧️', '⛈️', '❄️', '🌊', '🌙', '🌌', '⭐',
    '🚀', '🛸', '🧳', '🎒', '🏕️', '🏖️', '🏙️', '🏡', '🚗', '🚲',
    '🚆', '✈️', '🚢', '🎵', '🎧', '🎸', '🎹', '🎺', '🥁', '🎤',
    '🍕', '🍔', '🍟', '🌭', '🍿', '🥤', '☕', '🧋', '🍩', '🍪',
    '🍫', '🍦', '🍰', '🧁', '🍓', '🍉', '🍎', '🍌', '🍇', '🥑'
  ];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (!isEmojiOpen) return;
    const handleOutsideClick = (event: MouseEvent): void => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setIsEmojiOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isEmojiOpen]);

  const handleSend = async (e: FormEvent<HTMLFormElement> | KeyboardEvent<HTMLTextAreaElement>): Promise<void> => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      await sendMessage(trimmed);
      setText('');
      setIsEmojiOpen(false);
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
      return;
    }
    if (e.key === 'Escape' && isEmojiOpen) {
      setIsEmojiOpen(false);
    }
  };

  const handleEmojiSelect = (emoji: string): void => {
    setText((prev) => `${prev}${emoji}`);
    setIsEmojiOpen(false);
  };

  const formatTime = (timestamp: unknown): string => {
    if (!timestamp) return '';
    const date = typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp
      ? (timestamp as FirestoreTimestamp).toDate()
      : new Date();
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    if (isToday) return time;
    if (isYesterday) return `Yesterday ${time}`;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    }) + ' ' + time;
  };

  return (
    <div className="chat-window">
      <div className="chat-background">
        <div className="chat-overlay"></div>
      </div>
      <div className="chat-card">
        {/* Header */}
        <div className="chat-header">
          <button className="chat-back-button" onClick={onBack}>
            ← Back
          </button>
          <div className="chat-header-info">
            <span className="chat-header-username">{friendUsername}</span>
          </div>
        </div>

        {/* Messages Area */}
        <div className="chat-messages" ref={messagesContainerRef}>
          {loading ? (
            <div className="chat-loading">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="chat-empty">
              <span className="chat-empty-icon">💬</span>
              <p>No messages yet</p>
              <p className="chat-empty-hint">Say hello to {friendUsername}!</p>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => {
                const isMe = msg.senderUid === user?.uid;
                const isInvite = msg.type === 'lobby_invite';
                const showTimestamp = index === 0 ||
                  (() => {
                    const prev = messages[index - 1];
                    if (!prev?.sentAt || !msg.sentAt) return true;
                    const prevSentAt = prev.sentAt as { toMillis?: () => number };
                    const msgSentAt = msg.sentAt as { toMillis?: () => number };
                    const prevTime = prevSentAt.toMillis?.() || 0;
                    const msgTime = msgSentAt.toMillis?.() || 0;
                    return (msgTime - prevTime) > 5 * 60 * 1000; // 5 min gap
                  })();

                return (
                  <div key={msg.id}>
                    {showTimestamp && msg.sentAt && (
                      <div className="chat-timestamp-divider">
                        {formatTime(msg.sentAt)}
                      </div>
                    )}

                    {isInvite ? (
                      /* ── Lobby Invite Card ── */
                      <div className={`chat-message ${isMe ? 'mine' : 'theirs'}`}>
                        <div className="chat-invite-card">
                          <div className="chat-invite-icon">⚔️</div>
                          <p className="chat-invite-text">{censorText(msg.text)}</p>
                          {!isMe && onJoinLobby && (
                            <button
                              className="chat-invite-join-btn"
                              onClick={() => onJoinLobby(msg)}
                            >
                              Join Duel
                            </button>
                          )}
                          {isMe && (
                            <span className="chat-invite-sent-label">Invite Sent</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* ── Normal Message Bubble ── */
                      <div className={`chat-message ${isMe ? 'mine' : 'theirs'}`}>
                        <div className={`chat-bubble ${isMe ? 'mine' : 'theirs'}`}>
                          <p className="chat-bubble-text">{censorText(msg.text)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <form className="chat-input-area" onSubmit={handleSend}>
          <div className="chat-emoji-wrapper" ref={emojiPickerRef}>
            <button
              type="button"
              className="chat-emoji-button"
              onClick={() => setIsEmojiOpen((prev) => !prev)}
              aria-label="Open emoji picker"
            >
              🔥
            </button>
            {isEmojiOpen && (
              <div className="chat-emoji-picker" role="menu" aria-label="Emoji picker">
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="chat-emoji-item"
                    onClick={() => handleEmojiSelect(emoji)}
                    aria-label={`Insert ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            className="chat-input"
            placeholder="Type a message..."
            value={text}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            rows={1}
            maxLength={1000}
          />
          <button
            type="submit"
            className="chat-send-button"
            disabled={sending || !text.trim()}
          >
            {sending ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatWindow;
