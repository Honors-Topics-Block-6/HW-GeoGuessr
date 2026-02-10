import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MapPicker from './MapPicker';

describe('MapPicker', () => {
  const defaultProps = {
    markerPosition: null,
    onMapClick: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the map container', () => {
      const { container } = render(<MapPicker {...defaultProps} />);

      expect(container.querySelector('.map-picker-container')).toBeInTheDocument();
    });

    it('should render the map header', () => {
      render(<MapPicker {...defaultProps} />);

      expect(screen.getByText('Click to place your guess')).toBeInTheDocument();
    });

    it('should render the map icon', () => {
      render(<MapPicker {...defaultProps} />);

      expect(screen.getByText('🗺️')).toBeInTheDocument();
    });

    it('should render the map image', () => {
      render(<MapPicker {...defaultProps} />);

      const mapImage = screen.getByAltText('Campus Map');
      expect(mapImage).toBeInTheDocument();
      expect(mapImage).toHaveAttribute('src', '/map.png');
    });
  });

  describe('marker display', () => {
    it('should not show marker when markerPosition is null', () => {
      const { container } = render(<MapPicker {...defaultProps} markerPosition={null} />);

      expect(container.querySelector('.marker')).not.toBeInTheDocument();
    });

    it('should show marker when markerPosition is provided', () => {
      const { container } = render(
        <MapPicker {...defaultProps} markerPosition={{ x: 50, y: 50 }} />
      );

      expect(container.querySelector('.marker')).toBeInTheDocument();
    });

    it('should position marker correctly', () => {
      const { container } = render(
        <MapPicker {...defaultProps} markerPosition={{ x: 25, y: 75 }} />
      );

      const marker = container.querySelector('.marker');
      expect(marker).toHaveStyle({ left: '25%', top: '75%' });
    });

    it('should update marker position when props change', () => {
      const { container, rerender } = render(
        <MapPicker {...defaultProps} markerPosition={{ x: 10, y: 20 }} />
      );

      rerender(<MapPicker {...defaultProps} markerPosition={{ x: 80, y: 90 }} />);

      const marker = container.querySelector('.marker');
      expect(marker).toHaveStyle({ left: '80%', top: '90%' });
    });

    it('should render marker pin element', () => {
      const { container } = render(
        <MapPicker {...defaultProps} markerPosition={{ x: 50, y: 50 }} />
      );

      expect(container.querySelector('.marker-pin')).toBeInTheDocument();
    });

    it('should render marker pulse element', () => {
      const { container } = render(
        <MapPicker {...defaultProps} markerPosition={{ x: 50, y: 50 }} />
      );

      expect(container.querySelector('.marker-pulse')).toBeInTheDocument();
    });
  });

  describe('click handling', () => {
    it('should call onMapClick when map is clicked', () => {
      const onMapClick = vi.fn();
      const { container } = render(<MapPicker {...defaultProps} onMapClick={onMapClick} />);

      const mapPicker = container.querySelector('.map-picker');

      // Mock getBoundingClientRect
      mapPicker.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100
      });

      fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });

      expect(onMapClick).toHaveBeenCalledWith({ x: 50, y: 50 });
    });

    it('should calculate coordinates relative to element', () => {
      const onMapClick = vi.fn();
      const { container } = render(<MapPicker {...defaultProps} onMapClick={onMapClick} />);

      const mapPicker = container.querySelector('.map-picker');

      // Mock getBoundingClientRect with offset
      mapPicker.getBoundingClientRect = () => ({
        left: 100,
        top: 200,
        width: 400,
        height: 300,
        right: 500,
        bottom: 500
      });

      fireEvent.click(mapPicker, { clientX: 300, clientY: 350 });

      // (300 - 100) / 400 * 100 = 50%
      // (350 - 200) / 300 * 100 = 50%
      expect(onMapClick).toHaveBeenCalledWith({ x: 50, y: 50 });
    });

    it('should clamp coordinates to 0-100 range (minimum)', () => {
      const onMapClick = vi.fn();
      const { container } = render(<MapPicker {...defaultProps} onMapClick={onMapClick} />);

      const mapPicker = container.querySelector('.map-picker');

      mapPicker.getBoundingClientRect = () => ({
        left: 100,
        top: 100,
        width: 100,
        height: 100,
        right: 200,
        bottom: 200
      });

      // Click outside the element (negative coordinates)
      fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });

      expect(onMapClick).toHaveBeenCalledWith({ x: 0, y: 0 });
    });

    it('should clamp coordinates to 0-100 range (maximum)', () => {
      const onMapClick = vi.fn();
      const { container } = render(<MapPicker {...defaultProps} onMapClick={onMapClick} />);

      const mapPicker = container.querySelector('.map-picker');

      mapPicker.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100
      });

      // Click beyond the element (> 100 coordinates)
      fireEvent.click(mapPicker, { clientX: 150, clientY: 150 });

      expect(onMapClick).toHaveBeenCalledWith({ x: 100, y: 100 });
    });

    it('should handle clicks at corners', () => {
      const onMapClick = vi.fn();
      const { container } = render(<MapPicker {...defaultProps} onMapClick={onMapClick} />);

      const mapPicker = container.querySelector('.map-picker');

      mapPicker.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100
      });

      // Top-left corner
      fireEvent.click(mapPicker, { clientX: 0, clientY: 0 });
      expect(onMapClick).toHaveBeenCalledWith({ x: 0, y: 0 });

      // Bottom-right corner
      fireEvent.click(mapPicker, { clientX: 100, clientY: 100 });
      expect(onMapClick).toHaveBeenCalledWith({ x: 100, y: 100 });
    });
  });

  describe('edge cases', () => {
    it('should handle zero-dimension element gracefully', () => {
      const onMapClick = vi.fn();
      const { container } = render(<MapPicker {...defaultProps} onMapClick={onMapClick} />);

      const mapPicker = container.querySelector('.map-picker');

      mapPicker.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0
      });

      // This could cause division by zero - the component should handle it
      fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });

      // Expect either NaN handling or infinity handling
      expect(onMapClick).toHaveBeenCalled();
    });

    it('should handle marker at boundary positions', () => {
      const { container, rerender } = render(
        <MapPicker {...defaultProps} markerPosition={{ x: 0, y: 0 }} />
      );

      let marker = container.querySelector('.marker');
      expect(marker).toHaveStyle({ left: '0%', top: '0%' });

      rerender(<MapPicker {...defaultProps} markerPosition={{ x: 100, y: 100 }} />);

      marker = container.querySelector('.marker');
      expect(marker).toHaveStyle({ left: '100%', top: '100%' });
    });

    it('should handle decimal marker positions', () => {
      const { container } = render(
        <MapPicker {...defaultProps} markerPosition={{ x: 33.333, y: 66.667 }} />
      );

      const marker = container.querySelector('.marker');
      expect(marker).toHaveStyle({ left: '33.333%', top: '66.667%' });
    });
  });

  describe('accessibility', () => {
    it('should have accessible image with alt text', () => {
      render(<MapPicker {...defaultProps} />);

      expect(screen.getByAltText('Campus Map')).toBeInTheDocument();
    });

    it('should have clickable map area', () => {
      const { container } = render(<MapPicker {...defaultProps} />);

      const mapPicker = container.querySelector('.map-picker');
      expect(mapPicker).toBeInTheDocument();
    });
  });
});
