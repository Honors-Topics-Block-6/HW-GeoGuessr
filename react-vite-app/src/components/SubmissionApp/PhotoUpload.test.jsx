import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhotoUpload from './PhotoUpload';

// Mock URL.createObjectURL
const mockObjectURL = 'blob:http://localhost/test-image';
global.URL.createObjectURL = vi.fn(() => mockObjectURL);
global.URL.revokeObjectURL = vi.fn();

describe('PhotoUpload', () => {
  const mockOnPhotoSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial render without photo', () => {
    it('should render the title', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);
      expect(screen.getByText('Upload Photo')).toBeInTheDocument();
    });

    it('should render drop zone', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);
      expect(screen.getByText('Click to upload or drag and drop')).toBeInTheDocument();
    });

    it('should show supported file types', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);
      expect(screen.getByText('PNG, JPG, GIF up to 10MB')).toBeInTheDocument();
    });

    it('should show upload icon', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);
      expect(screen.getByText('📷')).toBeInTheDocument();
    });

    it('should not show preview', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);
      expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();
    });

    it('should not show remove button', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);
      expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    });

    it('should have hidden file input', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);
      const input = document.querySelector('input[type="file"]');
      expect(input).toBeInTheDocument();
      expect(input).toHaveClass('file-input');
    });

    it('should accept only images', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);
      const input = document.querySelector('input[type="file"]');
      expect(input).toHaveAttribute('accept', 'image/*');
    });
  });

  describe('initial render with selected photo', () => {
    const selectedPhoto = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    it('should show preview image', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={selectedPhoto} />);
      expect(screen.getByAltText('Preview')).toBeInTheDocument();
    });

    it('should set preview src from createObjectURL', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={selectedPhoto} />);
      const preview = screen.getByAltText('Preview');
      expect(preview).toHaveAttribute('src', mockObjectURL);
    });

    it('should show remove button', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={selectedPhoto} />);
      expect(screen.getByText('Remove')).toBeInTheDocument();
    });

    it('should not show drop zone', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={selectedPhoto} />);
      expect(screen.queryByText('Click to upload or drag and drop')).not.toBeInTheDocument();
    });
  });

  describe('file selection via click', () => {
    it('should trigger file input click when drop zone is clicked', async () => {
      const user = userEvent.setup();
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const input = document.querySelector('input[type="file"]');
      const clickSpy = vi.spyOn(input, 'click');

      const dropZone = screen.getByText('Click to upload or drag and drop').closest('.drop-zone');
      await user.click(dropZone);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should call onPhotoSelect when valid image is selected', async () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const input = document.querySelector('input[type="file"]');
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      fireEvent.change(input, { target: { files: [file] } });

      expect(mockOnPhotoSelect).toHaveBeenCalledWith(file);
    });

    it('should not call onPhotoSelect for non-image files', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const input = document.querySelector('input[type="file"]');
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });

      fireEvent.change(input, { target: { files: [file] } });

      expect(mockOnPhotoSelect).not.toHaveBeenCalled();
    });

    it('should update preview when file is selected', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const input = document.querySelector('input[type="file"]');
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      fireEvent.change(input, { target: { files: [file] } });

      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    });
  });

  describe('drag and drop', () => {
    it('should add drag-active class on dragenter', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const dropZone = screen.getByText('Click to upload or drag and drop').closest('.drop-zone');

      fireEvent.dragEnter(dropZone);

      expect(dropZone).toHaveClass('drag-active');
    });

    it('should add drag-active class on dragover', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const dropZone = screen.getByText('Click to upload or drag and drop').closest('.drop-zone');

      fireEvent.dragOver(dropZone);

      expect(dropZone).toHaveClass('drag-active');
    });

    it('should remove drag-active class on dragleave', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const dropZone = screen.getByText('Click to upload or drag and drop').closest('.drop-zone');

      fireEvent.dragEnter(dropZone);
      expect(dropZone).toHaveClass('drag-active');

      fireEvent.dragLeave(dropZone);
      expect(dropZone).not.toHaveClass('drag-active');
    });

    it('should call onPhotoSelect when image is dropped', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const dropZone = screen.getByText('Click to upload or drag and drop').closest('.drop-zone');
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file]
        }
      });

      expect(mockOnPhotoSelect).toHaveBeenCalledWith(file);
    });

    it('should not call onPhotoSelect when non-image is dropped', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const dropZone = screen.getByText('Click to upload or drag and drop').closest('.drop-zone');
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });

      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file]
        }
      });

      expect(mockOnPhotoSelect).not.toHaveBeenCalled();
    });

    it('should remove drag-active class after drop', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const dropZone = screen.getByText('Click to upload or drag and drop').closest('.drop-zone');

      fireEvent.dragEnter(dropZone);
      expect(dropZone).toHaveClass('drag-active');

      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [new File(['test'], 'test.jpg', { type: 'image/jpeg' })]
        }
      });

      expect(dropZone).not.toHaveClass('drag-active');
    });

    it('should prevent default on drag events', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const dropZone = screen.getByText('Click to upload or drag and drop').closest('.drop-zone');

      const dragEnterEvent = new Event('dragenter', { bubbles: true });
      dragEnterEvent.preventDefault = vi.fn();
      dropZone.dispatchEvent(dragEnterEvent);

      expect(dragEnterEvent.preventDefault).toHaveBeenCalled();
    });
  });

  describe('remove photo', () => {
    const selectedPhoto = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    it('should call onPhotoSelect with null when remove is clicked', async () => {
      const user = userEvent.setup();
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={selectedPhoto} />);

      await user.click(screen.getByText('Remove'));

      expect(mockOnPhotoSelect).toHaveBeenCalledWith(null);
    });

    it('should clear preview when remove is clicked', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={selectedPhoto} />
      );

      await user.click(screen.getByText('Remove'));

      // Rerender with null to simulate parent state update
      rerender(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();
    });

    it('should show drop zone after removing photo', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={selectedPhoto} />
      );

      await user.click(screen.getByText('Remove'));

      // Rerender with null to simulate parent state update
      rerender(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      expect(screen.getByText('Click to upload or drag and drop')).toBeInTheDocument();
    });
  });

  describe('styling classes', () => {
    it('should have photo-upload container class', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);
      expect(document.querySelector('.photo-upload')).toBeInTheDocument();
    });

    it('should have drop-zone class', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);
      expect(document.querySelector('.drop-zone')).toBeInTheDocument();
    });

    it('should have preview-container class when photo selected', () => {
      const selectedPhoto = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={selectedPhoto} />);
      expect(document.querySelector('.preview-container')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle drop with no files', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const dropZone = screen.getByText('Click to upload or drag and drop').closest('.drop-zone');

      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: []
        }
      });

      expect(mockOnPhotoSelect).not.toHaveBeenCalled();
    });

    it('should handle drop with undefined dataTransfer.files', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const dropZone = screen.getByText('Click to upload or drag and drop').closest('.drop-zone');

      fireEvent.drop(dropZone, {
        dataTransfer: {}
      });

      expect(mockOnPhotoSelect).not.toHaveBeenCalled();
    });

    it('should clear file input value when removing photo', async () => {
      const user = userEvent.setup();
      const selectedPhoto = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={selectedPhoto} />);

      const input = document.querySelector('input[type="file"]');
      // Set a value on the input to simulate a file being selected
      Object.defineProperty(input, 'value', {
        writable: true,
        value: 'C:\\fakepath\\test.jpg'
      });

      await user.click(screen.getByText('Remove'));

      expect(input.value).toBe('');
    });

    it('should handle change event with no files', () => {
      render(<PhotoUpload onPhotoSelect={mockOnPhotoSelect} selectedPhoto={null} />);

      const input = document.querySelector('input[type="file"]');

      fireEvent.change(input, { target: { files: [] } });

      expect(mockOnPhotoSelect).not.toHaveBeenCalled();
    });
  });
});
