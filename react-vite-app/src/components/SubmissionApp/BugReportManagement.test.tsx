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

    it('should render the report count (default: open + in-progress only)', () => {
      render(<BugReportManagement />);

      // By default, only open & in-progress statuses are shown (2 of 3 reports)
      expect(screen.getByText(/2 reports/)).toBeInTheDocument();
    });

    it('should show critical count', () => {
      render(<BugReportManagement />);

      expect(screen.getByText(/1 critical/)).toBeInTheDocument();
    });

    it('should render filter pills and sort dropdown', () => {
      const { container } = render(<BugReportManagement />);

      // 4 filter labels: Status, Category, Severity, Sort By
      const filterLabels = container.querySelectorAll('.bug-mgmt-filter-label');
      expect(filterLabels.length).toBe(4);

      // 3 pill groups (Status, Category, Severity)
      const pillGroups = container.querySelectorAll('.bug-mgmt-filter-pills');
      expect(pillGroups.length).toBe(3);

      // 1 remaining select (Sort By)
      const filterSelects = container.querySelectorAll('.bug-mgmt-filter-select');
      expect(filterSelects.length).toBe(1);
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

    it('should render report rows (default: open + in-progress only)', () => {
      render(<BugReportManagement />);

      // report-1 (open) and report-3 (open) are visible; report-2 (resolved) is hidden by default
      expect(screen.getByText('Map marker offset bug')).toBeInTheDocument();
      expect(screen.queryByText('UI glitch on mobile')).not.toBeInTheDocument();
      expect(screen.getByText('Critical crash in multiplayer')).toBeInTheDocument();
    });

    it('should render reporter names for visible reports', () => {
      render(<BugReportManagement />);

      expect(screen.getByText('Player1')).toBeInTheDocument();
      expect(screen.queryByText('Player2')).not.toBeInTheDocument(); // resolved, hidden by default
      expect(screen.getByText('Player3')).toBeInTheDocument();
    });

    it('should render View buttons for visible reports', () => {
      render(<BugReportManagement />);

      const viewButtons = screen.getAllByText('View');
      expect(viewButtons).toHaveLength(2); // only 2 open reports shown by default
    });
  });

  describe('filtering', () => {
    it('should toggle status pills to show resolved reports', async () => {
      const user = userEvent.setup();
      render(<BugReportManagement />);

      // By default, resolved reports are hidden
      expect(screen.queryByText('UI glitch on mobile')).not.toBeInTheDocument();

      // Click the "Resolved" pill to enable it
      await user.click(screen.getByRole('button', { name: /Resolved/i }));

      // Now resolved report should also be visible
      expect(screen.getByText('UI glitch on mobile')).toBeInTheDocument();
      expect(screen.getByText('Map marker offset bug')).toBeInTheDocument();
    });

    it('should deselect a severity pill to hide matching reports', async () => {
      const user = userEvent.setup();
      render(<BugReportManagement />);

      // Both open reports visible by default
      expect(screen.getByText('Critical crash in multiplayer')).toBeInTheDocument();
      expect(screen.getByText('Map marker offset bug')).toBeInTheDocument();

      // Deselect "Critical" severity pill
      await user.click(screen.getByRole('button', { name: /Critical/i }));

      // The critical report should now be hidden
      expect(screen.queryByText('Critical crash in multiplayer')).not.toBeInTheDocument();
      expect(screen.getByText('Map marker offset bug')).toBeInTheDocument();
    });

    it('should use "All" pill to toggle all values for a filter group', async () => {
      const user = userEvent.setup();
      const { container } = render(<BugReportManagement />);

      // Find the Status "All" pill (first toggle-all button)
      const allButtons = container.querySelectorAll('.bug-mgmt-pill.toggle-all');
      const statusAllBtn = allButtons[0]; // Status "All"

      // Click "All" for Status — selects all (currently only open+in-progress selected)
      await user.click(statusAllBtn);

      // Now all reports should be visible including resolved
      expect(screen.getByText('UI glitch on mobile')).toBeInTheDocument();
      expect(screen.getByText('Map marker offset bug')).toBeInTheDocument();
      expect(screen.getByText('Critical crash in multiplayer')).toBeInTheDocument();
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
