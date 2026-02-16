import { useState } from 'react'
import { createPortal } from 'react-dom'
import { sendMessageToAllUsers } from '../../services/presenceService'
import './SendMessageModal.css'

export interface SendMessageAllUser {
  id: string
  username?: string
  email?: string
}

export interface SendMessageAllResult {
  sent: number
  failed: number
}

export interface SendMessageAllModalProps {
  users: SendMessageAllUser[]
  onClose: () => void
  currentUid: string | undefined
  currentUsername: string
}

function SendMessageAllModal({ users, onClose, currentUid, currentUsername }: SendMessageAllModalProps): React.JSX.Element {
  const [message, setMessage] = useState<string>('')
  const [sending, setSending] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<boolean>(false)
  const [result, setResult] = useState<SendMessageAllResult | null>(null)
  const [senderName, setSenderName] = useState<string>(currentUsername)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setError(null)

    const trimmed = message.trim()
    if (!trimmed) {
      setError('Message cannot be empty.')
      return
    }

    const recipientUids = users.map(u => u.id)
    if (recipientUids.length === 0) {
      setError('No users to message.')
      return
    }

    const displayName = senderName.trim() || 'Admin'

    try {
      setSending(true)
      const res = await sendMessageToAllUsers(
        recipientUids,
        trimmed,
        currentUid ?? '',
        displayName
      )
      setResult(res as SendMessageAllResult)
      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (err) {
      console.error('Failed to send message to all:', err)
      setError((err as Error).message || 'Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  return createPortal(
    <div className="send-msg-overlay" onClick={onClose}>
      <div className="send-msg-content send-msg-content-wide" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <button className="send-msg-close" onClick={onClose}>&times;</button>

        <h3 className="send-msg-title">
          Message All Users <span className="send-msg-recipient">({users.length} users)</span>
        </h3>

        {error && <div className="send-msg-error">{error}</div>}
        {success && (
          <div className="send-msg-success">
            Messages sent to {result?.sent || 0} user{result?.sent !== 1 ? 's' : ''}!
            {result?.failed && result.failed > 0 && ` (${result.failed} failed)`}
          </div>
        )}

        <form onSubmit={handleSubmit} className="send-msg-form">
          <div className="send-msg-field">
            <label className="send-msg-label" htmlFor="sender-name-all">Send As</label>
            <input
              id="sender-name-all"
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
            <label className="send-msg-label" htmlFor="admin-message-all">Message</label>
            <textarea
              id="admin-message-all"
              className="send-msg-textarea"
              value={message}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                setMessage(e.target.value)
                setError(null)
              }}
              placeholder="Type your broadcast message here..."
              disabled={sending || success}
              rows={4}
              maxLength={500}
            />
            <span className="send-msg-char-count">
              {message.length}/500
            </span>
          </div>

          <div className="send-msg-preview">
            <span className="send-msg-preview-label">Recipients will see:</span>
            <span className="send-msg-preview-sender">From: {senderName.trim() || 'Admin'}</span>
          </div>

          <div className="send-msg-actions">
            <button
              type="submit"
              className="send-msg-send send-msg-send-all"
              disabled={sending || success || !message.trim()}
            >
              {sending ? 'Sending...' : success ? 'Sent!' : `Send to All ${users.length} Users`}
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

export default SendMessageAllModal
