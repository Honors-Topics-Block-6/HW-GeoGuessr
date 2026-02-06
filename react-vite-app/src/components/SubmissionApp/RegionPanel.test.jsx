import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegionPanel from './RegionPanel';

describe('RegionPanel', () => {
  const mockOnRegionSelect = vi.fn();
  const mockOnRegionUpdate = vi.fn();
  const mockOnRegionDelete = vi.fn();
  const mockOnStartDrawing = vi.fn();
  const mockOnCancelDrawing = vi.fn();

  const mockRegions = [
    {
      id: 'region-1',
      name: 'Library',
      floors: [1, 2],
      color: '#4a90d9'
    },
    {
      id: 'region-2',
      name: 'Cafeteria',
      floors: [1],
      color: '#e74c3c'
    }
  ];

  const defaultProps = {
    regions: mockRegions,
    selectedRegionId: null,
    onRegionSelect: mockOnRegionSelect,
    onRegionUpdate: mockOnRegionUpdate,
    onRegionDelete: mockOnRegionDelete,
    onStartDrawing: mockOnStartDrawing,
    onCancelDrawing: mockOnCancelDrawing,
    isDrawing: false,
    newPolygonPoints: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toolbar', () => {
    it('should render New Region button when not drawing', () => {
      render(<RegionPanel {...defaultProps} />);
      expect(screen.getByText('+ New Region')).toBeInTheDocument();
    });

    it('should call onStartDrawing when New Region is clicked', async () => {
      const user = userEvent.setup();
      render(<RegionPanel {...defaultProps} />);

      await user.click(screen.getByText('+ New Region'));

      expect(mockOnStartDrawing).toHaveBeenCalled();
    });

    it('should show drawing status when in drawing mode', () => {
      render(<RegionPanel {...defaultProps} isDrawing={true} newPolygonPoints={[{ x: 0, y: 0 }]} />);

      expect(screen.getByText(/Drawing: 1 points/)).toBeInTheDocument();
    });

    it('should show Cancel button when drawing', () => {
      render(<RegionPanel {...defaultProps} isDrawing={true} />);

      expect(screen.getByText('Cancel (Esc)')).toBeInTheDocument();
      expect(screen.queryByText('+ New Region')).not.toBeInTheDocument();
    });

    it('should call onCancelDrawing when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<RegionPanel {...defaultProps} isDrawing={true} />);

      await user.click(screen.getByText('Cancel (Esc)'));

      expect(mockOnCancelDrawing).toHaveBeenCalled();
    });

    it('should update point count as points are added', () => {
      const { rerender } = render(<RegionPanel {...defaultProps} isDrawing={true} newPolygonPoints={[]} />);

      expect(screen.getByText(/Drawing: 0 points/)).toBeInTheDocument();

      rerender(<RegionPanel {...defaultProps} isDrawing={true} newPolygonPoints={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} />);

      expect(screen.getByText(/Drawing: 2 points/)).toBeInTheDocument();
    });
  });

  describe('region list', () => {
    it('should show regions count in header', () => {
      render(<RegionPanel {...defaultProps} />);
      expect(screen.getByText('Regions (2)')).toBeInTheDocument();
    });

    it('should render all regions', () => {
      render(<RegionPanel {...defaultProps} />);
      expect(screen.getByText('Library')).toBeInTheDocument();
      expect(screen.getByText('Cafeteria')).toBeInTheDocument();
    });

    it('should display floor information for each region', () => {
      render(<RegionPanel {...defaultProps} />);
      expect(screen.getByText('Floors 1, 2')).toBeInTheDocument();
      expect(screen.getByText('Floor 1')).toBeInTheDocument();
    });

    it('should show color swatches for regions', () => {
      render(<RegionPanel {...defaultProps} />);
      const swatches = document.querySelectorAll('.region-color-swatch');
      expect(swatches.length).toBe(2);
      expect(swatches[0]).toHaveStyle({ backgroundColor: '#4a90d9' });
    });

    it('should call onRegionSelect when region is clicked', async () => {
      const user = userEvent.setup();
      render(<RegionPanel {...defaultProps} />);

      await user.click(screen.getByText('Library'));

      expect(mockOnRegionSelect).toHaveBeenCalledWith('region-1');
    });

    it('should highlight selected region', () => {
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      const selectedItem = document.querySelector('.region-item.selected');
      expect(selectedItem).toBeInTheDocument();
    });

    it('should show empty message when no regions', () => {
      render(<RegionPanel {...defaultProps} regions={[]} />);

      expect(screen.getByText('No regions yet. Create one to get started.')).toBeInTheDocument();
    });
  });

  describe('region editor', () => {
    it('should not show editor when no region is selected', () => {
      render(<RegionPanel {...defaultProps} />);
      expect(screen.queryByText('Edit Region')).not.toBeInTheDocument();
    });

    it('should show editor when region is selected', () => {
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);
      expect(screen.getByText('Edit Region')).toBeInTheDocument();
    });

    it('should populate name input with region name', () => {
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);
      expect(screen.getByDisplayValue('Library')).toBeInTheDocument();
    });

    it('should show floor toggles', () => {
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);
      expect(screen.getByText('Floors')).toBeInTheDocument();
    });

    it('should show selected floors hint', () => {
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);
      expect(screen.getByText(/Selected: 1, 2/)).toBeInTheDocument();
    });

    it('should show color presets', () => {
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);
      expect(screen.getByText('Color')).toBeInTheDocument();
      const colorPresets = document.querySelectorAll('.color-preset');
      expect(colorPresets.length).toBe(8);
    });

    it('should show Save Changes button', () => {
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    it('should show Delete button', () => {
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  describe('editing region', () => {
    it('should allow editing name', async () => {
      const user = userEvent.setup();
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      const nameInput = screen.getByDisplayValue('Library');
      await user.clear(nameInput);
      await user.type(nameInput, 'New Library');

      expect(nameInput).toHaveValue('New Library');
    });

    it('should toggle floor when clicked', async () => {
      const user = userEvent.setup();
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      // Floor 3 should not be active initially
      const floor3Button = screen.getByTitle('Floor 3');
      expect(floor3Button).not.toHaveClass('active');

      await user.click(floor3Button);

      expect(floor3Button).toHaveClass('active');
    });

    it('should not allow removing all floors', async () => {
      const user = userEvent.setup();
      // Region with only one floor
      render(<RegionPanel {...defaultProps} selectedRegionId="region-2" />);

      // Try to remove the only selected floor
      const floor1Button = screen.getByTitle('Floor 1');
      await user.click(floor1Button);

      // Should still be active since it's the only floor
      expect(floor1Button).toHaveClass('active');
    });

    it('should select color when preset is clicked', async () => {
      const user = userEvent.setup();
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      const colorPresets = document.querySelectorAll('.color-preset');
      await user.click(colorPresets[2]); // Click third color

      expect(colorPresets[2]).toHaveClass('active');
    });

    it('should call onRegionUpdate when Save Changes is clicked', async () => {
      const user = userEvent.setup();
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      await user.click(screen.getByText('Save Changes'));

      expect(mockOnRegionUpdate).toHaveBeenCalledWith('region-1', expect.objectContaining({
        name: 'Library',
        floors: [1, 2],
        color: '#4a90d9'
      }));
    });

    it('should sort floors before saving', async () => {
      const user = userEvent.setup();
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      // Add floor 3 (after 1, 2)
      await user.click(screen.getByTitle('Floor 3'));

      await user.click(screen.getByText('Save Changes'));

      expect(mockOnRegionUpdate).toHaveBeenCalledWith('region-1', expect.objectContaining({
        floors: [1, 2, 3]
      }));
    });
  });

  describe('deleting region', () => {
    it('should require confirmation to delete', async () => {
      const user = userEvent.setup();
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      await user.click(screen.getByText('Delete'));

      // Should show confirmation text
      expect(screen.getByText('Click again to confirm')).toBeInTheDocument();
      expect(mockOnRegionDelete).not.toHaveBeenCalled();
    });

    it('should delete on second click', async () => {
      const user = userEvent.setup();
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Click again to confirm'));

      expect(mockOnRegionDelete).toHaveBeenCalledWith('region-1');
    });

    it('should cancel confirmation on blur', async () => {
      const user = userEvent.setup();
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      const deleteButton = screen.getByText('Delete');
      await user.click(deleteButton);

      expect(screen.getByText('Click again to confirm')).toBeInTheDocument();

      // Blur the button
      fireEvent.blur(screen.getByText('Click again to confirm'));

      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('should have confirm class when waiting for confirmation', async () => {
      const user = userEvent.setup();
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      await user.click(screen.getByText('Delete'));

      expect(document.querySelector('.delete-button.confirm')).toBeInTheDocument();
    });
  });

  describe('hints and instructions', () => {
    it('should show hint when regions exist but none selected', () => {
      render(<RegionPanel {...defaultProps} />);

      expect(screen.getByText('Click on a region in the list or on the map to edit it.')).toBeInTheDocument();
    });

    it('should not show hint when region is selected', () => {
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      expect(screen.queryByText('Click on a region in the list or on the map to edit it.')).not.toBeInTheDocument();
    });

    it('should not show hint when drawing', () => {
      render(<RegionPanel {...defaultProps} isDrawing={true} />);

      expect(screen.queryByText('Click on a region in the list or on the map to edit it.')).not.toBeInTheDocument();
    });

    it('should not show hint when no regions exist', () => {
      render(<RegionPanel {...defaultProps} regions={[]} />);

      expect(screen.queryByText('Click on a region in the list or on the map to edit it.')).not.toBeInTheDocument();
    });
  });

  describe('floor formatting', () => {
    it('should show "None" for empty floors array', () => {
      const regionsWithNoFloors = [{
        id: 'region-1',
        name: 'Test',
        floors: [],
        color: '#4a90d9'
      }];

      render(<RegionPanel {...defaultProps} regions={regionsWithNoFloors} />);

      expect(screen.getByText('None')).toBeInTheDocument();
    });

    it('should show singular "Floor" for single floor', () => {
      render(<RegionPanel {...defaultProps} />);
      expect(screen.getByText('Floor 1')).toBeInTheDocument();
    });

    it('should show plural "Floors" for multiple floors', () => {
      render(<RegionPanel {...defaultProps} />);
      expect(screen.getByText('Floors 1, 2')).toBeInTheDocument();
    });

    it('should handle basement floors', () => {
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      // Check for basement floor buttons
      expect(screen.getByTitle('Basement 1')).toBeInTheDocument();
      expect(screen.getByTitle('Basement 2')).toBeInTheDocument();
    });
  });

  describe('selection state sync', () => {
    it('should update editor when selection changes', () => {
      const { rerender } = render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      expect(screen.getByDisplayValue('Library')).toBeInTheDocument();

      rerender(<RegionPanel {...defaultProps} selectedRegionId="region-2" />);

      expect(screen.getByDisplayValue('Cafeteria')).toBeInTheDocument();
    });

    it('should reset delete confirmation when selection changes', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      await user.click(screen.getByText('Delete'));
      expect(screen.getByText('Click again to confirm')).toBeInTheDocument();

      rerender(<RegionPanel {...defaultProps} selectedRegionId="region-2" />);

      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  describe('styling classes', () => {
    it('should have region-panel container class', () => {
      render(<RegionPanel {...defaultProps} />);
      expect(document.querySelector('.region-panel')).toBeInTheDocument();
    });

    it('should have region-panel-toolbar class', () => {
      render(<RegionPanel {...defaultProps} />);
      expect(document.querySelector('.region-panel-toolbar')).toBeInTheDocument();
    });

    it('should have region-list class', () => {
      render(<RegionPanel {...defaultProps} />);
      expect(document.querySelector('.region-list')).toBeInTheDocument();
    });

    it('should have region-editor class when editing', () => {
      render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);
      expect(document.querySelector('.region-editor')).toBeInTheDocument();
    });
  });

  describe('effect dependencies', () => {
    it('should update edit state when selectedRegion becomes null', () => {
      const { rerender } = render(<RegionPanel {...defaultProps} selectedRegionId="region-1" />);

      // Initially showing editor for region-1
      expect(screen.getByDisplayValue('Library')).toBeInTheDocument();

      // Deselect region
      rerender(<RegionPanel {...defaultProps} selectedRegionId={null} />);

      // Editor should not be visible
      expect(screen.queryByText('Edit Region')).not.toBeInTheDocument();
    });

    it('should handle region with missing name property', () => {
      const regionsWithMissingName = [{
        id: 'region-1',
        floors: [1, 2],
        color: '#4a90d9'
        // name is missing
      }];

      render(<RegionPanel {...defaultProps} regions={regionsWithMissingName} selectedRegionId="region-1" />);

      // Should show empty string in the input
      const nameInput = screen.getByRole('textbox');
      expect(nameInput).toHaveValue('');
    });

    it('should handle region with missing floors property', () => {
      const regionsWithMissingFloors = [{
        id: 'region-1',
        name: 'Test Region',
        color: '#4a90d9'
        // floors is missing
      }];

      render(<RegionPanel {...defaultProps} regions={regionsWithMissingFloors} selectedRegionId="region-1" />);

      // Should default to [1]
      expect(screen.getByTitle('Floor 1')).toHaveClass('active');
    });

    it('should handle region with missing color property', () => {
      const regionsWithMissingColor = [{
        id: 'region-1',
        name: 'Test Region',
        floors: [1, 2]
        // color is missing
      }];

      render(<RegionPanel {...defaultProps} regions={regionsWithMissingColor} selectedRegionId="region-1" />);

      // Should default to #4a90d9
      const colorPresets = document.querySelectorAll('.color-preset');
      expect(colorPresets[0]).toHaveClass('active');
    });
  });

  describe('handleFloorToggle edge cases', () => {
    it('should add floor and maintain sort order', async () => {
      const user = userEvent.setup();

      // Start with floor 2 selected
      const regionsWithFloor2 = [{
        id: 'region-1',
        name: 'Test',
        floors: [2],
        color: '#4a90d9'
      }];

      render(<RegionPanel {...defaultProps} regions={regionsWithFloor2} selectedRegionId="region-1" />);

      // Add floor 1 before floor 2
      await user.click(screen.getByTitle('Floor 1'));

      // Verify both floors are selected
      expect(screen.getByTitle('Floor 1')).toHaveClass('active');
      expect(screen.getByTitle('Floor 2')).toHaveClass('active');
    });
  });

  describe('region list item rendering', () => {
    it('should display region color in swatch correctly', () => {
      const customColorRegions = [{
        id: 'region-1',
        name: 'Red Region',
        floors: [1],
        color: '#ff0000'
      }];

      render(<RegionPanel {...defaultProps} regions={customColorRegions} />);

      const swatch = document.querySelector('.region-color-swatch');
      expect(swatch).toHaveStyle({ backgroundColor: '#ff0000' });
    });

    it('should use default color when region has no color', () => {
      const noColorRegions = [{
        id: 'region-1',
        name: 'No Color Region',
        floors: [1]
        // no color property
      }];

      render(<RegionPanel {...defaultProps} regions={noColorRegions} />);

      const swatch = document.querySelector('.region-color-swatch');
      expect(swatch).toHaveStyle({ backgroundColor: '#4a90d9' });
    });
  });
});
