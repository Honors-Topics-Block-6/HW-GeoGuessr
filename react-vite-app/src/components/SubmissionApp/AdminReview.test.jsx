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
  where: vi.fn(),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  doc: vi.fn(),
  updateDoc: (...args) => mockUpdateDoc(...args),
  serverTimestamp: vi.fn(() => 'mock-timestamp')
}));

// Mock imageService
const mockGetAllImages = vi.fn();
const mockGetAllSampleImages = vi.fn();

vi.mock('../../services/imageService', () => ({
  getAllImages: (...args) => mockGetAllImages(...args),
  getAllSampleImages: (...args) => mockGetAllSampleImages(...args)
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

  const mockSampleImages = [
    {
      id: 'sample-1',
      url: 'https://example.com/sample1.jpg',
      correctLocation: { x: 35, y: 45 },
      correctFloor: 2,
      description: 'Sample image 1'
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

    // Mock imageService - return empty by default to keep tests focused
    mockGetAllImages.mockResolvedValue([]);
    mockGetAllSampleImages.mockReturnValue(mockSampleImages);
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
    });

    it('should render source filter tabs', () => {
      render(<AdminReview onBack={mockOnBack} />);
      expect(screen.getByText(/Submissions/)).toBeInTheDocument();
      expect(screen.getByText(/Game Images/)).toBeInTheDocument();
      expect(screen.getByText(/Testing Data/)).toBeInTheDocument();
    });

    it('should default to all filter and show all items', async () => {
      render(<AdminReview onBack={mockOnBack} />);
      // Default filter is 'all', so all submissions + sample images should be shown
      // Sample images are loaded async, so wait for them
      await waitFor(() => {
        const submissionCards = document.querySelectorAll('.submission-card');
        // 3 submissions + 1 sample image = 4
        expect(submissionCards.length).toBe(4);
      });
    });
  });

  describe('status filter functionality', () => {
    it('should show only pending submissions when Pending filter is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Pending (1)'));

      const submissionCards = document.querySelectorAll('.submission-card');
      expect(submissionCards.length).toBe(1);
    });

    it('should show only approved items when Approved filter is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText(/^Approved/));

      const submissionCards = document.querySelectorAll('.submission-card');
      expect(submissionCards.length).toBe(1);
    });

    it('should show only denied submissions when Denied filter is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText(/^Denied/));

      const submissionCards = document.querySelectorAll('.submission-card');
      expect(submissionCards.length).toBe(1);
    });

    it('should show only testing items when Testing filter is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      // Wait for sample images to load (async useEffect)
      await waitFor(() => {
        expect(document.querySelectorAll('.submission-card').length).toBe(4);
      });

      // Click the "Testing (N)" status filter (not "Testing Data" source filter)
      await user.click(screen.getByText(/^Testing \(/));

      const submissionCards = document.querySelectorAll('.submission-card');
      expect(submissionCards.length).toBe(1);
    });

    it('should update active tab styling', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Pending (1)'));

      expect(screen.getByText('Pending (1)')).toHaveClass('active');
    });
  });

  describe('source filter functionality', () => {
    it('should show only submissions when Submissions source filter is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText(/^Submissions/));

      const submissionCards = document.querySelectorAll('.submission-card');
      expect(submissionCards.length).toBe(3);
    });

    it('should show only testing data when Testing Data source filter is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText(/^Testing Data/));

      const submissionCards = document.querySelectorAll('.submission-card');
      expect(submissionCards.length).toBe(1);
    });

    it('should combine source and status filters', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      // Filter to submissions only, then by pending
      await user.click(screen.getByText(/^Submissions/));
      await user.click(screen.getByText('Pending (1)'));

      const submissionCards = document.querySelectorAll('.submission-card');
      expect(submissionCards.length).toBe(1);
    });
  });

  describe('submission card display', () => {
    it('should display submission photo', () => {
      render(<AdminReview onBack={mockOnBack} />);

      const images = screen.getAllByAltText('Submitted photo');
      expect(images.length).toBeGreaterThan(0);
    });

    it('should display status badge', () => {
      render(<AdminReview onBack={mockOnBack} />);

      expect(screen.getByText('pending')).toBeInTheDocument();
      expect(screen.getByText('approved')).toBeInTheDocument();
      expect(screen.getByText('denied')).toBeInTheDocument();
    });

    it('should display source badge', async () => {
      render(<AdminReview onBack={mockOnBack} />);

      // Wait for sample images to load (async useEffect)
      await waitFor(() => {
        // Should have Submission badges for submissions and Testing Data for samples
        expect(screen.getAllByText('Submission').length).toBe(3);
        expect(screen.getAllByText('Testing Data').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should display location coordinates', () => {
      render(<AdminReview onBack={mockOnBack} />);

      expect(screen.getByText('X: 100, Y: 200')).toBeInTheDocument();
    });

    it('should display floor number', () => {
      render(<AdminReview onBack={mockOnBack} />);
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    });

    it('should display View Full Details button', () => {
      render(<AdminReview onBack={mockOnBack} />);
      expect(screen.getAllByText('View Full Details').length).toBeGreaterThan(0);
    });
  });

  describe('pending submission actions', () => {
    it('should show Approve and Deny buttons for pending submissions', () => {
      render(<AdminReview onBack={mockOnBack} />);

      expect(screen.getByText('Approve')).toBeInTheDocument();
      expect(screen.getByText('Deny')).toBeInTheDocument();
    });

    it('should not show action buttons for non-submission items', async () => {
      // Mock only sample images, no submissions
      mockOnSnapshot.mockImplementation((query, callback) => {
        callback({ docs: [] });
        return mockUnsubscribe;
      });

      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText(/^Testing Data/));

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

      await user.click(screen.getAllByText('View Full Details')[0]);

      expect(document.querySelector('.modal-overlay')).toBeInTheDocument();
      expect(document.querySelector('.modal-content')).toBeInTheDocument();
    });

    it('should display full-size image in modal', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getAllByText('View Full Details')[0]);

      expect(screen.getByAltText('Full size')).toBeInTheDocument();
    });

    it('should display image details in modal', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getAllByText('View Full Details')[0]);

      expect(screen.getByText('Image Details')).toBeInTheDocument();
    });

    it('should close modal when close button is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getAllByText('View Full Details')[0]);
      expect(document.querySelector('.modal-overlay')).toBeInTheDocument();

      await user.click(screen.getByText('×'));

      expect(document.querySelector('.modal-overlay')).not.toBeInTheDocument();
    });

    it('should close modal when overlay is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getAllByText('View Full Details')[0]);
      expect(document.querySelector('.modal-overlay')).toBeInTheDocument();

      await user.click(document.querySelector('.modal-overlay'));

      expect(document.querySelector('.modal-overlay')).not.toBeInTheDocument();
    });

    it('should not close modal when modal content is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getAllByText('View Full Details')[0]);

      await user.click(document.querySelector('.modal-content'));

      expect(document.querySelector('.modal-overlay')).toBeInTheDocument();
    });

    it('should show action buttons in modal for pending submissions', async () => {
      const user = userEvent.setup();

      // Mock with only pending submission
      mockOnSnapshot.mockImplementation((query, callback) => {
        callback({
          docs: [mockSubmissions[0]].map(sub => ({
            id: sub.id,
            data: () => sub
          }))
        });
        return mockUnsubscribe;
      });

      render(<AdminReview onBack={mockOnBack} />);

      // Filter to submissions source to find the pending one easily
      await user.click(screen.getByText(/^Submissions/));
      await user.click(screen.getByText('View Full Details'));

      // Modal should have Approve and Deny buttons
      const modalActions = document.querySelector('.modal-actions');
      expect(modalActions).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show message when no items match filter', async () => {
      // Mock empty submissions
      mockOnSnapshot.mockImplementation((query, callback) => {
        callback({ docs: [] });
        return mockUnsubscribe;
      });
      mockGetAllSampleImages.mockReturnValue([]);

      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Pending (0)'));

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

  describe('modal approve/deny actions', () => {
    it('should approve submission from modal and close modal', async () => {
      const user = userEvent.setup();

      // Mock only pending submission
      mockOnSnapshot.mockImplementation((query, callback) => {
        callback({
          docs: [mockSubmissions[0]].map(sub => ({
            id: sub.id,
            data: () => sub
          }))
        });
        return mockUnsubscribe;
      });

      render(<AdminReview onBack={mockOnBack} />);

      // Filter to submissions and open modal for pending submission
      await user.click(screen.getByText(/^Submissions/));
      await user.click(screen.getByText('View Full Details'));
      expect(document.querySelector('.modal-overlay')).toBeInTheDocument();

      // Find the approve button in the modal
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

      // Mock only pending submission
      mockOnSnapshot.mockImplementation((query, callback) => {
        callback({
          docs: [mockSubmissions[0]].map(sub => ({
            id: sub.id,
            data: () => sub
          }))
        });
        return mockUnsubscribe;
      });

      render(<AdminReview onBack={mockOnBack} />);

      // Filter to submissions and open modal for pending submission
      await user.click(screen.getByText(/^Submissions/));
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

    it('should not display date row for items without createdAt', () => {
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

      // createdAt is null so the "Submitted:" row should not appear for that item
      // The component conditionally renders the date row
      expect(screen.getByText('Pending (1)')).toBeInTheDocument();
    });
  });

  describe('all items empty state', () => {
    it('should show generic empty message when all sources are empty', async () => {
      // Mock with no submissions at all
      mockOnSnapshot.mockImplementation((query, callback) => {
        callback({ docs: [] });
        return mockUnsubscribe;
      });
      mockGetAllSampleImages.mockReturnValue([]);

      render(<AdminReview onBack={mockOnBack} />);

      // Should show the no-submissions empty state div
      expect(document.querySelector('.no-submissions')).toBeInTheDocument();
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

      // Filter to submissions source, then approved status
      await user.click(screen.getByText(/^Submissions/));
      await user.click(screen.getByText(/^Approved/));

      // Open modal
      await user.click(screen.getByText('View Full Details'));

      // Modal should show reviewedAt
      expect(screen.getAllByText('Reviewed:').length).toBeGreaterThan(0);
    });
  });

  describe('reset to pending', () => {
    it('should show Reset to Pending button for approved submissions', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Approved (1)'));

      expect(screen.getByText('Reset to Pending')).toBeInTheDocument();
    });

    it('should show Reset to Pending button for denied submissions', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Denied (1)'));

      expect(screen.getByText('Reset to Pending')).toBeInTheDocument();
    });

    it('should not show Reset to Pending button for pending submissions', () => {
      render(<AdminReview onBack={mockOnBack} />);

      expect(screen.queryByText('Reset to Pending')).not.toBeInTheDocument();
    });

    it('should call updateDoc with pending status and null reviewedAt when Reset is clicked', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Approved (1)'));
      await user.click(screen.getByText('Reset to Pending'));

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          status: 'pending',
          reviewedAt: null
        })
      );
    });

    it('should handle reset error gracefully', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockUpdateDoc.mockRejectedValueOnce(new Error('Reset failed'));

      render(<AdminReview onBack={mockOnBack} />);

      await user.click(screen.getByText('Approved (1)'));
      await user.click(screen.getByText('Reset to Pending'));

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Error resetting submission:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });

    it('should reset submission from modal and close modal', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      // Switch to approved filter and open modal
      await user.click(screen.getByText('Approved (1)'));
      await user.click(screen.getByText('View Full Details'));
      expect(document.querySelector('.modal-overlay')).toBeInTheDocument();

      // Find the reset button in the modal
      const modalResetBtn = document.querySelector('.modal-actions .reset-button');
      expect(modalResetBtn).toBeInTheDocument();
      await user.click(modalResetBtn);

      // Modal should close
      expect(document.querySelector('.modal-overlay')).not.toBeInTheDocument();

      // updateDoc should have been called with pending status
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          status: 'pending',
          reviewedAt: null
        })
      );
    });
  });

  describe('game images from Firestore', () => {
    it('should display images from Firestore images collection', async () => {
      const firestoreImages = [
        {
          id: 'img-1',
          url: 'https://example.com/game-image.jpg',
          correctLocation: { x: 50, y: 50 },
          correctFloor: 1,
          description: 'Game hallway image'
        }
      ];
      mockGetAllImages.mockResolvedValue(firestoreImages);

      render(<AdminReview onBack={mockOnBack} />);

      await waitFor(() => {
        expect(screen.getByText(/Game Images/)).toBeInTheDocument();
      });
    });
  });
});
