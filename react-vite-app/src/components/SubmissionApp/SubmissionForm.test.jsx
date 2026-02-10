import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubmissionForm from './SubmissionForm';

// Mock Firebase
vi.mock('../../firebase', () => ({
  db: {},
  storage: {}
}));

const mockAddDoc = vi.fn();
const mockUploadBytes = vi.fn();
const mockGetDownloadURL = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: (...args) => mockAddDoc(...args),
  serverTimestamp: vi.fn(() => 'mock-timestamp')
}));

vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: (...args) => mockUploadBytes(...args),
  getDownloadURL: (...args) => mockGetDownloadURL(...args)
}));

// Mock child components
vi.mock('./MapSelector', () => ({
  default: ({ onLocationSelect, selectedLocation }) => (
    <div data-testid="map-selector">
      <button onClick={() => onLocationSelect({ x: 100, y: 200 })}>
        Select Location
      </button>
      {selectedLocation && (
        <span data-testid="selected-location">
          {selectedLocation.x}, {selectedLocation.y}
        </span>
      )}
    </div>
  )
}));

vi.mock('./PhotoUpload', () => ({
  default: ({ onPhotoSelect, selectedPhoto }) => (
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
    mockUploadBytes.mockResolvedValue({});
    mockGetDownloadURL.mockResolvedValue('https://example.com/photo.jpg');
    mockAddDoc.mockResolvedValue({ id: 'test-doc-id' });
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

    it('should render MapSelector component', () => {
      render(<SubmissionForm />);
      expect(screen.getByTestId('map-selector')).toBeInTheDocument();
    });

    it('should render floor input', () => {
      render(<SubmissionForm />);
      expect(screen.getByText('Floor Number')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)')).toBeInTheDocument();
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
  });

  describe('floor input', () => {
    it('should allow entering floor number', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      const floorInput = screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)');
      await user.type(floorInput, '2');

      expect(floorInput).toHaveValue(2);
    });

    it('should have min and max attributes', () => {
      render(<SubmissionForm />);

      const floorInput = screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)');
      expect(floorInput).toHaveAttribute('min', '1');
      expect(floorInput).toHaveAttribute('max', '3');
    });

    it('should show floor hint', () => {
      render(<SubmissionForm />);
      expect(screen.getByText('Floors 1-3 only')).toBeInTheDocument();
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

    it('should show error when submitting without floor', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Upload a photo
      await user.click(screen.getByText('Upload Photo'));
      // Select location
      await user.click(screen.getByText('Select Location'));

      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      expect(screen.getByText('Please enter a valid floor number')).toBeInTheDocument();
    });

    it('should show error for invalid floor number', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Upload a photo
      await user.click(screen.getByText('Upload Photo'));
      // Select location
      await user.click(screen.getByText('Select Location'));
      // Enter invalid floor (non-numeric handled as NaN)
      const floorInput = screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)');
      await user.clear(floorInput);

      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      expect(screen.getByText('Please enter a valid floor number')).toBeInTheDocument();
    });
  });

  describe('successful submission', () => {
    it('should show submitting state during upload', async () => {
      const user = userEvent.setup();

      // Make upload take some time
      mockUploadBytes.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Select Location'));
      const floorInput = screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)');
      await user.type(floorInput, '2');

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      // Should show submitting state
      expect(screen.getByText('Submitting...')).toBeInTheDocument();
    });

    it('should disable submit button during upload', async () => {
      const user = userEvent.setup();

      // Make upload take some time
      let resolveUpload;
      mockUploadBytes.mockImplementation(() => new Promise(resolve => {
        resolveUpload = resolve;
      }));

      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Select Location'));
      const floorInput = screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)');
      await user.type(floorInput, '2');

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled();

      // Resolve to cleanup
      resolveUpload();
    });

    it('should call Firebase functions during successful submission', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Select Location'));
      const floorInput = screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)');
      await user.type(floorInput, '2');

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      // Wait for the Firebase upload to be called
      await waitFor(() => {
        expect(mockUploadBytes).toHaveBeenCalled();
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
      await user.click(screen.getByText('Select Location'));
      const floorInput = screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)');
      await user.type(floorInput, '2');

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
      await user.click(screen.getByText('Select Location'));
      const floorInput = screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)');
      await user.type(floorInput, '2');

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      await waitFor(() => {
        expect(floorInput).toHaveValue(null);
      });
    });

    it('should upload photo to Firebase Storage', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Select Location'));
      const floorInput = screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)');
      await user.type(floorInput, '2');

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      await waitFor(() => {
        expect(mockUploadBytes).toHaveBeenCalled();
      });
    });

    it('should save submission to Firestore', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Select Location'));
      const floorInput = screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)');
      await user.type(floorInput, '2');

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      await waitFor(() => {
        expect(mockAddDoc).toHaveBeenCalled();
      });
    });
  });

  describe('submission error handling', () => {
    it('should show error message on upload failure', async () => {
      const user = userEvent.setup();
      mockUploadBytes.mockRejectedValue(new Error('Upload failed'));

      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Select Location'));
      const floorInput = screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)');
      await user.type(floorInput, '2');

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
      await user.click(screen.getByText('Select Location'));
      const floorInput = screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)');
      await user.type(floorInput, '2');

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to submit. Please try again.')).toBeInTheDocument();
      });
    });

    it('should re-enable submit button after error', async () => {
      const user = userEvent.setup();
      mockUploadBytes.mockRejectedValue(new Error('Upload failed'));

      render(<SubmissionForm />);

      // Fill in all fields
      await user.click(screen.getByText('Upload Photo'));
      await user.click(screen.getByText('Select Location'));
      const floorInput = screen.getByPlaceholderText('Enter floor number (e.g., 1, 2, 3)');
      await user.type(floorInput, '2');

      // Submit
      await user.click(screen.getByRole('button', { name: 'Submit Photo' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Submit Photo' })).not.toBeDisabled();
      });
    });
  });

  describe('error state behavior', () => {
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

    it('should update location indicator after selection', async () => {
      const user = userEvent.setup();
      render(<SubmissionForm />);

      // Initially no location
      expect(screen.queryByTestId('selected-location')).not.toBeInTheDocument();

      // Select location
      await user.click(screen.getByText('Select Location'));

      // Should show coordinates
      expect(screen.getByTestId('selected-location')).toHaveTextContent('100, 200');
    });
  });
});
