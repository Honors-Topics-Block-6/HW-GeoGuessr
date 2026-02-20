import { useEffect, useRef, useState } from 'react';
import { copyTextToClipboard } from '../../utils/clipboard';
import './CopyResultsButton.css';

type CopyState = 'idle' | 'success' | 'error';

export interface CopyResultsButtonProps {
  text: string;
  className?: string;
  buttonLabel?: string;
  successMessage?: string;
  errorMessage?: string;
  disabled?: boolean;
}

function CopyResultsButton({
  text,
  className,
  buttonLabel = 'Copy Results',
  successMessage = 'Results copied to clipboard!',
  errorMessage = 'Could not copy results. Please try again.',
  disabled = false
}: CopyResultsButtonProps): React.ReactElement {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [isCopying, setIsCopying] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const feedback =
    copyState === 'success' ? successMessage :
      copyState === 'error' ? errorMessage :
        null;

  const handleCopy = async (): Promise<void> => {
    if (disabled || isCopying) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);

    setIsCopying(true);
    setCopyState('idle');

    try {
      await copyTextToClipboard(text);
      setCopyState('success');
    } catch (err) {
      console.warn('Copy failed:', err);
      setCopyState('error');
    } finally {
      setIsCopying(false);
      timerRef.current = window.setTimeout(() => setCopyState('idle'), 2500);
    }
  };

  return (
    <div className={`copy-results-wrapper ${className ?? ''}`.trim()}>
      <button
        type="button"
        className="copy-results-button"
        onClick={handleCopy}
        disabled={disabled || isCopying}
      >
        <span className="button-icon">📋</span>
        {isCopying ? 'Copying...' : buttonLabel}
      </button>

      {feedback && (
        <div
          className={`copy-results-feedback ${copyState}`}
          role={copyState === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {feedback}
        </div>
      )}
    </div>
  );
}

export default CopyResultsButton;

