import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './AuthScreen.css';

function AuthScreen({ onClose, onSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { signUp, logIn } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        await logIn(email, password);
      } else {
        if (!displayName.trim()) {
          setError('Please enter a display name');
          setIsLoading(false);
          return;
        }
        await signUp(email, password, displayName.trim());
      }
      onSuccess?.();
    } catch (err) {
      console.error('Auth error:', err);
      switch (err.code) {
        case 'auth/email-already-in-use':
          setError('This email is already registered. Try logging in.');
          break;
        case 'auth/invalid-email':
          setError('Please enter a valid email address.');
          break;
        case 'auth/weak-password':
          setError('Password should be at least 6 characters.');
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setError('Invalid email or password.');
          break;
        default:
          setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
  };

  return (
    <div className="auth-screen">
      <div className="auth-background">
        <div className="auth-gradient-orb auth-orb-1"></div>
        <div className="auth-gradient-orb auth-orb-2"></div>
        <div className="auth-gradient-orb auth-orb-3"></div>
      </div>

      <button className="auth-close-button" onClick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <span className="auth-logo-icon">🌍</span>
          </div>
          <h1 className="auth-title">{isLogin ? 'Welcome Back' : 'Join the Game'}</h1>
          <p className="auth-subtitle">
            {isLogin
              ? 'Sign in to track your progress and compete'
              : 'Create an account to save your scores'}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="auth-field">
              <label htmlFor="displayName" className="auth-label">Display Name</label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">👤</span>
                <input
                  type="text"
                  id="displayName"
                  className="auth-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your username"
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="email" className="auth-label">Email</label>
            <div className="auth-input-wrapper">
              <span className="auth-input-icon">✉️</span>
              <input
                type="email"
                id="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="password" className="auth-label">Password</label>
            <div className="auth-input-wrapper">
              <span className="auth-input-icon">🔒</span>
              <input
                type="password"
                id="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                disabled={isLoading}
              />
            </div>
          </div>

          {error && (
            <div className="auth-error">
              <span className="auth-error-icon">⚠️</span>
              {error}
            </div>
          )}

          <button type="submit" className="auth-submit-button" disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="auth-spinner"></span>
                {isLogin ? 'Signing in...' : 'Creating account...'}
              </>
            ) : (
              <>
                <span className="auth-button-icon">{isLogin ? '🚀' : '✨'}</span>
                {isLogin ? 'Sign In' : 'Create Account'}
              </>
            )}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button className="auth-skip-button" onClick={onClose}>
          Continue as Guest
          <span className="auth-skip-note">Progress won't be saved</span>
        </button>

        <div className="auth-toggle">
          <span className="auth-toggle-text">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
          </span>
          <button type="button" className="auth-toggle-button" onClick={toggleMode}>
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;

