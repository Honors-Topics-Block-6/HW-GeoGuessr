import { useState, type FormEvent } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { checkEmailVerificationStatus } from '../../services/userService';
import './LoginScreen.css';

interface FirebaseError extends Error {
  code?: string;
}

function LoginScreen(): React.ReactElement {
  const { login, signup, loginWithGoogle, needsUsername, completeGoogleSignUp } = useAuth();

  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [googleUsername, setGoogleUsername] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showForgotPassword, setShowForgotPassword] = useState<boolean>(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState<string>('');
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState<string>('');

  const handleEmailSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        if (!username.trim()) {
          throw new Error('Username is required.');
        }
        if (username.trim().length < 3) {
          throw new Error('Username must be at least 3 characters.');
        }
        await signup(email, password, username.trim());
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(getErrorMessage(err as FirebaseError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async (): Promise<void> => {
    setError('');
    setIsSubmitting(true);

    try {
      await loginWithGoogle();
    } catch (err) {
      setError(getErrorMessage(err as FirebaseError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleUsernameSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (!googleUsername.trim()) {
        throw new Error('Username is required.');
      }
      if (googleUsername.trim().length < 3) {
        throw new Error('Username must be at least 3 characters.');
      }
      await completeGoogleSignUp(googleUsername.trim());
    } catch (err) {
      setError(getErrorMessage(err as FirebaseError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = (): void => {
    setIsSignUp(!isSignUp);
    setError('');
    setShowForgotPassword(false);
    setForgotPasswordSuccess('');
  };

  const handleForgotPassword = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setForgotPasswordSuccess('');
    setIsSubmitting(true);

    try {
      if (!forgotPasswordEmail.trim()) {
        throw new Error('Please enter your email address.');
      }

      // Check if the account exists and is verified
      const { exists, verified } = await checkEmailVerificationStatus(forgotPasswordEmail.trim());

      if (!exists) {
        throw new Error('No account found with this email address.');
      }

      if (!verified) {
        throw new Error('This account has not been verified. Please verify your email before requesting a password reset.');
      }

      // Account is verified, send the password reset email
      await sendPasswordResetEmail(auth, forgotPasswordEmail.trim());
      setForgotPasswordSuccess('Password reset email sent! Check your inbox.');
      setForgotPasswordEmail('');
    } catch (err) {
      setError(getErrorMessage(err as FirebaseError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleForgotPassword = (): void => {
    setShowForgotPassword(!showForgotPassword);
    setError('');
    setForgotPasswordSuccess('');
    // Pre-fill the email if they've already entered it
    if (!showForgotPassword && email) {
      setForgotPasswordEmail(email);
    }
  };

  // If user signed in with Google but needs to set a username
  if (needsUsername) {
    return (
      <div className="login-screen">
        <div className="login-background">
          <div className="login-overlay"></div>
        </div>
        <div className="login-card">
          <div className="login-logo">
            <span className="login-logo-icon">🌍</span>
          </div>
          <h1 className="login-title">Choose a Username</h1>
          <p className="login-subtitle">One last step to complete your account</p>

          {error && <div className="login-error">{error}</div>}

          <form onSubmit={handleGoogleUsernameSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="google-username">Username</label>
              <input
                id="google-username"
                type="text"
                value={googleUsername}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGoogleUsername(e.target.value)}
                placeholder="Pick a username"
                autoFocus
                disabled={isSubmitting}
              />
            </div>

            <button type="submit" className="login-submit-button" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="login-spinner"></span>
                  Saving...
                </>
              ) : (
                'Continue'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-background">
        <div className="login-overlay"></div>
      </div>
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-icon">🌍</span>
        </div>
        <h1 className="login-title">HW Geoguessr</h1>
        <p className="login-subtitle">
          {isSignUp ? 'Create your account' : 'Sign in to play'}
        </p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleEmailSubmit} className="login-form">
          {isSignUp && (
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                placeholder="Choose a username"
                disabled={isSubmitting}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={isSubmitting}
            />
          </div>

          {!isSignUp && (
            <button
              type="button"
              className="forgot-password-link"
              onClick={toggleForgotPassword}
            >
              Forgot Password?
            </button>
          )}

          <button type="submit" className="login-submit-button" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <span className="login-spinner"></span>
                {isSignUp ? 'Creating Account...' : 'Signing In...'}
              </>
            ) : (
              isSignUp ? 'Create Account' : 'Log In'
            )}
          </button>
        </form>

        {showForgotPassword && (
          <div className="forgot-password-panel">
            <h3 className="forgot-password-title">Reset Password</h3>
            <p className="forgot-password-description">
              Enter your email address and we&apos;ll send you a link to reset your password.
              <br />
              <strong>Note:</strong> Your account must be verified to request a password reset.
            </p>

            {forgotPasswordSuccess && (
              <div className="login-success">{forgotPasswordSuccess}</div>
            )}

            <form onSubmit={handleForgotPassword} className="forgot-password-form">
              <div className="form-group">
                <label htmlFor="forgot-email">Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={forgotPasswordEmail}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForgotPasswordEmail(e.target.value)}
                  placeholder="Enter your email"
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>

              <div className="forgot-password-buttons">
                <button
                  type="button"
                  className="forgot-password-cancel"
                  onClick={toggleForgotPassword}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="forgot-password-submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="login-spinner"></span>
                      Sending...
                    </>
                  ) : (
                    'Send Reset Email'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="login-divider">
          <span>or</span>
        </div>

        <button
          className="google-button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
        >
          <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {isSignUp ? 'Sign up with Google' : 'Sign in with Google'}
        </button>

        <p className="login-toggle">
          {isSignUp ? (
            <>
              Already have an account?{' '}
              <button className="toggle-link" onClick={toggleMode}>
                Log in
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{' '}
              <button className="toggle-link" onClick={toggleMode}>
                Sign up
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * Convert Firebase error codes to user-friendly messages
 */
function getErrorMessage(err: FirebaseError): string {
  const code = err?.code;
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    default:
      return err.message || 'An unexpected error occurred.';
  }
}

export default LoginScreen;
