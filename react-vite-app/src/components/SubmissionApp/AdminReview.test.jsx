import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminReview from './AdminReview';

// Mock Firebase
vi.mock('../../firebase', () => ({
  db: {}
}));

// Create mock functions for Firebase
const mockOnSnapshot = vi.fn();
const mockUpdateDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  doc: vi.fn(),
  updateDoc: (...args) => mockUpdateDoc(...args),
  serverTimestamp: vi.fn(() => 'mock-timestamp')
}));

describe('AdminReview', () => {
  const mockOnBack = vi.fn();
  const mockUnsubscribe = vi.fn();

  const mockSubmissions = [
    {
      id: '1',
      photoURL: 'https://example.com/photo1.jpg',
      photoName: 'photo1.jpg',
      location: { x: 100, y: 200 },
      floor: 2,
      status: 'pending',
      createdAt: { toDate: () => new Date('2024-01-01') }
    },
    {
      id: '2',
      photoURL: 'https://example.com/photo2.jpg',
      photoName: 'photo2.jpg',
      location: { x: 150, y: 250 },
      floor: 1,
      status: 'approved',
      createdAt: { toDate: () => new Date('2024-01-02') },
      reviewedAt: { toDate: () => new Date('2024-01-03') }
    },
    {
      id: '3',
      photoURL: 'https://example.com/photo3.jpg',
      photoName: 'photo3.jpg',
      location: { x: 200, y: 300 },
      floor: 3,
      status: 'denied',
      createdAt: { toDate: () => new Date('2024-01-04') },
      reviewedAt: { toDate: () => new Date('2024-01-05') }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementation - simulate successful data fetch
    mockOnSnapshot.mockImplementation((query, callback) => {
      callback({
        docs: mockSubmissions.map(sub => ({
          id: sub.id,
          data: () => sub
        }))
      });
      return mockUnsubscribe;
    });

    mockUpdateDoc.mockResolvedValue();
  });

  describe('loading state', () => {
    it('should show loading message initially', () => {
      // Make onSnapshot not call the callback immediately
      mockOnSnapshot.mockImplementation(() => mockUnsubscribe);

      render(<AdminReview onBack={mockOnBack} />);

      expect(screen.getByText('Loading submissions...')).toBeInTheDocument();
    });
  });

  describe('initial render with data', () => {
    it('should render admin header', () => {
      render(<AdminReview onBack={mockOnBack} />);
      expect(screen.getByText('Admin Review Panel')).toBeInTheDocument();
    });

    it('should render back button', () => {
      render(<AdminReview onBack={mockOnBack} />);
      expect(screen.getByText('← Back to Submission')).toBeInTheDocument();
    });

    it('should render filter tabs', () => {
      render(<AdminReview onBack={mockOnBack} />);
      expect(screen.getByText(/Pending/)).toBeInTheDocument();
      expect(screen.getByText(/Approved/)).toBeInTheDocument();
      expect(screen.getByText(/Denied/)).toBeInTheDocument();
      expect(screen.getByText(/All/)).toBeInTheDocument();
    });

    it('should show submission counts in filter tabs', () => {
      render(<AdminReview onBack={mockOnBack} />);
      expect(screen.getByText('Pending (1)')).toBeInTheDocument();
      expect(screen.getByText('Approved (1)')).toBeInTheDocument();
      expect(screen.getByText('Denied (1)')).toBeInTheDocument();
      expect(screen.getByText('All (3)')).toBeInTheDocument();
    });

    it('should default to pending filter', () => {
      render(<AdminReview onBack={mockOnBack} />);
      const pendingTab = screen.getByText('Pending (1)');
      expect(pendingTab).toHaveClass('active');
    });

    it('should only show pending submissions by default', () => {
      render(<AdminReview onBack={mockOnBack} />);
      // Should show the pending submission
      const submissionCards = document.querySelectorAll('.submission-card');
      expect(submissionCards.length).toBe(1);
    });
  });

  describe('filter functionality', () => {
    it('should show all submissions when All filter is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('All (3)'));

      const submissionCards = document.querySelectorAll('.submission-card');
      expect(submissionCards.length).toBe(3);
    });

    it('should show only approved submissions when Approved filter is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Approved (1)'));

      const submissionCards = document.querySelectorAll('.submission-card');
      expect(submissionCards.length).toBe(1);
    });

    it('should show only denied submissions when Denied filter is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Denied (1)'));

      const submissionCards = document.querySelectorAll('.submission-card');
      expect(submissionCards.length).toBe(1);
    });

    it('should update active tab styling', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Approved (1)'));

      expect(screen.getByText('Approved (1)')).toHaveClass('active');
      expect(screen.getByText('Pending (1)')).not.toHaveClass('active');
    });
  });

  describe('submission card display', () => {
    it('should display submission photo', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('All (3)'));

      const images = screen.getAllByAltText('Submitted photo');
      expect(images.length).toBe(3);
    });

    it('should display status badge', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('All (3)'));

      expect(screen.getByText('pending')).toBeInTheDocument();
      expect(screen.getByText('approved')).toBeInTheDocument();
      expect(screen.getByText('denied')).toBeInTheDocument();
    });

    it('should display location coordinates', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('All (3)'));

      expect(screen.getByText('X: 100, Y: 200')).toBeInTheDocument();
    });

    it('should display floor number', () => {
      render(<AdminReview onBack={mockOnBack} />);
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('should display View Full Details button', () => {
      render(<AdminReview onBack={mockOnBack} />);
      expect(screen.getByText('View Full Details')).toBeInTheDocument();
    });
  });

  describe('pending submission actions', () => {
    it('should show Approve and Deny buttons for pending submissions', () => {
      render(<AdminReview onBack={mockOnBack} />);

      expect(screen.getByText('Approve')).toBeInTheDocument();
      expect(screen.getByText('Deny')).toBeInTheDocument();
    });

    it('should not show action buttons for approved submissions', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Approved (1)'));

      expect(screen.queryByText('Approve')).not.toBeInTheDocument();
      expect(screen.queryByText('Deny')).not.toBeInTheDocument();
    });

    it('should call updateDoc with approved status when Approve is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Approve'));

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        undefined, // doc reference
        expect.objectContaining({
          status: 'approved'
        })
      );
    });

    it('should call updateDoc with denied status when Deny is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Deny'));

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          status: 'denied'
        })
      );
    });
  });

  describe('modal functionality', () => {
    it('should open modal when View Full Details is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('View Full Details'));

      expect(document.querySelector('.modal-overlay')).toBeInTheDocument();
      expect(document.querySelector('.modal-content')).toBeInTheDocument();
    });

    it('should display full-size image in modal', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('View Full Details'));

      expect(screen.getByAltText('Full size')).toBeInTheDocument();
    });

    it('should display submission details in modal', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('View Full Details'));

      expect(screen.getByText('Submission Details')).toBeInTheDocument();
    });

    it('should close modal when close button is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('View Full Details'));
      expect(document.querySelector('.modal-overlay')).toBeInTheDocument();

      await user.click(screen.getByText('×'));

      expect(document.querySelector('.modal-overlay')).not.toBeInTheDocument();
    });

    it('should close modal when overlay is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('View Full Details'));
      expect(document.querySelector('.modal-overlay')).toBeInTheDocument();

      await user.click(document.querySelector('.modal-overlay'));

      expect(document.querySelector('.modal-overlay')).not.toBeInTheDocument();
    });

    it('should not close modal when modal content is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('View Full Details'));

      await user.click(document.querySelector('.modal-content'));

      expect(document.querySelector('.modal-overlay')).toBeInTheDocument();
    });

    it('should show action buttons in modal for pending submissions', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('View Full Details'));

      // Modal should have Approve and Deny buttons
      const modalActions = document.querySelector('.modal-actions');
      expect(modalActions).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show message when no submissions match filter', async () => {
      // Mock empty pending submissions
      mockOnSnapshot.mockImplementation((query, callback) => {
        callback({
          docs: mockSubmissions
            .filter(s => s.status !== 'pending')
            .map(sub => ({
              id: sub.id,
              data: () => sub
            }))
        });
        return mockUnsubscribe;
      });

      render(<AdminReview onBack={mockOnBack} />);

      expect(screen.getByText('No pending submissions found.')).toBeInTheDocument();
    });
  });

  describe('back button', () => {
    it('should call onBack when back button is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('← Back to Submission'));

      expect(mockOnBack).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle Firestore error gracefully', () => {
      mockOnSnapshot.mockImplementation((query, successCallback, errorCallback) => {
        errorCallback(new Error('Firestore error'));
        return mockUnsubscribe;
      });

      render(<AdminReview onBack={mockOnBack} />);

      // Should not show loading after error
      expect(screen.queryByText('Loading submissions...')).not.toBeInTheDocument();
    });

    it('should handle approve error gracefully', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockUpdateDoc.mockRejectedValueOnce(new Error('Approve failed'));

      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Approve'));

      // Should log error but not crash
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Error approving submission:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });

    it('should handle deny error gracefully', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockUpdateDoc.mockRejectedValueOnce(new Error('Deny failed'));

      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Deny'));

      // Should log error but not crash
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Error denying submission:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });
  });

  describe('filter tab interactions', () => {
    it('should handle clicking on already active pending filter', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      // Pending is active by default, clicking it again should still work
      const pendingTab = screen.getByText('Pending (1)');
      expect(pendingTab).toHaveClass('active');

      await user.click(pendingTab);

      // Should still be active and show pending submissions
      expect(pendingTab).toHaveClass('active');
      const submissionCards = document.querySelectorAll('.submission-card');
      expect(submissionCards.length).toBe(1);
    });
  });

  describe('modal approve/deny actions', () => {
    it('should approve submission from modal and close modal', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      // Open modal for pending submission
      await user.click(screen.getByText('View Full Details'));
      expect(document.querySelector('.modal-overlay')).toBeInTheDocument();

      // Find the approve button in the modal (there will be two - one in card, one in modal)
      const modalApproveBtn = document.querySelector('.modal-actions .approve-button');
      await user.click(modalApproveBtn);

      // Modal should close
      expect(document.querySelector('.modal-overlay')).not.toBeInTheDocument();

      // updateDoc should have been called
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ status: 'approved' })
      );
    });

    it('should deny submission from modal and close modal', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      // Open modal for pending submission
      await user.click(screen.getByText('View Full Details'));
      expect(document.querySelector('.modal-overlay')).toBeInTheDocument();

      // Find the deny button in the modal
      const modalDenyBtn = document.querySelector('.modal-actions .deny-button');
      await user.click(modalDenyBtn);

      // Modal should close
      expect(document.querySelector('.modal-overlay')).not.toBeInTheDocument();

      // updateDoc should have been called
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ status: 'denied' })
      );
    });
  });

  describe('cleanup', () => {
    it('should unsubscribe from Firestore on unmount', () => {
      const { unmount } = render(<AdminReview onBack={mockOnBack} />);

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('formatDate handling', () => {
    it('should handle timestamps without toDate method', () => {
      // Mock with raw Date objects instead of Firestore timestamps
      const submissionsWithRawDates = [
        {
          id: '1',
          photoURL: 'https://example.com/photo1.jpg',
          photoName: 'photo1.jpg',
          location: { x: 100, y: 200 },
          floor: 2,
          status: 'pending',
          createdAt: new Date('2024-01-01T12:00:00') // raw Date, no toDate method
        }
      ];

      mockOnSnapshot.mockImplementation((query, callback) => {
        callback({
          docs: submissionsWithRawDates.map(sub => ({
            id: sub.id,
            data: () => sub
          }))
        });
        return mockUnsubscribe;
      });

      render(<AdminReview onBack={mockOnBack} />);

      // Should not crash and should display date
      expect(screen.getByText('Pending (1)')).toBeInTheDocument();
    });

    it('should display N/A for missing timestamps', () => {
      const submissionsWithNullDates = [
        {
          id: '1',
          photoURL: 'https://example.com/photo1.jpg',
          photoName: 'photo1.jpg',
          location: { x: 100, y: 200 },
          floor: 2,
          status: 'pending',
          createdAt: null // null timestamp
        }
      ];

      mockOnSnapshot.mockImplementation((query, callback) => {
        callback({
          docs: submissionsWithNullDates.map(sub => ({
            id: sub.id,
            data: () => sub
          }))
        });
        return mockUnsubscribe;
      });

      render(<AdminReview onBack={mockOnBack} />);

      // Should display N/A for null timestamp
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });
  });

  describe('all submissions empty state', () => {
    it('should show generic empty message for All filter', async () => {
      // Mock with no submissions at all
      mockOnSnapshot.mockImplementation((query, callback) => {
        callback({
          docs: []
        });
        return mockUnsubscribe;
      });

      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('All (0)'));

      // Should show message without status prefix
      expect(screen.getByText('No submissions found.')).toBeInTheDocument();
    });
  });

  describe('modal with reviewed submission', () => {
    it('should display reviewedAt date in modal for reviewed submission', async () => {
      const user = userEvent.setup();

      // Mock with reviewed submission
      const reviewedSubmission = [
        {
          id: '1',
          photoURL: 'https://example.com/photo1.jpg',
          photoName: 'photo1.jpg',
          location: { x: 100, y: 200 },
          floor: 2,
          status: 'approved',
          createdAt: { toDate: () => new Date('2024-01-01') },
          reviewedAt: { toDate: () => new Date('2024-01-02') }
        }
      ];

      mockOnSnapshot.mockImplementation((query, callback) => {
        callback({
          docs: reviewedSubmission.map(sub => ({
            id: sub.id,
            data: () => sub
          }))
        });
        return mockUnsubscribe;
      });

      render(<AdminReview onBack={mockOnBack} />);

      // Switch to Approved filter
      await user.click(screen.getByText('Approved (1)'));

      // Open modal
      await user.click(screen.getByText('View Full Details'));

      // Modal should show reviewedAt (may have multiple instances - in card and modal)
      expect(screen.getAllByText('Reviewed:').length).toBeGreaterThan(0);
    });
  });
});
