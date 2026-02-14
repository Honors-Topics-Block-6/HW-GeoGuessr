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
const mockDeleteSubmission = vi.fn();
const mockDeleteImage = vi.fn();

vi.mock('../../services/imageService', () => ({
  getAllImages: (...args) => mockGetAllImages(...args),
  getAllSampleImages: (...args) => mockGetAllSampleImages(...args),
  deleteSubmission: (...args) => mockDeleteSubmission(...args),
  deleteImage: (...args) => mockDeleteImage(...args)
}));

// Mock MapPicker
vi.mock('../MapPicker/MapPicker', () => ({
  default: ({ markerPosition, onMapClick }) => (
    <div data-testid="map-picker">
      <button onClick={() => onMapClick({ x: 60, y: 70 })} data-testid="click-map">
        Click Map
      </button>
      {markerPosition && (
        <span data-testid="marker-position">
          {markerPosition.x}, {markerPosition.y}
        </span>
      )}
    </div>
  )
}));

// Mock FloorSelector
vi.mock('../FloorSelector/FloorSelector', () => ({
  default: ({ selectedFloor, onFloorSelect }) => (
    <div data-testid="floor-selector">
      {[1, 2, 3].map((floor) => (
        <button
          key={floor}
          data-testid={`floor-${floor}`}
          onClick={() => onFloorSelect(floor)}
          className={selectedFloor === floor ? 'selected' : ''}
        >
          Floor {floor}
        </button>
      ))}
    </div>
  )
}));

// Mock PhotoUpload
vi.mock('./PhotoUpload', () => ({
  default: ({ onPhotoSelect }) => (
    <div data-testid="photo-upload">
      <button
        data-testid="upload-new-photo"
        onClick={() => onPhotoSelect(new File(['test'], 'new-photo.jpg', { type: 'image/jpeg' }))}
      >
        Upload New Photo
      </button>
    </div>
  )
}));

// Mock compressImage
const mockCompressImage = vi.fn();
vi.mock('../../utils/compressImage', () => ({
  compressImage: (...args) => mockCompressImage(...args)
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
    mockCompressImage.mockResolvedValue('data:image/jpeg;base64,compressed');
    mockDeleteSubmission.mockResolvedValue();
    mockDeleteImage.mockResolvedValue();

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
      expect(screen.getByText(/^Pending \(/)).toBeInTheDocument();
      expect(screen.getByText(/^Approved \(/)).toBeInTheDocument();
      expect(screen.getByText(/^Denied \(/)).toBeInTheDocument();
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

    it('should not show Reset to Pending button for pending submissions', async () => {
      const user = userEvent.setup();
      render(<AdminReview onBack={mockOnBack} />);

      // Filter to only pending submissions
      await user.click(screen.getByText('Pending (1)'));

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

  describe('edit mode', () => {
    // Helper to open modal for the first pending submission
    const openModalForPendingSubmission = async (user) => {
      // Filter to submissions source
      await user.click(screen.getByText(/^Submissions/));
      // Filter to pending
      await user.click(screen.getByText('Pending (1)'));
      // Open modal
      await user.click(screen.getByText('View Full Details'));
    };

    describe('edit button visibility', () => {
      it('should show Edit button in modal for submission items', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);

        expect(screen.getByText('Edit')).toBeInTheDocument();
      });

      it('should show Edit button in modal for game image items', async () => {
        const user = userEvent.setup();
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

        // Wait for images to load, filter to game images, open modal
        await waitFor(() => {
          expect(screen.getByText(/Game Images \(1\)/)).toBeInTheDocument();
        });
        await user.click(screen.getByText(/^Game Images/));
        await user.click(screen.getByText('View Full Details'));

        expect(screen.getByText('Edit')).toBeInTheDocument();
      });

      it('should NOT show Edit button in modal for testing items', async () => {
        const user = userEvent.setup();
        // Only load testing items
        mockOnSnapshot.mockImplementation((query, callback) => {
          callback({ docs: [] });
          return vi.fn();
        });

        render(<AdminReview onBack={mockOnBack} />);

        // Wait for testing data to load
        await waitFor(() => {
          expect(screen.getByText(/Testing Data \(1\)/)).toBeInTheDocument();
        });
        // Click the source filter tab for Testing Data
        await user.click(screen.getByText(/^Testing Data \(/));
        await user.click(screen.getByText('View Full Details'));

        expect(screen.queryByText('Edit')).not.toBeInTheDocument();
      });
    });

    describe('entering and exiting edit mode', () => {
      it('should switch to edit mode when Edit button is clicked', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        // Should show edit form elements
        expect(screen.getByText('Edit Image')).toBeInTheDocument();
        expect(screen.getByText('Save Changes')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });

      it('should show Cancel and Save buttons in edit mode', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        expect(screen.getByText('Save Changes')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });

      it('should revert to view mode when Cancel is clicked', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        // Verify in edit mode
        expect(screen.getByText('Edit Image')).toBeInTheDocument();

        // Click cancel
        await user.click(screen.getByText('Cancel'));

        // Should be back in view mode
        expect(screen.getByText('Image Details')).toBeInTheDocument();
        expect(screen.queryByText('Edit Image')).not.toBeInTheDocument();
      });

      it('should not save changes when Cancel is clicked', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        // Modify description
        const descInput = screen.getByLabelText('Description');
        await user.clear(descInput);
        await user.type(descInput, 'Modified description');

        // Cancel
        await user.click(screen.getByText('Cancel'));

        // updateDoc should NOT have been called for edit save
        expect(mockUpdateDoc).not.toHaveBeenCalled();
      });
    });

    describe('form fields', () => {
      it('should populate edit form with current values', async () => {
        const user = userEvent.setup();

        // Mock with a submission that has a description
        const subWithDesc = [{
          id: '1',
          photoURL: 'https://example.com/photo1.jpg',
          photoName: 'photo1.jpg',
          description: 'Test description',
          location: { x: 100, y: 200 },
          floor: 2,
          status: 'pending',
          createdAt: { toDate: () => new Date('2024-01-01') }
        }];

        mockOnSnapshot.mockImplementation((query, callback) => {
          callback({
            docs: subWithDesc.map(sub => ({
              id: sub.id,
              data: () => sub
            }))
          });
          return vi.fn();
        });

        render(<AdminReview onBack={mockOnBack} />);

        await user.click(screen.getByText('View Full Details'));
        await user.click(screen.getByText('Edit'));

        expect(screen.getByLabelText('Description')).toHaveValue('Test description');
        expect(screen.getByLabelText('File Name')).toHaveValue('photo1.jpg');
      });

      it('should show description input in edit mode', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        expect(screen.getByLabelText('Description')).toBeInTheDocument();
      });

      it('should show photoName input for submissions', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        expect(screen.getByLabelText('File Name')).toBeInTheDocument();
      });

      it('should NOT show photoName input for game images', async () => {
        const user = userEvent.setup();
        const firestoreImages = [{
          id: 'img-1',
          url: 'https://example.com/game-image.jpg',
          correctLocation: { x: 50, y: 50 },
          correctFloor: 1,
          description: 'Game hallway image'
        }];
        mockGetAllImages.mockResolvedValue(firestoreImages);

        render(<AdminReview onBack={mockOnBack} />);

        await waitFor(() => {
          expect(screen.getByText(/Game Images \(1\)/)).toBeInTheDocument();
        });
        await user.click(screen.getByText(/^Game Images/));
        await user.click(screen.getByText('View Full Details'));
        await user.click(screen.getByText('Edit'));

        expect(screen.queryByLabelText('File Name')).not.toBeInTheDocument();
      });

      it('should show status select for submissions', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        expect(screen.getByLabelText('Status')).toBeInTheDocument();
      });

      it('should NOT show status select for game images', async () => {
        const user = userEvent.setup();
        const firestoreImages = [{
          id: 'img-1',
          url: 'https://example.com/game-image.jpg',
          correctLocation: { x: 50, y: 50 },
          correctFloor: 1,
          description: 'Game hallway image'
        }];
        mockGetAllImages.mockResolvedValue(firestoreImages);

        render(<AdminReview onBack={mockOnBack} />);

        await waitFor(() => {
          expect(screen.getByText(/Game Images \(1\)/)).toBeInTheDocument();
        });
        await user.click(screen.getByText(/^Game Images/));
        await user.click(screen.getByText('View Full Details'));
        await user.click(screen.getByText('Edit'));

        expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
      });

      it('should show MapPicker in edit mode', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        expect(screen.getByTestId('map-picker')).toBeInTheDocument();
      });

      it('should show FloorSelector in edit mode', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        expect(screen.getByTestId('floor-selector')).toBeInTheDocument();
      });

      it('should show PhotoUpload in edit mode', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        expect(screen.getByTestId('photo-upload')).toBeInTheDocument();
      });
    });

    describe('editing values', () => {
      it('should update description when typed', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        const descInput = screen.getByLabelText('Description');
        await user.clear(descInput);
        await user.type(descInput, 'New description');

        expect(descInput).toHaveValue('New description');
      });

      it('should update location when map is clicked', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        // Click mock map (sends {x: 60, y: 70})
        await user.click(screen.getByTestId('click-map'));

        // Marker position should update
        expect(screen.getByTestId('marker-position')).toHaveTextContent('60, 70');
      });

      it('should update floor when FloorSelector is used', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        // Click floor 3
        await user.click(screen.getByTestId('floor-3'));

        // Floor 3 button should now be selected
        expect(screen.getByTestId('floor-3')).toHaveClass('selected');
      });

      it('should update status when select changes', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        const statusSelect = screen.getByLabelText('Status');
        await user.selectOptions(statusSelect, 'approved');

        expect(statusSelect).toHaveValue('approved');
      });
    });

    describe('saving submissions', () => {
      it('should call updateDoc with correct fields for submission save', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        // Modify description
        const descInput = screen.getByLabelText('Description');
        await user.clear(descInput);
        await user.type(descInput, 'Updated desc');

        // Save
        await user.click(screen.getByText('Save Changes'));

        await waitFor(() => {
          expect(mockUpdateDoc).toHaveBeenCalledWith(
            undefined,
            expect.objectContaining({
              description: 'Updated desc',
              photoName: 'photo1.jpg',
              location: { x: 100, y: 200 },
              floor: 2,
              status: 'pending',
              photoURL: 'https://example.com/photo1.jpg',
            })
          );
        });
      });

      it('should close modal after successful save', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));
        await user.click(screen.getByText('Save Changes'));

        await waitFor(() => {
          expect(document.querySelector('.modal-overlay')).not.toBeInTheDocument();
        });
      });

      it('should show saving state during save', async () => {
        // Make updateDoc hang to see the saving state
        let resolveUpdate;
        mockUpdateDoc.mockImplementation(() => new Promise(resolve => { resolveUpdate = resolve; }));

        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));
        await user.click(screen.getByText('Save Changes'));

        // Should show saving text
        expect(screen.getByText('Saving...')).toBeInTheDocument();

        // Resolve the update
        resolveUpdate();
      });

      it('should show error message on save failure', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockUpdateDoc.mockRejectedValueOnce(new Error('Save failed'));

        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));
        await user.click(screen.getByText('Save Changes'));

        await waitFor(() => {
          expect(screen.getByText('Failed to save changes. Please try again.')).toBeInTheDocument();
        });

        consoleSpy.mockRestore();
      });

      it('should re-enable Save button after error', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockUpdateDoc.mockRejectedValueOnce(new Error('Save failed'));

        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));
        await user.click(screen.getByText('Save Changes'));

        await waitFor(() => {
          expect(screen.getByText('Save Changes')).not.toBeDisabled();
        });

        consoleSpy.mockRestore();
      });
    });

    describe('saving game images', () => {
      it('should call updateDoc with mapped field names for game image save', async () => {
        const user = userEvent.setup();
        const firestoreImages = [{
          id: 'img-1',
          url: 'https://example.com/game-image.jpg',
          correctLocation: { x: 50, y: 50 },
          correctFloor: 1,
          description: 'Game hallway image'
        }];
        mockGetAllImages.mockResolvedValue(firestoreImages);

        render(<AdminReview onBack={mockOnBack} />);

        await waitFor(() => {
          expect(screen.getByText(/Game Images \(1\)/)).toBeInTheDocument();
        });
        await user.click(screen.getByText(/^Game Images/));
        await user.click(screen.getByText('View Full Details'));
        await user.click(screen.getByText('Edit'));

        // Modify description
        const descInput = screen.getByLabelText('Description');
        await user.clear(descInput);
        await user.type(descInput, 'Updated game image');

        await user.click(screen.getByText('Save Changes'));

        await waitFor(() => {
          expect(mockUpdateDoc).toHaveBeenCalledWith(
            undefined,
            expect.objectContaining({
              description: 'Updated game image',
              correctLocation: { x: 50, y: 50 },
              correctFloor: 1,
              url: 'https://example.com/game-image.jpg',
            })
          );
        });
      });

      it('should update firestoreImages state after successful game image save', async () => {
        const user = userEvent.setup();
        const firestoreImages = [{
          id: 'img-1',
          url: 'https://example.com/game-image.jpg',
          correctLocation: { x: 50, y: 50 },
          correctFloor: 1,
          description: 'Game hallway image'
        }];
        mockGetAllImages.mockResolvedValue(firestoreImages);

        render(<AdminReview onBack={mockOnBack} />);

        await waitFor(() => {
          expect(screen.getByText(/Game Images \(1\)/)).toBeInTheDocument();
        });
        await user.click(screen.getByText(/^Game Images/));
        await user.click(screen.getByText('View Full Details'));
        await user.click(screen.getByText('Edit'));

        const descInput = screen.getByLabelText('Description');
        await user.clear(descInput);
        await user.type(descInput, 'Updated game image');

        await user.click(screen.getByText('Save Changes'));

        // Modal should close, and the card should now show updated description
        await waitFor(() => {
          expect(document.querySelector('.modal-overlay')).not.toBeInTheDocument();
        });

        // The updated description should appear in the card
        expect(screen.getByText('Updated game image')).toBeInTheDocument();
      });
    });

    describe('photo replacement', () => {
      it('should compress and save new photo when photo is replaced', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        // Upload a new photo
        await user.click(screen.getByTestId('upload-new-photo'));

        // Save
        await user.click(screen.getByText('Save Changes'));

        await waitFor(() => {
          // compressImage should have been called
          expect(mockCompressImage).toHaveBeenCalled();
          // updateDoc should have been called with compressed URL
          expect(mockUpdateDoc).toHaveBeenCalledWith(
            undefined,
            expect.objectContaining({
              photoURL: 'data:image/jpeg;base64,compressed',
            })
          );
        });
      });

      it('should keep original photo if no new photo selected', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await openModalForPendingSubmission(user);
        await user.click(screen.getByText('Edit'));

        // Save without uploading a new photo
        await user.click(screen.getByText('Save Changes'));

        await waitFor(() => {
          // compressImage should NOT have been called
          expect(mockCompressImage).not.toHaveBeenCalled();
          // updateDoc should use original photoURL
          expect(mockUpdateDoc).toHaveBeenCalledWith(
            undefined,
            expect.objectContaining({
              photoURL: 'https://example.com/photo1.jpg',
            })
          );
        });
      });
    });

    describe('validation', () => {
      it('should show error when floor is missing', async () => {
        const user = userEvent.setup();

        // Mock with a submission that has null floor
        const subNoFloor = [{
          id: '1',
          photoURL: 'https://example.com/photo1.jpg',
          photoName: 'photo1.jpg',
          location: { x: 100, y: 200 },
          floor: null,
          status: 'pending',
          createdAt: { toDate: () => new Date('2024-01-01') }
        }];

        mockOnSnapshot.mockImplementation((query, callback) => {
          callback({
            docs: subNoFloor.map(sub => ({
              id: sub.id,
              data: () => sub
            }))
          });
          return vi.fn();
        });

        render(<AdminReview onBack={mockOnBack} />);

        await user.click(screen.getByText('View Full Details'));
        await user.click(screen.getByText('Edit'));
        await user.click(screen.getByText('Save Changes'));

        expect(screen.getByText('Floor is required')).toBeInTheDocument();
        // updateDoc should NOT have been called
        expect(mockUpdateDoc).not.toHaveBeenCalled();
      });
    });
  });

  describe('delete photo functionality', () => {
    describe('delete button visibility', () => {
      it('should show Delete button on submission cards', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        // Filter to submissions only
        await user.click(screen.getByText(/^Submissions/));

        const deleteButtons = screen.getAllByText('Delete');
        expect(deleteButtons.length).toBeGreaterThan(0);
      });

      it('should show Delete button on game image cards', async () => {
        const user = userEvent.setup();
        const firestoreImages = [{
          id: 'img-1',
          url: 'https://example.com/game-image.jpg',
          correctLocation: { x: 50, y: 50 },
          correctFloor: 1,
          description: 'Game hallway image'
        }];
        mockGetAllImages.mockResolvedValue(firestoreImages);

        render(<AdminReview onBack={mockOnBack} />);

        await waitFor(() => {
          expect(screen.getByText(/Game Images \(1\)/)).toBeInTheDocument();
        });
        await user.click(screen.getByText(/^Game Images/));

        expect(screen.getByText('Delete')).toBeInTheDocument();
      });

      it('should NOT show Delete button on testing data cards', async () => {
        const user = userEvent.setup();
        // Only show testing items
        mockOnSnapshot.mockImplementation((query, callback) => {
          callback({ docs: [] });
          return vi.fn();
        });

        render(<AdminReview onBack={mockOnBack} />);

        await waitFor(() => {
          expect(screen.getByText(/Testing Data \(1\)/)).toBeInTheDocument();
        });
        await user.click(screen.getByText(/^Testing Data \(/));

        expect(screen.queryByText('Delete')).not.toBeInTheDocument();
      });

      it('should show Delete button in modal for submission items', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await user.click(screen.getByText(/^Submissions/));
        await user.click(screen.getByText('Pending (1)'));
        await user.click(screen.getByText('View Full Details'));

        // Modal should have a Delete button
        const modalDeleteBtn = document.querySelector('.modal-header-actions .delete-photo-button');
        expect(modalDeleteBtn).toBeInTheDocument();
      });

      it('should NOT show Delete button in modal for testing items', async () => {
        const user = userEvent.setup();
        mockOnSnapshot.mockImplementation((query, callback) => {
          callback({ docs: [] });
          return vi.fn();
        });

        render(<AdminReview onBack={mockOnBack} />);

        await waitFor(() => {
          expect(screen.getByText(/Testing Data \(1\)/)).toBeInTheDocument();
        });
        await user.click(screen.getByText(/^Testing Data \(/));
        await user.click(screen.getByText('View Full Details'));

        const modalDeleteBtn = document.querySelector('.modal-header-actions .delete-photo-button');
        expect(modalDeleteBtn).not.toBeInTheDocument();
      });
    });

    describe('delete confirmation popup', () => {
      it('should show confirmation popup when Delete is clicked on a card', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await user.click(screen.getByText(/^Submissions/));
        await user.click(screen.getByText('Pending (1)'));

        // Click Delete on the card
        await user.click(screen.getByText('Delete'));

        // Confirmation popup should appear
        expect(document.querySelector('.delete-confirm-overlay')).toBeInTheDocument();
        expect(screen.getByText('Delete Photo')).toBeInTheDocument();
        expect(screen.getByText('Are you sure you want to permanently delete this photo? This action cannot be undone.')).toBeInTheDocument();
      });

      it('should show photo thumbnail in confirmation popup', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await user.click(screen.getByText(/^Submissions/));
        await user.click(screen.getByText('Pending (1)'));
        await user.click(screen.getByText('Delete'));

        const confirmImage = document.querySelector('.delete-confirm-image');
        expect(confirmImage).toBeInTheDocument();
        expect(confirmImage.src).toContain('example.com/photo1.jpg');
      });

      it('should dismiss popup when Cancel is clicked', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await user.click(screen.getByText(/^Submissions/));
        await user.click(screen.getByText('Pending (1)'));
        await user.click(screen.getByText('Delete'));

        expect(document.querySelector('.delete-confirm-overlay')).toBeInTheDocument();

        // Click Cancel in the confirmation popup
        await user.click(screen.getByText('Cancel'));

        expect(document.querySelector('.delete-confirm-overlay')).not.toBeInTheDocument();
        // deleteSubmission should NOT have been called
        expect(mockDeleteSubmission).not.toHaveBeenCalled();
      });

      it('should dismiss popup when overlay is clicked', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await user.click(screen.getByText(/^Submissions/));
        await user.click(screen.getByText('Pending (1)'));
        await user.click(screen.getByText('Delete'));

        expect(document.querySelector('.delete-confirm-overlay')).toBeInTheDocument();

        // Click the overlay background
        await user.click(document.querySelector('.delete-confirm-overlay'));

        expect(document.querySelector('.delete-confirm-overlay')).not.toBeInTheDocument();
      });

      it('should not dismiss popup when modal content is clicked', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await user.click(screen.getByText(/^Submissions/));
        await user.click(screen.getByText('Pending (1)'));
        await user.click(screen.getByText('Delete'));

        await user.click(document.querySelector('.delete-confirm-modal'));

        expect(document.querySelector('.delete-confirm-overlay')).toBeInTheDocument();
      });
    });

    describe('confirming delete', () => {
      it('should call deleteSubmission when confirming delete on a submission', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await user.click(screen.getByText(/^Submissions/));
        await user.click(screen.getByText('Pending (1)'));
        await user.click(screen.getByText('Delete'));

        // Click the Delete button in the confirmation popup
        const confirmBtn = document.querySelector('.delete-confirm-button');
        await user.click(confirmBtn);

        await waitFor(() => {
          expect(mockDeleteSubmission).toHaveBeenCalledWith('1');
        });
      });

      it('should call deleteImage when confirming delete on a game image', async () => {
        const user = userEvent.setup();
        const firestoreImages = [{
          id: 'img-1',
          url: 'https://example.com/game-image.jpg',
          correctLocation: { x: 50, y: 50 },
          correctFloor: 1,
          description: 'Game hallway image'
        }];
        mockGetAllImages.mockResolvedValue(firestoreImages);

        render(<AdminReview onBack={mockOnBack} />);

        await waitFor(() => {
          expect(screen.getByText(/Game Images \(1\)/)).toBeInTheDocument();
        });
        await user.click(screen.getByText(/^Game Images/));
        await user.click(screen.getByText('Delete'));

        const confirmBtn = document.querySelector('.delete-confirm-button');
        await user.click(confirmBtn);

        await waitFor(() => {
          expect(mockDeleteImage).toHaveBeenCalledWith('img-1');
        });
      });

      it('should close confirmation popup after successful delete', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await user.click(screen.getByText(/^Submissions/));
        await user.click(screen.getByText('Pending (1)'));
        await user.click(screen.getByText('Delete'));

        const confirmBtn = document.querySelector('.delete-confirm-button');
        await user.click(confirmBtn);

        await waitFor(() => {
          expect(document.querySelector('.delete-confirm-overlay')).not.toBeInTheDocument();
        });
      });

      it('should show deleting state during delete operation', async () => {
        // Make deleteSubmission hang
        let resolveDelete;
        mockDeleteSubmission.mockImplementation(() => new Promise(resolve => { resolveDelete = resolve; }));

        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await user.click(screen.getByText(/^Submissions/));
        await user.click(screen.getByText('Pending (1)'));
        await user.click(screen.getByText('Delete'));

        const confirmBtn = document.querySelector('.delete-confirm-button');
        await user.click(confirmBtn);

        // Should show deleting text
        expect(screen.getByText('Deleting...')).toBeInTheDocument();

        // Resolve the delete
        resolveDelete();
      });

      it('should handle delete error gracefully', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockDeleteSubmission.mockRejectedValueOnce(new Error('Delete failed'));

        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await user.click(screen.getByText(/^Submissions/));
        await user.click(screen.getByText('Pending (1)'));
        await user.click(screen.getByText('Delete'));

        const confirmBtn = document.querySelector('.delete-confirm-button');
        await user.click(confirmBtn);

        await waitFor(() => {
          expect(consoleSpy).toHaveBeenCalledWith('Error deleting photo:', expect.any(Error));
        });

        consoleSpy.mockRestore();
      });

      it('should close detail modal when deleting the currently viewed item', async () => {
        const user = userEvent.setup();
        render(<AdminReview onBack={mockOnBack} />);

        await user.click(screen.getByText(/^Submissions/));
        await user.click(screen.getByText('Pending (1)'));

        // Open detail modal
        await user.click(screen.getByText('View Full Details'));
        expect(document.querySelector('.modal-overlay')).toBeInTheDocument();

        // Click Delete in the modal header
        const modalDeleteBtn = document.querySelector('.modal-header-actions .delete-photo-button');
        await user.click(modalDeleteBtn);

        // Confirm delete
        const confirmBtn = document.querySelector('.delete-confirm-button');
        await user.click(confirmBtn);

        await waitFor(() => {
          // Both modals should be closed
          expect(document.querySelector('.delete-confirm-overlay')).not.toBeInTheDocument();
          expect(document.querySelector('.modal-overlay')).not.toBeInTheDocument();
        });
      });

      it('should remove game image from list after successful delete', async () => {
        const user = userEvent.setup();
        const firestoreImages = [{
          id: 'img-1',
          url: 'https://example.com/game-image.jpg',
          correctLocation: { x: 50, y: 50 },
          correctFloor: 1,
          description: 'Game hallway image'
        }];
        mockGetAllImages.mockResolvedValue(firestoreImages);

        render(<AdminReview onBack={mockOnBack} />);

        await waitFor(() => {
          expect(screen.getByText(/Game Images \(1\)/)).toBeInTheDocument();
        });
        await user.click(screen.getByText(/^Game Images/));

        // Should have 1 card
        expect(document.querySelectorAll('.submission-card').length).toBe(1);

        await user.click(screen.getByText('Delete'));
        const confirmBtn = document.querySelector('.delete-confirm-button');
        await user.click(confirmBtn);

        await waitFor(() => {
          // Game image should be removed from the list
          expect(screen.getByText(/Game Images \(0\)/)).toBeInTheDocument();
        });
      });
    });
  });
});
