import { useState } from 'react'
import { createPortal } from 'react-dom'
import { sendMessageToUser } from '../../services/presenceService'
import './SendMessageModal.css'

/**
 * Modal for admins to send a message to a specific user.
 * The message will appear as a popup banner on the recipient's screen.
 *
 * @param {{ recipientUser: object, onClose: function, senderUid: string, senderUsername: string }} props
 */
function SendMessageModal({ recipientUser, onClose, senderUid, senderUsername }) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const trimmed = message.trim()
    if (!trimmed) {
      setError('Message cannot be empty.')
      return
    }

    try {
      setSending(true)
      await sendMessageToUser(recipientUser.id, trimmed, senderUid, senderUsername)
      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1200)
    } catch (err) {
      console.error('Failed to send message:', err)
      setError(err.message || 'Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  return createPortal(
    <div className="send-msg-overlay" onClick={onClose}>
      <div className="send-msg-content" onClick={e => e.stopPropagation()}>
        <button className="send-msg-close" onClick={onClose}>&times;</button>

        <h3 className="send-msg-title">
          Send Message to <span className="send-msg-recipient">{recipientUser.username || recipientUser.id}</span>
        </h3>

        {error && <div className="send-msg-error">{error}</div>}
        {success && <div className="send-msg-success">Message sent!</div>}

        <form onSubmit={handleSubmit} className="send-msg-form">
          <div className="send-msg-field">
            <label className="send-msg-label" htmlFor="admin-message">Message</label>
            <textarea
              id="admin-message"
              className="send-msg-textarea"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value)
                setError(null)
              }}
              placeholder="Type your message here..."
              disabled={sending || success}
              rows={4}
              maxLength={500}
            />
            <span className="send-msg-char-count">
              {message.length}/500
            </span>
          </div>

          <div className="send-msg-actions">
            <button
              type="submit"
              className="send-msg-send"
              disabled={sending || success || !message.trim()}
            >
              {sending ? 'Sending...' : success ? 'Sent!' : 'Send Message'}
            </button>
            <button
              type="button"
              className="send-msg-cancel"
              onClick={onClose}
              disabled={sending}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default SendMessageModal
