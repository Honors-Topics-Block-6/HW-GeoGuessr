import { useState, type FormEvent, type ChangeEvent } from 'react';

export interface GameCodeInputProps {
  onJoin: (code: string) => void;
  isJoining: boolean;
}

function GameCodeInput({ onJoin, isJoining }: GameCodeInputProps): React.ReactElement {
  const [code, setCode] = useState<string>('');

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    // Uppercase, strip non-alphanumeric, max 6 chars
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setCode(value);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (code.length === 6 && !isJoining) {
      onJoin(code);
    }
  };

  return (
    <form className="code-input-form" onSubmit={handleSubmit}>
      <input
        type="text"
        className="code-input"
        value={code}
        onChange={handleChange}
        placeholder="XXXXXX"
        maxLength={6}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="submit"
        className="code-join-btn"
        disabled={code.length !== 6 || isJoining}
      >
        {isJoining ? (
          <>
            <span className="lobby-spinner"></span>
            Joining...
          </>
        ) : (
          'Join'
        )}
      </button>
    </form>
  );
}

export default GameCodeInput;
