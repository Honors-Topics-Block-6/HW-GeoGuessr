import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './MessageBanner.css'

const AUTO_DISMISS_MS = 10_000 // 10 seconds

/**
 * Renders admin messages as popup banners at the top of the viewport.
 * Uses createPortal to render into document.body so it overlays everything.
 *
 * @param {{ messages: Array, onDismiss: function }} props
 */
function MessageBanner({ messages, onDismiss }) {
  const timersRef = useRef({})

  // Set up auto-dismiss timers for each message
  useEffect(() => {
    const currentTimers = timersRef.current

    messages.forEach((msg) => {
      if (!currentTimers[msg.id]) {
        currentTimers[msg.id] = setTimeout(() => {
          onDismiss(msg.id)
          delete currentTimers[msg.id]
        }, AUTO_DISMISS_MS)
      }
    })

    // Cleanup timers for messages that are no longer present
    Object.keys(currentTimers).forEach((id) => {
      if (!messages.find((m) => m.id === id)) {
        clearTimeout(currentTimers[id])
        delete currentTimers[id]
      }
    })

    return () => {
      // Cleanup all timers on unmount
      Object.values(currentTimers).forEach(clearTimeout)
      timersRef.current = {}
    }
  }, [messages, onDismiss])

  if (!messages || messages.length === 0) return null

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    if (isNaN(date.getTime())) return ''
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return createPortal(
    <div className="message-banner-container">
      {messages.map((msg) => (
        <div key={msg.id} className="message-banner">
          <div className="message-banner-content">
            <div className="message-banner-header">
              <span className="message-banner-sender">
                From: {msg.senderUsername || 'Admin'}
              </span>
              <span className="message-banner-time">{formatTime(msg.sentAt)}</span>
            </div>
            <p className="message-banner-text">{msg.text}</p>
          </div>
          <button
            className="message-banner-dismiss"
            onClick={() => onDismiss(msg.id)}
            aria-label="Dismiss message"
          >
            &times;
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}

export default MessageBanner
