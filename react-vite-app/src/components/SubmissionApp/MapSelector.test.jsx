import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MapSelector from './MapSelector';

describe('MapSelector', () => {
  const mockOnLocationSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial render', () => {
    it('should render the title', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={null} />);
      expect(screen.getByText('Select Location on Map')).toBeInTheDocument();
    });

    it('should render instructions', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={null} />);
      expect(screen.getByText('Click on the map to select the pixel location where the photo was taken')).toBeInTheDocument();
    });

    it('should render map image', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={null} />);
      const mapImage = screen.getByAltText('Campus Map');
      expect(mapImage).toBeInTheDocument();
      expect(mapImage).toHaveAttribute('src', '/map.png');
    });

    it('should not show location marker initially', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={null} />);
      expect(document.querySelector('.location-marker')).not.toBeInTheDocument();
    });

    it('should not show selected coordinates initially', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={null} />);
      expect(screen.queryByText('Selected Location:')).not.toBeInTheDocument();
    });
  });

  describe('with selected location', () => {
    const selectedLocation = { x: 100, y: 200 };

    it('should show location marker', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={selectedLocation} />);
      expect(document.querySelector('.location-marker')).toBeInTheDocument();
    });

    it('should position marker at correct coordinates', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={selectedLocation} />);
      const marker = document.querySelector('.location-marker');
      expect(marker).toHaveStyle({ left: '100px', top: '200px' });
    });

    it('should show selected coordinates', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={selectedLocation} />);
      expect(screen.getByText(/Selected Location:/)).toBeInTheDocument();
      expect(screen.getByText(/X: 100, Y: 200/)).toBeInTheDocument();
    });
  });

  describe('map click interaction', () => {
    it('should call onLocationSelect when map is clicked', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={null} />);

      const mapImage = screen.getByAltText('Campus Map');

      // Mock getBoundingClientRect
      mapImage.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600
      }));

      // Mock naturalWidth and naturalHeight
      Object.defineProperty(mapImage, 'naturalWidth', { value: 800 });
      Object.defineProperty(mapImage, 'naturalHeight', { value: 600 });

      fireEvent.click(mapImage, { clientX: 100, clientY: 200 });

      expect(mockOnLocationSelect).toHaveBeenCalledWith({ x: 100, y: 200 });
    });

    it('should update marker position on click', () => {
      const { rerender } = render(
        <MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={null} />
      );

      const mapImage = screen.getByAltText('Campus Map');

      mapImage.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600
      }));

      Object.defineProperty(mapImage, 'naturalWidth', { value: 800 });
      Object.defineProperty(mapImage, 'naturalHeight', { value: 600 });

      fireEvent.click(mapImage, { clientX: 150, clientY: 250 });

      // Rerender with new location to simulate parent state update
      rerender(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={{ x: 150, y: 250 }} />);

      const marker = document.querySelector('.location-marker');
      expect(marker).toHaveStyle({ left: '150px', top: '250px' });
    });

    it('should handle click with offset from page', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={null} />);

      const mapImage = screen.getByAltText('Campus Map');

      // Map is offset from page origin
      mapImage.getBoundingClientRect = vi.fn(() => ({
        left: 100,
        top: 50,
        width: 800,
        height: 600
      }));

      Object.defineProperty(mapImage, 'naturalWidth', { value: 800 });
      Object.defineProperty(mapImage, 'naturalHeight', { value: 600 });

      // Click at 200, 150 on screen
      fireEvent.click(mapImage, { clientX: 200, clientY: 150 });

      // Should be 100, 100 relative to map (200-100, 150-50)
      expect(mockOnLocationSelect).toHaveBeenCalledWith({ x: 100, y: 100 });
    });

    it('should handle clicks with valid getBoundingClientRect', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={null} />);

      const mapImage = screen.getByAltText('Campus Map');

      // Set up valid getBoundingClientRect
      mapImage.getBoundingClientRect = vi.fn(() => ({
        left: 50,
        top: 50,
        width: 400,
        height: 300
      }));

      Object.defineProperty(mapImage, 'naturalWidth', { value: 400 });
      Object.defineProperty(mapImage, 'naturalHeight', { value: 300 });

      fireEvent.click(mapImage, { clientX: 100, clientY: 100 });

      // Should calculate correctly: x = 100-50 = 50, y = 100-50 = 50
      expect(mockOnLocationSelect).toHaveBeenCalledWith({ x: 50, y: 50 });
    });
  });

  describe('styling classes', () => {
    it('should have map-selector container class', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={null} />);
      expect(document.querySelector('.map-selector')).toBeInTheDocument();
    });

    it('should have map-container class', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={null} />);
      expect(document.querySelector('.map-container')).toBeInTheDocument();
    });

    it('should have map-image class on image', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={null} />);
      const mapImage = screen.getByAltText('Campus Map');
      expect(mapImage).toHaveClass('map-image');
    });

    it('should have instructions class', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={null} />);
      const instructions = screen.getByText('Click on the map to select the pixel location where the photo was taken');
      expect(instructions).toHaveClass('instructions');
    });

    it('should have selected-coordinates class when location selected', () => {
      render(<MapSelector onLocationSelect={mockOnLocationSelect} selectedLocation={{ x: 100, y: 200 }} />);
      expect(document.querySelector('.selected-coordinates')).toBeInTheDocument();
    });
  });
});
