import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ChatNotificationItem } from '../../hooks/useChatNotifications';
import './ChatNotificationBanner.css';

const AUTO_DISMISS_MS = 5_000; // 5 seconds – brief

interface ChatNotificationBannerProps {
  notifications: ChatNotificationItem[];
  onDismiss: (id: string) => void;
}

interface FirestoreTimestamp {
  toDate?: () => Date;
  toMillis?: () => number;
}

function formatTime(sentAt: ChatNotificationItem['sentAt']): string {
  if (!sentAt) return '';
  let date: Date;
  if (typeof sentAt === 'object' && sentAt !== null) {
    const timestamp = sentAt as FirestoreTimestamp;
    if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (typeof timestamp.toMillis === 'function') {
      date = new Date(timestamp.toMillis());
    } else {
      return '';
    }
  } else if (typeof sentAt === 'string' || typeof sentAt === 'number') {
    date = new Date(sentAt);
  } else {
    return '';
  }
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Renders chat message notifications at the top of the viewport.
 * Shows who sent the message and the text, with an X to close and auto-dismiss after a few seconds.
 */
function ChatNotificationBanner({
  notifications,
  onDismiss
}: ChatNotificationBannerProps): React.ReactElement | null {
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const currentTimers = timersRef.current;

    notifications.forEach((item) => {
      if (!currentTimers[item.id]) {
        currentTimers[item.id] = setTimeout(() => {
          onDismiss(item.id);
          delete currentTimers[item.id];
        }, AUTO_DISMISS_MS);
      }
    });

    Object.keys(currentTimers).forEach((id) => {
      if (!notifications.find((n) => n.id === id)) {
        clearTimeout(currentTimers[id]);
        delete currentTimers[id];
      }
    });

    return () => {
      Object.values(currentTimers).forEach(clearTimeout);
      timersRef.current = {};
    };
  }, [notifications, onDismiss]);

  if (!notifications || notifications.length === 0) return null;

  return createPortal(
    <div className="chat-notification-container">
      {notifications.map((item) => (
        <div key={item.id} className="chat-notification">
          <div className="chat-notification-content">
            <div className="chat-notification-header">
              <span className="chat-notification-sender">{item.senderUsername}</span>
              <span className="chat-notification-time">{formatTime(item.sentAt)}</span>
            </div>
            <p className="chat-notification-text">{item.text}</p>
          </div>
          <button
            type="button"
            className="chat-notification-dismiss"
            onClick={() => onDismiss(item.id)}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}

export default ChatNotificationBanner;
