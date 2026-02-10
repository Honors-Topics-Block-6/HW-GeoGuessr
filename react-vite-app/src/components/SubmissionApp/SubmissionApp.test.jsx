import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubmissionApp from './SubmissionApp';

// Mock child components to isolate SubmissionApp testing
vi.mock('./SubmissionForm', () => ({
  default: () => <div data-testid="submission-form">Submission Form</div>
}));

vi.mock('./AdminTabs', () => ({
  default: ({ activeTab, onTabChange, onBack }) => (
    <div data-testid="admin-tabs">
      <span>Active Tab: {activeTab}</span>
      <button onClick={onBack}>Back from Admin</button>
      <button onClick={() => onTabChange('mapEditor')}>Change Tab</button>
    </div>
  )
}));

describe('SubmissionApp', () => {
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial render', () => {
    it('should render the header with title', () => {
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(screen.getByText('Photo Submission')).toBeInTheDocument();
    });

    it('should render back to game button', () => {
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(screen.getByText('← Back to Game')).toBeInTheDocument();
    });

    it('should render review button', () => {
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(screen.getByText('Review')).toBeInTheDocument();
    });

    it('should render SubmissionForm by default', () => {
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(screen.getByTestId('submission-form')).toBeInTheDocument();
    });

    it('should not render AdminTabs initially', () => {
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(screen.queryByTestId('admin-tabs')).not.toBeInTheDocument();
    });

    it('should not show password prompt initially', () => {
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(screen.queryByText('Admin Access')).not.toBeInTheDocument();
    });
  });

  describe('back to game button', () => {
    it('should call onBack when clicked', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('← Back to Game'));

      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('admin authentication', () => {
    it('should show password prompt when Review is clicked', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Review'));

      expect(screen.getByText('Admin Access')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
    });

    it('should show Submit and Cancel buttons in password modal', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Review'));

      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('should close password prompt when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Review'));
      expect(screen.getByText('Admin Access')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByText('Admin Access')).not.toBeInTheDocument();
    });

    it('should show error for incorrect password', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Review'));
      await user.type(screen.getByPlaceholderText('Enter password'), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(screen.getByText('Incorrect password')).toBeInTheDocument();
    });

    it('should clear password input after incorrect attempt', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Review'));
      const passwordInput = screen.getByPlaceholderText('Enter password');
      await user.type(passwordInput, 'wrongpassword');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(passwordInput).toHaveValue('');
    });

    it('should show AdminTabs after correct password', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Review'));
      await user.type(screen.getByPlaceholderText('Enter password'), '1234');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(screen.getByTestId('admin-tabs')).toBeInTheDocument();
      expect(screen.queryByTestId('submission-form')).not.toBeInTheDocument();
    });

    it('should close password prompt after successful authentication', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Review'));
      await user.type(screen.getByPlaceholderText('Enter password'), '1234');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(screen.queryByText('Admin Access')).not.toBeInTheDocument();
    });

    it('should skip password prompt if already authenticated', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      // First authentication
      await user.click(screen.getByText('Review'));
      await user.type(screen.getByPlaceholderText('Enter password'), '1234');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      // Go back to submission form
      await user.click(screen.getByText('Back from Admin'));

      // Click Review again - should not show password prompt
      await user.click(screen.getByText('Review'));

      expect(screen.queryByText('Admin Access')).not.toBeInTheDocument();
      expect(screen.getByTestId('admin-tabs')).toBeInTheDocument();
    });

    it('should submit password on Enter key', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Review'));
      const passwordInput = screen.getByPlaceholderText('Enter password');
      await user.type(passwordInput, '1234{Enter}');

      expect(screen.getByTestId('admin-tabs')).toBeInTheDocument();
    });
  });

  describe('admin panel navigation', () => {
    it('should pass activeTab to AdminTabs', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Review'));
      await user.type(screen.getByPlaceholderText('Enter password'), '1234');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(screen.getByText('Active Tab: review')).toBeInTheDocument();
    });

    it('should return to SubmissionForm when back is clicked in AdminTabs', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Review'));
      await user.type(screen.getByPlaceholderText('Enter password'), '1234');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      await user.click(screen.getByText('Back from Admin'));

      expect(screen.getByTestId('submission-form')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-tabs')).not.toBeInTheDocument();
    });

    it('should handle tab change callback', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Review'));
      await user.type(screen.getByPlaceholderText('Enter password'), '1234');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      await user.click(screen.getByText('Change Tab'));

      expect(screen.getByText('Active Tab: mapEditor')).toBeInTheDocument();
    });
  });

  describe('password modal overlay', () => {
    it('should have password-modal-overlay class', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Review'));

      expect(document.querySelector('.password-modal-overlay')).toBeInTheDocument();
    });

    it('should have password-modal class for modal content', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Review'));

      expect(document.querySelector('.password-modal')).toBeInTheDocument();
    });
  });
});
