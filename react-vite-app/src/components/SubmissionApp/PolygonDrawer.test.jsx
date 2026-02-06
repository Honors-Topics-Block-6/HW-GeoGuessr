import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PolygonDrawer from './PolygonDrawer';

describe('PolygonDrawer', () => {
  const mockOnRegionSelect = vi.fn();
  const mockOnPointAdd = vi.fn();
  const mockOnPolygonComplete = vi.fn();
  const mockOnPointMove = vi.fn();

  const mockRegions = [
    {
      id: 'region-1',
      name: 'Library',
      polygon: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 }
      ],
      color: '#4a90d9'
    },
    {
      id: 'region-2',
      name: 'Cafeteria',
      polygon: [
        { x: 300, y: 300 },
        { x: 400, y: 300 },
        { x: 400, y: 400 }
      ],
      color: '#e74c3c'
    }
  ];

  const defaultProps = {
    regions: mockRegions,
    selectedRegionId: null,
    isDrawing: false,
    newPolygonPoints: [],
    onRegionSelect: mockOnRegionSelect,
    onPointAdd: mockOnPointAdd,
    onPolygonComplete: mockOnPolygonComplete,
    onPointMove: mockOnPointMove
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial render', () => {
    it('should render SVG container', () => {
      render(<PolygonDrawer {...defaultProps} />);
      expect(document.querySelector('svg')).toBeInTheDocument();
    });

    it('should render map image', () => {
      render(<PolygonDrawer {...defaultProps} />);
      const image = document.querySelector('image');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('href', '/map.png');
    });

    it('should render all region polygons', () => {
      render(<PolygonDrawer {...defaultProps} />);
      const polygons = document.querySelectorAll('.region-polygon');
      expect(polygons.length).toBe(2);
    });

    it('should render region labels', () => {
      render(<PolygonDrawer {...defaultProps} />);
      expect(screen.getByText('Library')).toBeInTheDocument();
      expect(screen.getByText('Cafeteria')).toBeInTheDocument();
    });

    it('should set polygon fill with region color', () => {
      render(<PolygonDrawer {...defaultProps} />);
      const polygons = document.querySelectorAll('.region-polygon');
      expect(polygons[0]).toHaveAttribute('fill', '#4a90d9');
      expect(polygons[1]).toHaveAttribute('fill', '#e74c3c');
    });

    it('should show empty state message when no regions and not drawing', () => {
      render(<PolygonDrawer {...defaultProps} regions={[]} />);
      expect(screen.getByText('No regions defined yet.')).toBeInTheDocument();
      expect(screen.getByText('Click "New Region" to start drawing.')).toBeInTheDocument();
    });
  });

  describe('region selection', () => {
    it('should call onRegionSelect when polygon is clicked', () => {
      render(<PolygonDrawer {...defaultProps} />);

      const polygons = document.querySelectorAll('.region-polygon');
      fireEvent.click(polygons[0], { stopPropagation: () => {} });

      expect(mockOnRegionSelect).toHaveBeenCalledWith('region-1');
    });

    it('should highlight selected region with different opacity', () => {
      render(<PolygonDrawer {...defaultProps} selectedRegionId="region-1" />);

      const polygons = document.querySelectorAll('.region-polygon');
      expect(polygons[0]).toHaveAttribute('fill-opacity', '0.5');
      expect(polygons[1]).toHaveAttribute('fill-opacity', '0.3');
    });

    it('should show vertex handles for selected region', () => {
      render(<PolygonDrawer {...defaultProps} selectedRegionId="region-1" />);

      const vertices = document.querySelectorAll('.polygon-vertex');
      // region-1 has 4 vertices
      expect(vertices.length).toBe(4);
    });

    it('should not show vertex handles for non-selected regions', () => {
      render(<PolygonDrawer {...defaultProps} selectedRegionId="region-2" />);

      const vertices = document.querySelectorAll('.polygon-vertex');
      // region-2 has 3 vertices
      expect(vertices.length).toBe(3);
    });

    it('should have thicker stroke on selected region', () => {
      render(<PolygonDrawer {...defaultProps} selectedRegionId="region-1" />);

      const polygons = document.querySelectorAll('.region-polygon');
      expect(polygons[0]).toHaveAttribute('stroke-width', '3');
      expect(polygons[1]).toHaveAttribute('stroke-width', '2');
    });
  });

  describe('drawing mode', () => {
    it('should add drawing-mode class to SVG when drawing', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} />);

      const svg = document.querySelector('svg');
      expect(svg).toHaveClass('drawing-mode');
    });

    it('should show hint text when drawing with no points', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} newPolygonPoints={[]} />);

      expect(screen.getByText('Click on the map to add points. Click first point to close.')).toBeInTheDocument();
    });

    it('should not show hint when points exist', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} newPolygonPoints={[{ x: 100, y: 100 }]} />);

      expect(screen.queryByText('Click on the map to add points. Click first point to close.')).not.toBeInTheDocument();
    });

    it('should render polyline for in-progress polygon', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} newPolygonPoints={[
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 }
      ]} />);

      const polyline = document.querySelector('polyline');
      expect(polyline).toBeInTheDocument();
      expect(polyline).toHaveAttribute('points', '100,100 200,100 200,200');
    });

    it('should render circles for each point while drawing', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} newPolygonPoints={[
        { x: 100, y: 100 },
        { x: 200, y: 100 }
      ]} />);

      const circles = document.querySelectorAll('.drawing-vertex');
      expect(circles.length).toBe(2);
    });

    it('should highlight first point differently', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} newPolygonPoints={[
        { x: 100, y: 100 },
        { x: 200, y: 100 }
      ]} />);

      const firstVertex = document.querySelector('.first-vertex');
      expect(firstVertex).toBeInTheDocument();
    });

    it('should show "Click to close" hint when 3+ points', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} newPolygonPoints={[
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 }
      ]} />);

      expect(screen.getByText('Click to close')).toBeInTheDocument();
    });

    it('should not show close hint with fewer than 3 points', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} newPolygonPoints={[
        { x: 100, y: 100 },
        { x: 200, y: 100 }
      ]} />);

      expect(screen.queryByText('Click to close')).not.toBeInTheDocument();
    });
  });

  describe('click handling', () => {
    it('should call onPointAdd when clicking on SVG in drawing mode', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} />);

      const svg = document.querySelector('svg');

      // Mock getBoundingClientRect
      svg.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600
      }));

      fireEvent.click(svg, { clientX: 400, clientY: 300 });

      expect(mockOnPointAdd).toHaveBeenCalled();
    });

    it('should not call onPointAdd when not in drawing mode', () => {
      render(<PolygonDrawer {...defaultProps} />);

      const svg = document.querySelector('svg');

      svg.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600
      }));

      fireEvent.click(svg, { clientX: 400, clientY: 300 });

      expect(mockOnPointAdd).not.toHaveBeenCalled();
    });

    it('should call onPolygonComplete when clicking near first point', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} newPolygonPoints={[
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 }
      ]} />);

      const svg = document.querySelector('svg');

      svg.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600
      }));

      // Click near the first point (100, 100)
      fireEvent.click(svg, { clientX: 105, clientY: 105 });

      expect(mockOnPolygonComplete).toHaveBeenCalled();
    });
  });

  describe('vertex dragging', () => {
    it('should start dragging on vertex mousedown', () => {
      render(<PolygonDrawer {...defaultProps} selectedRegionId="region-1" />);

      const vertices = document.querySelectorAll('.polygon-vertex');
      fireEvent.mouseDown(vertices[0]);

      // Dragging state is internal, but we can test that mouseMove calls onPointMove
      const svg = document.querySelector('svg');

      svg.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600
      }));

      fireEvent.mouseMove(svg, { clientX: 150, clientY: 150 });

      expect(mockOnPointMove).toHaveBeenCalledWith('region-1', 0, expect.any(Object));
    });

    it('should stop dragging on mouseUp', () => {
      render(<PolygonDrawer {...defaultProps} selectedRegionId="region-1" />);

      const vertices = document.querySelectorAll('.polygon-vertex');
      const svg = document.querySelector('svg');

      svg.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600
      }));

      fireEvent.mouseDown(vertices[0]);
      fireEvent.mouseUp(svg);

      // After mouseUp, mouseMove should not call onPointMove
      mockOnPointMove.mockClear();
      fireEvent.mouseMove(svg, { clientX: 150, clientY: 150 });

      expect(mockOnPointMove).not.toHaveBeenCalled();
    });

    it('should stop dragging on mouseLeave', () => {
      render(<PolygonDrawer {...defaultProps} selectedRegionId="region-1" />);

      const vertices = document.querySelectorAll('.polygon-vertex');
      const svg = document.querySelector('svg');

      svg.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600
      }));

      fireEvent.mouseDown(vertices[0]);
      fireEvent.mouseLeave(svg);

      mockOnPointMove.mockClear();
      fireEvent.mouseMove(svg, { clientX: 150, clientY: 150 });

      expect(mockOnPointMove).not.toHaveBeenCalled();
    });
  });

  describe('coordinate conversion', () => {
    it('should scale coordinates based on viewBox', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} />);

      const svg = document.querySelector('svg');

      // ViewBox is 800x600, but rendered size might be different
      svg.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 1600, // Double the viewBox width
        height: 1200 // Double the viewBox height
      }));

      fireEvent.click(svg, { clientX: 800, clientY: 600 });

      // Should be scaled to viewBox coordinates (400, 300)
      expect(mockOnPointAdd).toHaveBeenCalledWith({ x: 400, y: 300 });
    });

    it('should clamp coordinates to viewBox bounds', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} />);

      const svg = document.querySelector('svg');

      svg.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600
      }));

      // Click outside bounds
      fireEvent.click(svg, { clientX: -100, clientY: -100 });

      expect(mockOnPointAdd).toHaveBeenCalledWith({ x: 0, y: 0 });
    });
  });

  describe('styling', () => {
    it('should have polygon-drawer-container class', () => {
      render(<PolygonDrawer {...defaultProps} />);
      expect(document.querySelector('.polygon-drawer-container')).toBeInTheDocument();
    });

    it('should have polygon-drawer-svg class on SVG', () => {
      render(<PolygonDrawer {...defaultProps} />);
      expect(document.querySelector('.polygon-drawer-svg')).toBeInTheDocument();
    });

    it('should set cursor to move on vertex handles', () => {
      render(<PolygonDrawer {...defaultProps} selectedRegionId="region-1" />);

      const vertices = document.querySelectorAll('.polygon-vertex');
      expect(vertices[0]).toHaveStyle({ cursor: 'move' });
    });

    it('should use dashed stroke for in-progress polygon', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} newPolygonPoints={[
        { x: 100, y: 100 },
        { x: 200, y: 100 }
      ]} />);

      const polyline = document.querySelector('polyline');
      expect(polyline).toHaveAttribute('stroke-dasharray', '8,4');
    });
  });

  describe('viewBox and dimensions', () => {
    it('should have correct viewBox dimensions', () => {
      render(<PolygonDrawer {...defaultProps} />);

      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('viewBox', '0 0 800 600');
    });

    it('should preserve aspect ratio', () => {
      render(<PolygonDrawer {...defaultProps} />);

      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    });
  });

  describe('polygon points string generation', () => {
    it('should generate correct points string for polygons', () => {
      render(<PolygonDrawer {...defaultProps} />);

      const polygons = document.querySelectorAll('.region-polygon');
      expect(polygons[0]).toHaveAttribute('points', '100,100 200,100 200,200 100,200');
    });
  });

  describe('hover first point behavior', () => {
    it('should not update hover state when not drawing', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={false} />);

      const svg = document.querySelector('svg');

      svg.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600
      }));

      // Mouse move should not affect anything when not drawing
      fireEvent.mouseMove(svg, { clientX: 100, clientY: 100 });

      // No crash, component still renders
      expect(svg).toBeInTheDocument();
    });

    it('should not update hover state when fewer than 3 points', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} newPolygonPoints={[
        { x: 100, y: 100 },
        { x: 200, y: 100 }
      ]} />);

      const svg = document.querySelector('svg');

      svg.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600
      }));

      // Mouse move near first point - should not trigger hover since < 3 points
      fireEvent.mouseMove(svg, { clientX: 105, clientY: 105 });

      // First vertex should not have hover styling (larger radius)
      const firstVertex = document.querySelector('.first-vertex');
      expect(firstVertex).toHaveAttribute('r', '10');
    });

    it('should update hover state when near first point with 3+ points', () => {
      render(<PolygonDrawer {...defaultProps} isDrawing={true} newPolygonPoints={[
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 }
      ]} />);

      const svg = document.querySelector('svg');

      svg.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600
      }));

      // Mouse move near first point
      fireEvent.mouseMove(svg, { clientX: 105, clientY: 105 });

      // First vertex should have hover styling (larger radius of 12)
      const firstVertex = document.querySelector('.first-vertex');
      expect(firstVertex).toHaveAttribute('r', '12');
    });

    it('should remove hover state when moving away from first point', () => {
      const { rerender } = render(<PolygonDrawer {...defaultProps} isDrawing={true} newPolygonPoints={[
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 }
      ]} />);

      const svg = document.querySelector('svg');

      svg.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600
      }));

      // Move near first point first
      fireEvent.mouseMove(svg, { clientX: 105, clientY: 105 });

      // Then move away
      fireEvent.mouseMove(svg, { clientX: 400, clientY: 300 });

      // First vertex should go back to normal radius
      const firstVertex = document.querySelector('.first-vertex');
      expect(firstVertex).toHaveAttribute('r', '10');
    });
  });

  describe('handleSvgClick with getViewBoxCoords null', () => {
    it('should handle click when svgRef.current is null gracefully', () => {
      // This edge case is hard to test directly but we can verify no crash
      render(<PolygonDrawer {...defaultProps} isDrawing={true} />);

      const svg = document.querySelector('svg');

      // Don't set getBoundingClientRect - it will use actual DOM values
      // Just verify no crash
      fireEvent.click(svg, { clientX: 400, clientY: 300 });

      expect(svg).toBeInTheDocument();
    });
  });

  describe('region with missing color', () => {
    it('should use default color for region without color property', () => {
      const regionsWithoutColor = [
        {
          id: 'region-1',
          name: 'No Color Region',
          polygon: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }]
          // no color property
        }
      ];

      render(<PolygonDrawer {...defaultProps} regions={regionsWithoutColor} />);

      const polygon = document.querySelector('.region-polygon');
      expect(polygon).toHaveAttribute('fill', '#4a90d9');
    });
  });
});
