import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MapEditor from './MapEditor';

// Mock Firebase
vi.mock('../../firebase', () => ({
  db: {}
}));

const mockOnSnapshot = vi.fn();
const mockAddDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  doc: vi.fn(),
  addDoc: (...args) => mockAddDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  serverTimestamp: vi.fn(() => 'mock-timestamp')
}));

// Mock child components
vi.mock('./PolygonDrawer', () => ({
  default: ({ regions, selectedRegionId, isDrawing, onRegionSelect, onPointAdd, onPolygonComplete, onPointMove }) => (
    <div data-testid="polygon-drawer">
      <span data-testid="regions-count">{regions.length}</span>
      <span data-testid="selected-region">{selectedRegionId || 'none'}</span>
      <span data-testid="is-drawing">{isDrawing ? 'true' : 'false'}</span>
      <button onClick={() => onRegionSelect('region-1')}>Select Region 1</button>
      <button onClick={() => onPointAdd({ x: 100, y: 100 })}>Add Point</button>
      <button onClick={onPolygonComplete}>Complete Polygon</button>
      <button onClick={() => onPointMove('region-1', 0, { x: 150, y: 150 })}>Move Point</button>
      <button onClick={() => onPointMove('non-existent', 0, { x: 150, y: 150 })}>Move Invalid Point</button>
    </div>
  )
}));

vi.mock('./RegionPanel', () => ({
  default: ({
    regions,
    selectedRegionId,
    onRegionSelect,
    onRegionUpdate,
    onRegionDelete,
    onStartDrawing,
    onCancelDrawing,
    isDrawing,
    newPolygonPoints
  }) => (
    <div data-testid="region-panel">
      <span data-testid="panel-regions-count">{regions.length}</span>
      <span data-testid="panel-selected">{selectedRegionId || 'none'}</span>
      <span data-testid="panel-drawing">{isDrawing ? 'true' : 'false'}</span>
      <span data-testid="panel-points">{newPolygonPoints.length}</span>
      <button onClick={onStartDrawing}>Start Drawing</button>
      <button onClick={onCancelDrawing}>Cancel Drawing</button>
      <button onClick={() => onRegionSelect('region-2')}>Select Region 2</button>
      <button onClick={() => onRegionUpdate('region-1', { name: 'Updated Region' })}>Update Region</button>
      <button onClick={() => onRegionDelete('region-1')}>Delete Region</button>
    </div>
  )
}));

describe('MapEditor', () => {
  const mockUnsubscribe = vi.fn();

  const mockRegions = [
    {
      id: 'region-1',
      name: 'Region 1',
      polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      floors: [1, 2],
      color: '#4a90d9',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    },
    {
      id: 'region-2',
      name: 'Region 2',
      polygon: [{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }],
      floors: [1],
      color: '#e74c3c',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockOnSnapshot.mockImplementation((query, callback) => {
      callback({
        docs: mockRegions.map(r => ({
          id: r.id,
          data: () => r
        }))
      });
      return mockUnsubscribe;
    });

    mockAddDoc.mockResolvedValue({ id: 'new-region-id' });
    mockUpdateDoc.mockResolvedValue();
    mockDeleteDoc.mockResolvedValue();
  });

  describe('loading state', () => {
    it('should show loading message initially', () => {
      mockOnSnapshot.mockImplementation(() => mockUnsubscribe);

      render(<MapEditor />);

      expect(screen.getByText('Loading regions...')).toBeInTheDocument();
    });
  });

  describe('initial render with data', () => {
    it('should render PolygonDrawer component', () => {
      render(<MapEditor />);
      expect(screen.getByTestId('polygon-drawer')).toBeInTheDocument();
    });

    it('should render RegionPanel component', () => {
      render(<MapEditor />);
      expect(screen.getByTestId('region-panel')).toBeInTheDocument();
    });

    it('should pass regions to PolygonDrawer', () => {
      render(<MapEditor />);
      expect(screen.getByTestId('regions-count')).toHaveTextContent('2');
    });

    it('should pass regions to RegionPanel', () => {
      render(<MapEditor />);
      expect(screen.getByTestId('panel-regions-count')).toHaveTextContent('2');
    });

    it('should not be in drawing mode initially', () => {
      render(<MapEditor />);
      expect(screen.getByTestId('is-drawing')).toHaveTextContent('false');
      expect(screen.getByTestId('panel-drawing')).toHaveTextContent('false');
    });

    it('should have no selected region initially', () => {
      render(<MapEditor />);
      expect(screen.getByTestId('selected-region')).toHaveTextContent('none');
      expect(screen.getByTestId('panel-selected')).toHaveTextContent('none');
    });
  });

  describe('drawing mode', () => {
    it('should enter drawing mode when Start Drawing is clicked', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Start Drawing'));

      expect(screen.getByTestId('is-drawing')).toHaveTextContent('true');
      expect(screen.getByTestId('panel-drawing')).toHaveTextContent('true');
    });

    it('should clear selected region when starting to draw', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      // First select a region
      await user.click(screen.getByText('Select Region 1'));
      expect(screen.getByTestId('selected-region')).toHaveTextContent('region-1');

      // Then start drawing
      await user.click(screen.getByText('Start Drawing'));

      expect(screen.getByTestId('selected-region')).toHaveTextContent('none');
    });

    it('should exit drawing mode when Cancel Drawing is clicked', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Start Drawing'));
      expect(screen.getByTestId('is-drawing')).toHaveTextContent('true');

      await user.click(screen.getByText('Cancel Drawing'));

      expect(screen.getByTestId('is-drawing')).toHaveTextContent('false');
    });

    it('should track points when added during drawing', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Start Drawing'));
      await user.click(screen.getByText('Add Point'));

      expect(screen.getByTestId('panel-points')).toHaveTextContent('1');
    });

    it('should clear points when canceling drawing', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Start Drawing'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Add Point'));
      expect(screen.getByTestId('panel-points')).toHaveTextContent('2');

      await user.click(screen.getByText('Cancel Drawing'));

      expect(screen.getByTestId('panel-points')).toHaveTextContent('0');
    });
  });

  describe('polygon completion', () => {
    it('should save new region when polygon is completed', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Start Drawing'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Complete Polygon'));

      expect(mockAddDoc).toHaveBeenCalled();
    });

    it('should not save if fewer than 3 points', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Start Drawing'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Complete Polygon'));

      expect(mockAddDoc).not.toHaveBeenCalled();
    });

    it('should exit drawing mode after completion', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Start Drawing'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Complete Polygon'));

      await waitFor(() => {
        expect(screen.getByTestId('is-drawing')).toHaveTextContent('false');
      });
    });

    it('should select the new region after completion', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Start Drawing'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Complete Polygon'));

      await waitFor(() => {
        expect(screen.getByTestId('selected-region')).toHaveTextContent('new-region-id');
      });
    });
  });

  describe('region selection', () => {
    it('should select region from PolygonDrawer', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Select Region 1'));

      expect(screen.getByTestId('selected-region')).toHaveTextContent('region-1');
      expect(screen.getByTestId('panel-selected')).toHaveTextContent('region-1');
    });

    it('should select region from RegionPanel', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Select Region 2'));

      expect(screen.getByTestId('selected-region')).toHaveTextContent('region-2');
      expect(screen.getByTestId('panel-selected')).toHaveTextContent('region-2');
    });

    it('should not select region while drawing', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Start Drawing'));
      await user.click(screen.getByText('Select Region 1'));

      expect(screen.getByTestId('selected-region')).toHaveTextContent('none');
    });
  });

  describe('region update', () => {
    it('should call updateDoc when region is updated', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Update Region'));

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: 'Updated Region',
          updatedAt: 'mock-timestamp'
        })
      );
    });
  });

  describe('region deletion', () => {
    it('should call deleteDoc when region is deleted', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Delete Region'));

      expect(mockDeleteDoc).toHaveBeenCalled();
    });

    it('should clear selection if deleted region was selected', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      // Select the region first
      await user.click(screen.getByText('Select Region 1'));
      expect(screen.getByTestId('selected-region')).toHaveTextContent('region-1');

      // Delete the selected region
      await user.click(screen.getByText('Delete Region'));

      await waitFor(() => {
        expect(screen.getByTestId('selected-region')).toHaveTextContent('none');
      });
    });
  });

  describe('keyboard shortcuts', () => {
    it('should cancel drawing on Escape key', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Start Drawing'));
      expect(screen.getByTestId('is-drawing')).toHaveTextContent('true');

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.getByTestId('is-drawing')).toHaveTextContent('false');
    });

    it('should not cancel if not in drawing mode', async () => {
      render(<MapEditor />);

      // Not in drawing mode
      expect(screen.getByTestId('is-drawing')).toHaveTextContent('false');

      fireEvent.keyDown(window, { key: 'Escape' });

      // Should still not be in drawing mode (no change)
      expect(screen.getByTestId('is-drawing')).toHaveTextContent('false');
    });
  });

  describe('error handling', () => {
    it('should show error message on Firestore load error', () => {
      mockOnSnapshot.mockImplementation((query, successCallback, errorCallback) => {
        errorCallback(new Error('Failed to load'));
        return mockUnsubscribe;
      });

      render(<MapEditor />);

      expect(screen.getByText('Failed to load regions')).toBeInTheDocument();
    });

    it('should show error message on save failure', async () => {
      const user = userEvent.setup();
      mockAddDoc.mockRejectedValue(new Error('Save failed'));

      render(<MapEditor />);

      await user.click(screen.getByText('Start Drawing'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Add Point'));
      await user.click(screen.getByText('Complete Polygon'));

      await waitFor(() => {
        expect(screen.getByText('Failed to save region')).toBeInTheDocument();
      });
    });

    it('should allow dismissing error message', async () => {
      const user = userEvent.setup();
      mockOnSnapshot.mockImplementation((query, successCallback, errorCallback) => {
        errorCallback(new Error('Failed to load'));
        return mockUnsubscribe;
      });

      render(<MapEditor />);

      expect(screen.getByText('Failed to load regions')).toBeInTheDocument();

      await user.click(screen.getByText('×'));

      expect(screen.queryByText('Failed to load regions')).not.toBeInTheDocument();
    });
  });

  describe('cleanup', () => {
    it('should unsubscribe from Firestore on unmount', () => {
      const { unmount } = render(<MapEditor />);

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('styling classes', () => {
    it('should have map-editor container class', () => {
      render(<MapEditor />);
      expect(document.querySelector('.map-editor')).toBeInTheDocument();
    });

    it('should have map-editor-canvas class', () => {
      render(<MapEditor />);
      expect(document.querySelector('.map-editor-canvas')).toBeInTheDocument();
    });

    it('should have map-editor-panel class', () => {
      render(<MapEditor />);
      expect(document.querySelector('.map-editor-panel')).toBeInTheDocument();
    });
  });

  describe('delete error handling', () => {
    it('should show error message on delete failure', async () => {
      const user = userEvent.setup();
      mockDeleteDoc.mockRejectedValue(new Error('Delete failed'));

      render(<MapEditor />);

      await user.click(screen.getByText('Delete Region'));

      await waitFor(() => {
        expect(screen.getByText('Failed to delete region')).toBeInTheDocument();
      });
    });
  });

  describe('point move functionality', () => {
    it('should update region polygon when moving a point', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Move Point'));

      await waitFor(() => {
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({
            polygon: expect.any(Array),
            updatedAt: 'mock-timestamp'
          })
        );
      });
    });

    it('should handle point move for non-existent region gracefully', async () => {
      const user = userEvent.setup();
      render(<MapEditor />);

      await user.click(screen.getByText('Move Invalid Point'));

      // Should not call updateDoc since region doesn't exist
      await waitFor(() => {
        expect(mockUpdateDoc).not.toHaveBeenCalled();
      });
    });

    it('should show error when point move fails', async () => {
      const user = userEvent.setup();
      mockUpdateDoc.mockRejectedValueOnce(new Error('Move failed'));

      render(<MapEditor />);

      await user.click(screen.getByText('Move Point'));

      await waitFor(() => {
        expect(screen.getByText('Failed to update region')).toBeInTheDocument();
      });
    });
  });

  describe('update error handling', () => {
    it('should show error message on update failure', async () => {
      const user = userEvent.setup();
      mockUpdateDoc.mockRejectedValue(new Error('Update failed'));

      render(<MapEditor />);

      await user.click(screen.getByText('Update Region'));

      await waitFor(() => {
        expect(screen.getByText('Failed to update region')).toBeInTheDocument();
      });
    });
  });
});
