import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BugReportModal from './BugReportModal';

// Mock Firebase
vi.mock('../../firebase', () => ({
  db: {},
  app: {},
  auth: {}
}));

// Mock bugReportService
vi.mock('../../services/bugReportService', () => ({
  submitBugReport: vi.fn(),
  getBugReportsByUser: vi.fn(),
  captureEnvironment: vi.fn(() => ({
    userAgent: 'test-agent',
    platform: 'test-platform',
    language: 'en',
    screenWidth: 1920,
    screenHeight: 1080,
    windowWidth: 1920,
    windowHeight: 1080,
    timestamp: '2024-01-01T00:00:00.000Z'
  })),
  VALID_CATEGORIES: ['gameplay', 'ui', 'performance', 'map', 'multiplayer', 'other'],
  VALID_SEVERITIES: ['low', 'medium', 'high', 'critical']
}));

// Mock compressImage
vi.mock('../../utils/compressImage', () => ({
  compressImage: vi.fn()
}));

import { submitBugReport, getBugReportsByUser } from '../../services/bugReportService';

describe('BugReportModal', () => {
  const defaultProps = {
    onClose: vi.fn(),
    userId: 'test-uid',
    username: 'TestUser',
    userEmail: 'test@example.com'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getBugReportsByUser.mockResolvedValue([]);
  });

  // Helper to get form fields by their id attributes
  const getTitleInput = () => document.getElementById('bug-title');
  const getCategorySelect = () => document.getElementById('bug-category');
  const getDescriptionTextarea = () => document.getElementById('bug-description');
  const getStepsTextarea = () => document.getElementById('bug-steps');
  const getSubmitButton = () => document.querySelector('.bug-report-submit');

  describe('rendering', () => {
    it('should render the modal title', () => {
      render(<BugReportModal {...defaultProps} />);

      expect(screen.getByText('Report a Bug')).toBeInTheDocument();
    });

    it('should render the bug icon', () => {
      render(<BugReportModal {...defaultProps} />);

      expect(screen.getByText('🐛')).toBeInTheDocument();
    });

    it('should render Submit Report and My Reports tabs', () => {
      render(<BugReportModal {...defaultProps} />);

      // "Submit Report" appears in both the tab and the submit button
      const submitReportElements = screen.getAllByText('Submit Report');
      expect(submitReportElements.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('My Reports')).toBeInTheDocument();
    });

    it('should render the close button', () => {
      render(<BugReportModal {...defaultProps} />);

      expect(screen.getByText('×')).toBeInTheDocument();
    });
  });

  describe('submit form fields', () => {
    it('should render title input', () => {
      render(<BugReportModal {...defaultProps} />);

      expect(getTitleInput()).toBeInTheDocument();
    });

    it('should render category select', () => {
      render(<BugReportModal {...defaultProps} />);

      expect(getCategorySelect()).toBeInTheDocument();
    });

    it('should render severity buttons', () => {
      render(<BugReportModal {...defaultProps} />);

      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('should render description textarea', () => {
      render(<BugReportModal {...defaultProps} />);

      expect(getDescriptionTextarea()).toBeInTheDocument();
    });

    it('should render steps to reproduce textarea', () => {
      render(<BugReportModal {...defaultProps} />);

      expect(getStepsTextarea()).toBeInTheDocument();
    });

    it('should render screenshot upload area', () => {
      render(<BugReportModal {...defaultProps} />);

      expect(screen.getByText(/click to attach a screenshot/i)).toBeInTheDocument();
    });

    it('should render submit and cancel buttons', () => {
      render(<BugReportModal {...defaultProps} />);

      expect(getSubmitButton()).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should render character counts', () => {
      render(<BugReportModal {...defaultProps} />);

      expect(screen.getByText('0/100')).toBeInTheDocument();
      expect(screen.getByText('0/2000')).toBeInTheDocument();
      expect(screen.getByText('0/1000')).toBeInTheDocument();
    });
  });

  describe('form interactions', () => {
    it('should update title character count when typing', async () => {
      const user = userEvent.setup();
      render(<BugReportModal {...defaultProps} />);

      const titleInput = getTitleInput();
      await user.type(titleInput, 'Test bug');

      expect(screen.getByText('8/100')).toBeInTheDocument();
    });

    it('should select severity when clicking a severity button', async () => {
      const user = userEvent.setup();
      render(<BugReportModal {...defaultProps} />);

      const highButton = screen.getByText('High');
      await user.click(highButton);

      expect(highButton).toHaveClass('selected');
    });

    it('should have submit button disabled when form is incomplete', () => {
      render(<BugReportModal {...defaultProps} />);

      expect(getSubmitButton()).toBeDisabled();
    });
  });

  describe('form submission', () => {
    it('should show error if title is empty on submit', async () => {
      const user = userEvent.setup();
      render(<BugReportModal {...defaultProps} />);

      // Fill in everything except title
      await user.selectOptions(getCategorySelect(), 'gameplay');
      await user.click(screen.getByText('High'));
      await user.type(getDescriptionTextarea(), 'A description');

      // The submit button should still be disabled because title is empty
      expect(getSubmitButton()).toBeDisabled();
    });

    it('should call submitBugReport when form is valid and submitted', async () => {
      const user = userEvent.setup();
      submitBugReport.mockResolvedValueOnce('new-report-id');

      render(<BugReportModal {...defaultProps} />);

      // Fill in all required fields
      await user.type(getTitleInput(), 'Test Bug Title');
      await user.selectOptions(getCategorySelect(), 'gameplay');
      await user.click(screen.getByText('High'));
      await user.type(getDescriptionTextarea(), 'Bug description here');

      // Find and click the submit button
      await user.click(getSubmitButton());

      expect(submitBugReport).toHaveBeenCalledTimes(1);
      expect(submitBugReport).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-uid',
          username: 'TestUser',
          title: 'Test Bug Title',
          category: 'gameplay',
          severity: 'high',
          description: 'Bug description here'
        })
      );
    });

    it('should show success message after successful submission', async () => {
      const user = userEvent.setup();
      submitBugReport.mockResolvedValueOnce('new-report-id');

      render(<BugReportModal {...defaultProps} />);

      await user.type(getTitleInput(), 'Test Bug');
      await user.selectOptions(getCategorySelect(), 'ui');
      await user.click(screen.getByText('Low'));
      await user.type(getDescriptionTextarea(), 'Description');

      await user.click(getSubmitButton());

      expect(screen.getByText(/bug report submitted/i)).toBeInTheDocument();
    });

    it('should show error message on submission failure', async () => {
      const user = userEvent.setup();
      submitBugReport.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      render(<BugReportModal {...defaultProps} />);

      await user.type(getTitleInput(), 'Test Bug');
      await user.selectOptions(getCategorySelect(), 'ui');
      await user.click(screen.getByText('Low'));
      await user.type(getDescriptionTextarea(), 'Description');

      await user.click(getSubmitButton());

      expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
    });
  });

  describe('close behavior', () => {
    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      render(<BugReportModal {...defaultProps} />);

      await user.click(screen.getByText('×'));

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<BugReportModal {...defaultProps} />);

      await user.click(screen.getByText('Cancel'));

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('My Reports tab', () => {
    it('should switch to My Reports tab when clicked', async () => {
      const user = userEvent.setup();
      render(<BugReportModal {...defaultProps} />);

      await user.click(screen.getByText('My Reports'));

      expect(getBugReportsByUser).toHaveBeenCalledWith('test-uid');
    });

    it('should show empty state when no reports exist', async () => {
      const user = userEvent.setup();
      getBugReportsByUser.mockResolvedValueOnce([]);

      render(<BugReportModal {...defaultProps} />);

      await user.click(screen.getByText('My Reports'));

      // Wait for loading to complete
      expect(await screen.findByText(/haven't submitted any bug reports/i)).toBeInTheDocument();
    });

    it('should display report cards when reports exist', async () => {
      const user = userEvent.setup();
      getBugReportsByUser.mockResolvedValueOnce([
        {
          id: 'report-1',
          title: 'Test Bug Report',
          status: 'open',
          severity: 'high',
          category: 'gameplay',
          description: 'A test description',
          createdAt: { toDate: () => new Date('2024-06-15') },
          adminNotes: []
        }
      ]);

      render(<BugReportModal {...defaultProps} />);

      await user.click(screen.getByText('My Reports'));

      expect(await screen.findByText('Test Bug Report')).toBeInTheDocument();
    });
  });
});
