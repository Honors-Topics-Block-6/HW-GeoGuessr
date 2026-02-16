import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BugReportManagement from './BugReportManagement';

// Mock Firebase
vi.mock('../../firebase', () => ({
  db: {},
  app: {},
  auth: {}
}));

// Mock AuthContext
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'admin-uid', email: 'admin@example.com' },
    userDoc: { uid: 'admin-uid', username: 'AdminUser', isAdmin: true },
    loading: false,
    isAdmin: true
  })
}));

// Mock bugReportService
const mockUnsubscribe = vi.fn();
vi.mock('../../services/bugReportService', () => ({
  subscribeToBugReports: vi.fn((callback: (reports: unknown[]) => void) => {
    // Call with mock data immediately
    callback([
      {
        id: 'report-1',
        title: 'Map marker offset bug',
        username: 'Player1',
        userEmail: 'player1@test.com',
        userId: 'user-1',
        category: 'map',
        severity: 'high',
        status: 'open',
        description: 'The map marker is offset.',
        createdAt: { toDate: () => new Date('2024-06-15'), toMillis: () => 1718409600000 },
        adminNotes: []
      },
      {
        id: 'report-2',
        title: 'UI glitch on mobile',
        username: 'Player2',
        userEmail: 'player2@test.com',
        userId: 'user-2',
        category: 'ui',
        severity: 'low',
        status: 'resolved',
        description: 'Buttons overlap on small screens.',
        createdAt: { toDate: () => new Date('2024-06-10'), toMillis: () => 1717977600000 },
        adminNotes: [{ adminUid: 'admin-1', note: 'Fixed in v2' }]
      },
      {
        id: 'report-3',
        title: 'Critical crash in multiplayer',
        username: 'Player3',
        userEmail: 'player3@test.com',
        userId: 'user-3',
        category: 'multiplayer',
        severity: 'critical',
        status: 'open',
        description: 'Game crashes when joining a duel.',
        createdAt: { toDate: () => new Date('2024-06-20'), toMillis: () => 1718841600000 },
        adminNotes: []
      }
    ]);
    return mockUnsubscribe;
  }),
  updateBugReportStatus: vi.fn(),
  addAdminNote: vi.fn(),
  VALID_CATEGORIES: ['gameplay', 'ui', 'performance', 'map', 'multiplayer', 'other'],
  VALID_SEVERITIES: ['low', 'medium', 'high', 'critical'],
  VALID_STATUSES: ['open', 'in-progress', 'resolved', 'wont-fix', 'closed']
}));

// Mock BugReportDetailModal
vi.mock('./BugReportDetailModal', () => ({
  default: ({ report, onClose }: { report: { title: string }; onClose: () => void }) => (
    <div data-testid="bug-detail-modal">
      <span>Detail: {report.title}</span>
      <button onClick={onClose}>Close Modal</button>
    </div>
  )
}));

describe('BugReportManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the Bug Reports header', () => {
      render(<BugReportManagement />);

      expect(screen.getByText('Bug Reports')).toBeInTheDocument();
    });

    it('should render the report count', () => {
      render(<BugReportManagement />);

      expect(screen.getByText(/3 reports/)).toBeInTheDocument();
    });

    it('should show critical count', () => {
      render(<BugReportManagement />);

      expect(screen.getByText(/1 critical/)).toBeInTheDocument();
    });

    it('should render filter dropdowns', () => {
      const { container } = render(<BugReportManagement />);

      // Filter labels are rendered as .bug-mgmt-filter-label spans
      const filterLabels = container.querySelectorAll('.bug-mgmt-filter-label');
      expect(filterLabels.length).toBe(4);

      // Filter selects are rendered as .bug-mgmt-filter-select
      const filterSelects = container.querySelectorAll('.bug-mgmt-filter-select');
      expect(filterSelects.length).toBe(4);
    });
  });

  describe('table', () => {
    it('should render table headers', () => {
      const { container } = render(<BugReportManagement />);

      const headers = container.querySelectorAll('.bug-mgmt-table th');
      expect(headers.length).toBe(7);

      const headerTexts = Array.from(headers).map(h => h.textContent);
      expect(headerTexts).toContain('Title');
      expect(headerTexts).toContain('Reporter');
      expect(headerTexts).toContain('Actions');
    });

    it('should render report rows', () => {
      render(<BugReportManagement />);

      expect(screen.getByText('Map marker offset bug')).toBeInTheDocument();
      expect(screen.getByText('UI glitch on mobile')).toBeInTheDocument();
      expect(screen.getByText('Critical crash in multiplayer')).toBeInTheDocument();
    });

    it('should render reporter names', () => {
      render(<BugReportManagement />);

      expect(screen.getByText('Player1')).toBeInTheDocument();
      expect(screen.getByText('Player2')).toBeInTheDocument();
      expect(screen.getByText('Player3')).toBeInTheDocument();
    });

    it('should render View buttons for each report', () => {
      render(<BugReportManagement />);

      const viewButtons = screen.getAllByText('View');
      expect(viewButtons).toHaveLength(3);
    });
  });

  describe('filtering', () => {
    it('should filter by status', async () => {
      const user = userEvent.setup();
      const { container } = render(<BugReportManagement />);

      // Find the status filter select (first .bug-mgmt-filter-select)
      const filterSelects = container.querySelectorAll('.bug-mgmt-filter-select');
      const statusSelect = filterSelects[0]; // First select is status

      await user.selectOptions(statusSelect, 'resolved');

      // Only resolved report should be visible
      expect(screen.getByText('UI glitch on mobile')).toBeInTheDocument();
      expect(screen.queryByText('Map marker offset bug')).not.toBeInTheDocument();
      expect(screen.queryByText('Critical crash in multiplayer')).not.toBeInTheDocument();
    });

    it('should filter by severity', async () => {
      const user = userEvent.setup();
      const { container } = render(<BugReportManagement />);

      const filterSelects = container.querySelectorAll('.bug-mgmt-filter-select');
      const severitySelect = filterSelects[2]; // Third select is severity

      await user.selectOptions(severitySelect, 'critical');

      expect(screen.getByText('Critical crash in multiplayer')).toBeInTheDocument();
      expect(screen.queryByText('Map marker offset bug')).not.toBeInTheDocument();
    });
  });

  describe('detail modal', () => {
    it('should open detail modal when View button is clicked', async () => {
      const user = userEvent.setup();
      render(<BugReportManagement />);

      const viewButtons = screen.getAllByText('View');
      await user.click(viewButtons[0]);

      expect(screen.getByTestId('bug-detail-modal')).toBeInTheDocument();
    });

    it('should close detail modal when close is triggered', async () => {
      const user = userEvent.setup();
      render(<BugReportManagement />);

      const viewButtons = screen.getAllByText('View');
      await user.click(viewButtons[0]);

      expect(screen.getByTestId('bug-detail-modal')).toBeInTheDocument();

      await user.click(screen.getByText('Close Modal'));

      expect(screen.queryByTestId('bug-detail-modal')).not.toBeInTheDocument();
    });
  });

  describe('cleanup', () => {
    it('should unsubscribe from real-time updates on unmount', () => {
      const { unmount } = render(<BugReportManagement />);

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
});
