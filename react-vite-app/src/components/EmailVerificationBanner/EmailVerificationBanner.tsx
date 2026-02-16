import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './EmailVerificationBanner.css';

type ResendStatus = 'idle' | 'sending' | 'sent' | 'error';

export interface EmailVerificationBannerProps {}

function EmailVerificationBanner(_props: EmailVerificationBannerProps): React.ReactElement | null {
  const { user, emailVerified, sendVerificationEmail } = useAuth();
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [resendStatus, setResendStatus] = useState<ResendStatus>('idle');
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);

  // Manage cooldown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const timer = setTimeout(() => {
      setCooldownSeconds((prev: number) => {
        const next = prev - 1;
        if (next <= 0) {
          setResendStatus('idle');
        }
        return next;
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  const handleResend = useCallback(async (): Promise<void> => {
    if (cooldownSeconds > 0 || resendStatus === 'sending') return;

    setResendStatus('sending');
    try {
      await sendVerificationEmail();
      setResendStatus('sent');
      setCooldownSeconds(60);
    } catch {
      setResendStatus('error');
      setTimeout(() => setResendStatus('idle'), 3000);
    }
  }, [cooldownSeconds, resendStatus, sendVerificationEmail]);

  // Don't show banner if: no user, already verified, Google user, or dismissed
  const isGoogleUser = user?.providerData?.some((p) => p.providerId === 'google.com');
  if (!user || emailVerified || isGoogleUser || dismissed) {
    return null;
  }

  return (
    <div className="email-verification-banner">
      <div className="email-verification-banner-content">
        <span className="email-verification-banner-icon">&#9993;</span>
        <span className="email-verification-banner-text">
          Please verify your email address. Check your inbox for a verification link.
        </span>
        <button
          className="email-verification-banner-resend"
          onClick={handleResend}
          disabled={resendStatus === 'sending' || cooldownSeconds > 0}
        >
          {resendStatus === 'sending'
            ? 'Sending...'
            : resendStatus === 'sent'
              ? `Sent! (${cooldownSeconds}s)`
              : resendStatus === 'error'
                ? 'Failed \u2014 Retry'
                : 'Resend Email'}
        </button>
        <button
          className="email-verification-banner-dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

export default EmailVerificationBanner;
