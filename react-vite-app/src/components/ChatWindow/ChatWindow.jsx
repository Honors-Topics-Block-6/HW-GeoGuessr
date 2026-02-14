import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../hooks/useChat';
import './ChatWindow.css';

function ChatWindow({ friendUid, friendUsername, onBack }) {
  const { user, userDoc } = useAuth();
  const { messages, sendMessage, loading } = useChat(
    user?.uid,
    userDoc?.username || 'You',
    friendUid
  );

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      await sendMessage(trimmed);
      setText('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
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
                const showTimestamp = index === 0 ||
                  (() => {
                    const prev = messages[index - 1];
                    if (!prev?.sentAt || !msg.sentAt) return true;
                    const prevTime = prev.sentAt.toMillis?.() || 0;
                    const msgTime = msg.sentAt.toMillis?.() || 0;
                    return (msgTime - prevTime) > 5 * 60 * 1000; // 5 min gap
                  })();

                return (
                  <div key={msg.id}>
                    {showTimestamp && msg.sentAt && (
                      <div className="chat-timestamp-divider">
                        {formatTime(msg.sentAt)}
                      </div>
                    )}
                    <div className={`chat-message ${isMe ? 'mine' : 'theirs'}`}>
                      <div className={`chat-bubble ${isMe ? 'mine' : 'theirs'}`}>
                        <p className="chat-bubble-text">{msg.text}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <form className="chat-input-area" onSubmit={handleSend}>
          <textarea
            className="chat-input"
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
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
