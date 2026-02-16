import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubmissionApp from './SubmissionApp';

// Mock Firebase to avoid initialization errors
vi.mock('../../firebase', () => ({
  db: {},
  app: {},
  auth: {}
}));

// Mock the AuthContext to avoid Firebase initialization
const mockUseAuth = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth()
}));

// Mock child components to isolate SubmissionApp testing
vi.mock('./SubmissionForm', () => ({
  default: () => <div data-testid="submission-form">Submission Form</div>
}));

vi.mock('./AdminTabs', () => ({
  default: ({ activeTab, onTabChange, onBack }: { activeTab: string; onTabChange: (tab: string) => void; onBack: () => void }) => (
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
    // Default: non-admin user
    mockUseAuth.mockReturnValue({ isAdmin: false, hasPermission: () => false });
  });

  describe('initial render', () => {
    it('should render the header with title', () => {
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(screen.getByText('Photo Submission')).toBeInTheDocument();
    });

    it('should render back to game button', () => {
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(screen.getByText('\u2190 Back to Game')).toBeInTheDocument();
    });

    it('should render Admin button when user is admin', () => {
      mockUseAuth.mockReturnValue({ isAdmin: true, hasPermission: () => true });
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    it('should not render Admin button when user is not admin', () => {
      mockUseAuth.mockReturnValue({ isAdmin: false, hasPermission: () => false });
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    });

    it('should render SubmissionForm by default', () => {
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(screen.getByTestId('submission-form')).toBeInTheDocument();
    });

    it('should not render AdminTabs initially', () => {
      mockUseAuth.mockReturnValue({ isAdmin: true, hasPermission: () => true });
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(screen.queryByTestId('admin-tabs')).not.toBeInTheDocument();
    });
  });

  describe('back to game button', () => {
    it('should call onBack when clicked', async () => {
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('\u2190 Back to Game'));

      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('admin navigation', () => {
    it('should show AdminTabs when Admin button is clicked', async () => {
      mockUseAuth.mockReturnValue({ isAdmin: true, hasPermission: () => true });
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Admin'));

      expect(screen.getByTestId('admin-tabs')).toBeInTheDocument();
      expect(screen.queryByTestId('submission-form')).not.toBeInTheDocument();
    });

    it('should pass activeTab to AdminTabs', async () => {
      mockUseAuth.mockReturnValue({ isAdmin: true, hasPermission: () => true });
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Admin'));

      expect(screen.getByText('Active Tab: review')).toBeInTheDocument();
    });

    it('should return to SubmissionForm when back is clicked in AdminTabs', async () => {
      mockUseAuth.mockReturnValue({ isAdmin: true, hasPermission: () => true });
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Admin'));
      await user.click(screen.getByText('Back from Admin'));

      expect(screen.getByTestId('submission-form')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-tabs')).not.toBeInTheDocument();
    });

    it('should handle tab change callback', async () => {
      mockUseAuth.mockReturnValue({ isAdmin: true, hasPermission: () => true });
      const user = userEvent.setup();
      render(<SubmissionApp onBack={mockOnBack} />);

      await user.click(screen.getByText('Admin'));
      await user.click(screen.getByText('Change Tab'));

      expect(screen.getByText('Active Tab: mapEditor')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should have submission-app container class', () => {
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(document.querySelector('.submission-app')).toBeInTheDocument();
    });

    it('should have submission-app-header class', () => {
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(document.querySelector('.submission-app-header')).toBeInTheDocument();
    });

    it('should have submission-app-main class', () => {
      render(<SubmissionApp onBack={mockOnBack} />);
      expect(document.querySelector('.submission-app-main')).toBeInTheDocument();
    });
  });
});
