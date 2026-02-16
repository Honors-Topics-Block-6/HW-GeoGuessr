import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubmissionForm from './SubmissionForm';

// Mock Firebase
vi.mock('../../firebase', () => ({
  db: {}
}));

const mockAddDoc = vi.fn();
const mockCompressImage = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  serverTimestamp: vi.fn(() => 'mock-timestamp')
}));

vi.mock('../../utils/compressImage', () => ({
  compressImage: (...args: unknown[]) => mockCompressImage(...args)
}));

// Mock regionService
const mockGetRegions = vi.fn();
const mockGetPlayingArea = vi.fn();
const mockGetFloorsForPoint = vi.fn();
const mockIsPointInPlayingArea = vi.fn();

vi.mock('../../services/regionService', () => ({
  getRegions: (...args: unknown[]) => mockGetRegions(...args),
  getPlayingArea: (...args: unknown[]) => mockGetPlayingArea(...args),
  getFloorsForPoint: (...args: unknown[]) => mockGetFloorsForPoint(...args),
  isPointInPlayingArea: (...args: unknown[]) => mockIsPointInPlayingArea(...args)
}));

// Mock child components
vi.mock('../MapPicker/MapPicker', () => ({
  default: ({ markerPosition, onMapClick, clickRejected, playingArea }: {
    markerPosition: { x: number; y: number } | null;
    onMapClick: (pos: { x: number; y: number }) => void;
    clickRejected: boolean;
    playingArea: unknown;
  }) => (
    <div data-testid="map-picker">
      <button onClick={() => onMapClick({ x: 50, y: 50 })}>
        Click Map
      </button>
      <button onClick={() => onMapClick({ x: 90, y: 90 })} data-testid="click-outside">
        Click Outside
      </button>
      {markerPosition && (
        <span data-testid="marker-position">
          {markerPosition.x}, {markerPosition.y}
        </span>
      )}
      {clickRejected && <span data-testid="click-rejected">Rejected</span>}
      {playingArea != null && <span data-testid="has-playing-area">Playing Area Active</span>}
    </div>
  )
}));

vi.mock('../FloorSelector/FloorSelector', () => ({
  default: ({ selectedFloor, onFloorSelect, floors }: {
    selectedFloor: number | null;
    onFloorSelect: (floor: number) => void;
    floors: number[];
  }) => (
    <div data-testid="floor-selector">
      {floors.map((floor) => (
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

vi.mock('./PhotoUpload', () => ({
  default: ({ onPhotoSelect, selectedPhoto }: {
    onPhotoSelect: (file: File | null) => void;
    selectedPhoto: File | null;
  }) => (
    <div data-testid="photo-upload">
      <button onClick={() => onPhotoSelect(new File(['test'], 'test.jpg', { type: 'image/jpeg' }))}>
        Upload Photo
      </button>
      <button onClick={() => onPhotoSelect(null)}>Clear Photo</button>
      {selectedPhoto && <span data-testid="selected-photo">{selectedPhoto.name}</span>}
    </div>
  )
}));

describe('SubmissionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockCompressImage.mockResolvedValue('data:image/jpeg;base64,mockBase64Data');
    mockAddDoc.mockResolvedValue({ id: 'test-doc-id' });
    mockGetRegions.mockResolvedValue([]);
    mockGetPlayingArea.mockResolvedValue(null);
    mockGetFloorsForPoint.mockReturnValue(null);
    mockIsPointInPlayingArea.mockReturnValue(true);
  });

  describe('initial render', () => {
    it('should render the form title', () => {
      render(<SubmissionForm />);
      expect(screen.getByText('Submit a New Photo')).toBeInTheDocument();
    });

    it('should render PhotoUpload component', () => {
      render(<SubmissionForm />);
      expect(screen.getByTestId('photo-upload')).toBeInTheDocument();
    });

    it('should render MapPicker component', () => {
      render(<SubmissionForm />);
      expect(screen.getByTestId('map-picker')).toBeInTheDocument();
    });

    it('should render override checkbox', () => {
      render(<SubmissionForm />);
      expect(screen.getByText('Allow any location and floor')).toBeInTheDocument();
    });

    it('should render submit button', () => {
      render(<SubmissionForm />);
      expect(screen.getByRole('button', { name: 'Submit Photo' })).toBeInTheDocument();
    });

    it('should not show success message initially', () => {
      render(<SubmissionForm />);
      expect(screen.queryByText(/submitted successfully/)).not.toBeInTheDocument();
    });

    it('should not show error message initially', () => {
      render(<SubmissionForm />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('should show location status indicator', () => {
      render(<SubmissionForm />);
      expect(screen.getByText('Location selected')).toBeInTheDocument();
    });

    it('should not show floor selector initially', () => {
      render(<SubmissionForm />);
      expect(screen.queryByTestId('floor-selector')).not.toBeInTheDocument();
    });
  });

  describe('location picking', () => {
    it('should place marker when clicking on map', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      await user.click(screen.getByText('Click Map'));

      expect(screen.getByTestId('marker-position')).toHaveTextContent('50, 50');
    });

    it('should show floor selector when location is in a region', async () => {
      mockGetFloorsForPoint.mockReturnValue([1, 2, 3]);
      const user = userEvent.setup();
      render(<SubmissionForm />);

      await user.click(screen.getByText('Click Map'));

      expect(screen.getByTestId('floor-selector')).toBeInTheDocument();
    });

    it('should not show floor selector when location is not in a region', async () => {
      mockGetFloorsForPoint.mockReturnValue(null);
      const user = userEvent.setup();
      render(<SubmissionForm />);

      await user.click(screen.getByText('Click Map'));

      expect(screen.queryByTestId('floor-selector')).not.toBeInTheDocument();
    });

    it('should show floor status indicator when in a region', async () => {
      mockGetFloorsForPoint.mockReturnValue([1, 2]);
      const user = userEvent.setup();
      render(<SubmissionForm />);

      await user.click(screen.getByText('Click Map'));

      expect(screen.getByText('Floor selected')).toBeInTheDocument();
    });
  });

  describe('override checkbox', () => {
    it('should hide playing area overlay when override is checked', async () => {
      mockGetPlayingArea.mockResolvedValue({ polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] });
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Wait for playing area to load
      await waitFor(() => {
        expect(screen.getByTestId('has-playing-area')).toBeInTheDocument();
      });

      // Check the override checkbox
      await user.click(screen.getByText('Allow any location and floor'));

      // Playing area should be hidden
      expect(screen.queryByTestId('has-playing-area')).not.toBeInTheDocument();
    });

    it('should show all floors when override is enabled and location is selected', async () => {
      mockGetFloorsForPoint.mockReturnValue(null); // Not in a region normally
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Enable override
      await user.click(screen.getByText('Allow any location and floor'));

      // Click on map
      await user.click(screen.getByText('Click Map'));

      // Should show floor selector with all floors
      expect(screen.getByTestId('floor-selector')).toBeInTheDocument();
      expect(screen.getByTestId('floor-1')).toBeInTheDocument();
      expect(screen.getByTestId('floor-2')).toBeInTheDocument();
      expect(screen.getByTestId('floor-3')).toBeInTheDocument();
    });

    it('should bypass playing area restriction when override is enabled', async () => {
      mockIsPointInPlayingArea.mockReturnValue(false);
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Enable override
      await user.click(screen.getByText('Allow any location and floor'));

      // Click outside playing area
      await user.click(screen.getByTestId('click-outside'));

      // Marker should still be placed
      expect(screen.getByTestId('marker-position')).toBeInTheDocument();
    });
  });

  describe('form validation', () => {
    it('should show error when submitting without photo', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      expect(screen.getByText('Please upload a photo')).toBeInTheDocument();
    });

    it('should show error when submitting without location', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Upload a photo
      await user.click(screen.getByText('Upload Photo'));

      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      expect(screen.getByText('Please select a location on the map')).toBeInTheDocument();
    });

    it('should show error when submitting without floor in a region', async () => {
      mockGetFloorsForPoint.mockReturnValue([1, 2, 3]);
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Upload a photo
      await user.click(screen.getByText('Upload Photo'));
      // Select location (in a region)
      await user.click(screen.getByText('Click Map'));

      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      expect(screen.getByText('Please select a floor')).toBeInTheDocument();
    });

    it('should show error when submitting without difficulty', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Upload a photo and select location (not in a region, so no floor needed)
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Click Map'));

      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      expect(screen.getByText('Please select a difficulty')).toBeInTheDocument();
    });

    it('should not disable submit button initially (validation on submit)', () => {
      render(<SubmissionForm />);
      expect(screen.getByRole('button', { name: 'Submit Photo' })).not.toBeDisabled();
    });
  });

  describe('successful submission', () => {
    it('should show submitting state during upload', async () => {
      const user = userEvent.setup();

      // Make compression take some time
      mockCompressImage.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('data:image/jpeg;base64,mock'), 100)));

      render(<SubmissionForm />);

      // Fill in all fields (not in a region, so no floor needed)
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Click Map'));
      await user.click(screen.getByText('Easy'));

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      // Should show submitting state
      expect(screen.getByText('Submitting...')).toBeInTheDocument();
    });

    it('should disable submit button during upload', async () => {
      const user = userEvent.setup();

      // Make compression take some time
      let resolveCompress: (value: string) => void;
      mockCompressImage.mockImplementation(() => new Promise<string>(resolve => {
        resolveCompress = resolve;
      }));

      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Click Map'));
      await user.click(screen.getByText('Easy'));

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled();

      // Resolve to cleanup
      resolveCompress!('data:image/jpeg;base64,mock');
    });

    it('should call compress and Firestore during successful submission', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Click Map'));
      await user.click(screen.getByText('Easy'));

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      // Wait for the image compression to be called
      await waitFor(() => {
        expect(mockCompressImage).toHaveBeenCalled();
      });

      // Wait for the Firestore save to be called
      await waitFor(() => {
        expect(mockAddDoc).toHaveBeenCalled();
      });
    });

    it('should show success message after successful submission', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Click Map'));
      await user.click(screen.getByText('Easy'));

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      // Wait for submission to complete and success message to appear
      await waitFor(() => {
        expect(screen.getByText(/submitted successfully/)).toBeInTheDocument();
      });
    });

    it('should reset form after successful submission', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Click Map'));
      await user.click(screen.getByText('Easy'));

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      await waitFor(() => {
        expect(screen.queryByTestId('marker-position')).not.toBeInTheDocument();
      });
    });

    it('should submit with floor when in a region', async () => {
      mockGetFloorsForPoint.mockReturnValue([1, 2, 3]);
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Click Map'));
      await user.click(screen.getByTestId('floor-2'));
      await user.click(screen.getByText('Easy'));

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      await waitFor(() => {
        expect(mockAddDoc).toHaveBeenCalled();
      });
    });

    it('should compress photo before saving', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Click Map'));
      await user.click(screen.getByText('Easy'));

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      await waitFor(() => {
        expect(mockCompressImage).toHaveBeenCalled();
      });
    });

    it('should save submission to Firestore', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Click Map'));
      await user.click(screen.getByText('Easy'));

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      await waitFor(() => {
        expect(mockAddDoc).toHaveBeenCalled();
      });
    });
  });

  describe('submission error handling', () => {
    it('should show error message on compression failure', async () => {
      const user = userEvent.setup();
      mockCompressImage.mockRejectedValue(new Error('Compression failed'));

      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Click Map'));
      await user.click(screen.getByText('Easy'));

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to submit. Please try again.')).toBeInTheDocument();
      });
    });

    it('should show error message on Firestore failure', async () => {
      const user = userEvent.setup();
      mockAddDoc.mockRejectedValue(new Error('Firestore error'));

      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Click Map'));
      await user.click(screen.getByText('Easy'));

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to submit. Please try again.')).toBeInTheDocument();
      });
    });

    it('should re-enable submit button after error', async () => {
      const user = userEvent.setup();
      mockCompressImage.mockRejectedValue(new Error('Compression failed'));

      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Click Map'));
      await user.click(screen.getByText('Easy'));

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Submit Photo' })).not.toBeDisabled();
      });
    });
  });

  describe('state behavior', () => {
    it('should update photo selected indicator after upload', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Initially no photo
      expect(screen.queryByTestId('selected-photo')).not.toBeInTheDocument();

      // Select photo
      await user.click(screen.getByText('Upload Photo'));

      // Should show the photo name
      expect(screen.getByTestId('selected-photo')).toHaveTextContent('test.jpg');
    });

    it('should update marker position after location selection', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Initially no marker
      expect(screen.queryByTestId('marker-position')).not.toBeInTheDocument();

      // Select location
      await user.click(screen.getByText('Click Map'));

      // Should show coordinates
      expect(screen.getByTestId('marker-position')).toHaveTextContent('50, 50');
    });

    it('should load regions and playing area on mount', async () => {
      render(<SubmissionForm />);

      await waitFor(() => {
        expect(mockGetRegions).toHaveBeenCalled();
        expect(mockGetPlayingArea).toHaveBeenCalled();
      });
    });
  });
});
