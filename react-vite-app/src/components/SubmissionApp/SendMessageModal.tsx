import { useState } from 'react'
import { createPortal } from 'react-dom'
import { sendMessageToUser } from '../../services/presenceService'
import './SendMessageModal.css'

export interface RecipientUser {
  id: string
  username?: string
  email?: string
}

export interface SendMessageModalProps {
  recipientUser: RecipientUser
  onClose: () => void
  senderUid: string | undefined
  senderUsername: string
}

function SendMessageModal({ recipientUser, onClose, senderUid, senderUsername: defaultSenderUsername }: SendMessageModalProps): React.JSX.Element {
  const [message, setMessage] = useState<string>('')
  const [sending, setSending] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<boolean>(false)
  const [senderName, setSenderName] = useState<string>(defaultSenderUsername)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setError(null)

    const trimmed = message.trim()
    if (!trimmed) {
      setError('Message cannot be empty.')
      return
    }

    const displayName = senderName.trim() || 'Admin'

    try {
      setSending(true)
      await sendMessageToUser(
        recipientUser.id,
        trimmed,
        senderUid ?? '',
        displayName
      )
      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1200)
    } catch (err) {
      console.error('Failed to send message:', err)
      setError((err as Error).message || 'Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  return createPortal(
    <div className="send-msg-overlay" onClick={onClose}>
      <div className="send-msg-content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <button className="send-msg-close" onClick={onClose}>&times;</button>

        <h3 className="send-msg-title">
          Send Message to <span className="send-msg-recipient">{recipientUser.username || recipientUser.id}</span>
        </h3>

        {error && <div className="send-msg-error">{error}</div>}
        {success && <div className="send-msg-success">Message sent!</div>}

        <form onSubmit={handleSubmit} className="send-msg-form">
          <div className="send-msg-field">
            <label className="send-msg-label" htmlFor="sender-name-single">Send As</label>
            <input
              id="sender-name-single"
              type="text"
              className="send-msg-input"
              value={senderName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSenderName(e.target.value)}
              placeholder="Enter sender display name..."
              disabled={sending || success}
              maxLength={50}
            />
          </div>

          <div className="send-msg-field">
            <label className="send-msg-label" htmlFor="admin-message">Message</label>
            <textarea
              id="admin-message"
              className="send-msg-textarea"
              value={message}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
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

          <div className="send-msg-preview">
            <span className="send-msg-preview-label">Recipient will see:</span>
            <span className="send-msg-preview-sender">From: {senderName.trim() || 'Admin'}</span>
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
