import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FloorSelector from './FloorSelector';

describe('FloorSelector', () => {
  const defaultProps = {
    selectedFloor: null,
    onFloorSelect: vi.fn(),
    floors: [1, 2, 3]
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the floor selector container', () => {
      const { container } = render(<FloorSelector {...defaultProps} />);

      expect(container.querySelector('.floor-selector')).toBeInTheDocument();
    });

    it('should render the header', () => {
      render(<FloorSelector {...defaultProps} />);

      expect(screen.getByText('Select Floor')).toBeInTheDocument();
    });

    it('should render the building icon', () => {
      render(<FloorSelector {...defaultProps} />);

      expect(screen.getByText('🏢')).toBeInTheDocument();
    });

    it('should render default 3 floor buttons', () => {
      render(<FloorSelector {...defaultProps} />);

      expect(screen.getByText('1st')).toBeInTheDocument();
      expect(screen.getByText('2nd')).toBeInTheDocument();
      expect(screen.getByText('3rd')).toBeInTheDocument();
    });

    it('should render floor numbers', () => {
      render(<FloorSelector {...defaultProps} />);

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  describe('custom floors', () => {
    it('should render custom floor numbers', () => {
      render(<FloorSelector {...defaultProps} floors={[1, 2, 3, 4, 5]} />);

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should use correct ordinal suffix for 4th floor', () => {
      render(<FloorSelector {...defaultProps} floors={[4]} />);

      expect(screen.getByText('4th')).toBeInTheDocument();
    });

    it('should use correct ordinal suffix for all floors', () => {
      render(<FloorSelector {...defaultProps} floors={[1, 2, 3, 4, 5, 6]} />);

      expect(screen.getByText('1st')).toBeInTheDocument();
      expect(screen.getByText('2nd')).toBeInTheDocument();
      expect(screen.getByText('3rd')).toBeInTheDocument();
      expect(screen.getByText('4th')).toBeInTheDocument();
      expect(screen.getByText('5th')).toBeInTheDocument();
      expect(screen.getByText('6th')).toBeInTheDocument();
    });

    it('should default to [1, 2, 3] when floors prop not provided', () => {
      render(<FloorSelector selectedFloor={null} onFloorSelect={vi.fn()} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);
    });
  });

  describe('selection state', () => {
    it('should not have selected class when no floor selected', () => {
      render(<FloorSelector {...defaultProps} selectedFloor={null} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).not.toHaveClass('selected');
      });
    });

    it('should add selected class to selected floor', () => {
      render(<FloorSelector {...defaultProps} selectedFloor={2} />);

      const floor2Button = screen.getByText('2nd').closest('button');
      expect(floor2Button).toHaveClass('selected');
    });

    it('should not add selected class to unselected floors', () => {
      render(<FloorSelector {...defaultProps} selectedFloor={2} />);

      const floor1Button = screen.getByText('1st').closest('button');
      const floor3Button = screen.getByText('3rd').closest('button');

      expect(floor1Button).not.toHaveClass('selected');
      expect(floor3Button).not.toHaveClass('selected');
    });

    it('should update selected state when prop changes', () => {
      const { rerender } = render(<FloorSelector {...defaultProps} selectedFloor={1} />);

      expect(screen.getByText('1st').closest('button')).toHaveClass('selected');

      rerender(<FloorSelector {...defaultProps} selectedFloor={3} />);

      expect(screen.getByText('1st').closest('button')).not.toHaveClass('selected');
      expect(screen.getByText('3rd').closest('button')).toHaveClass('selected');
    });
  });

  describe('click handling', () => {
    it('should call onFloorSelect with floor number when clicked', async () => {
      const user = userEvent.setup();
      const onFloorSelect = vi.fn();

      render(<FloorSelector {...defaultProps} onFloorSelect={onFloorSelect} />);

      await user.click(screen.getByText('2nd'));

      expect(onFloorSelect).toHaveBeenCalledWith(2);
    });

    it('should call onFloorSelect with correct floor for each button', async () => {
      const user = userEvent.setup();
      const onFloorSelect = vi.fn();

      render(<FloorSelector {...defaultProps} onFloorSelect={onFloorSelect} />);

      await user.click(screen.getByText('1st'));
      expect(onFloorSelect).toHaveBeenCalledWith(1);

      await user.click(screen.getByText('2nd'));
      expect(onFloorSelect).toHaveBeenCalledWith(2);

      await user.click(screen.getByText('3rd'));
      expect(onFloorSelect).toHaveBeenCalledWith(3);
    });

    it('should call onFloorSelect even when clicking already selected floor', async () => {
      const user = userEvent.setup();
      const onFloorSelect = vi.fn();

      render(<FloorSelector {...defaultProps} selectedFloor={2} onFloorSelect={onFloorSelect} />);

      await user.click(screen.getByText('2nd'));

      expect(onFloorSelect).toHaveBeenCalledWith(2);
    });
  });

  describe('keyboard accessibility', () => {
    it('should have buttons that can be focused', () => {
      render(<FloorSelector {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).not.toBeDisabled();
      });
    });

    it('should trigger onFloorSelect on Enter key', async () => {
      const user = userEvent.setup();
      const onFloorSelect = vi.fn();

      render(<FloorSelector {...defaultProps} onFloorSelect={onFloorSelect} />);

      const button = screen.getByText('2nd').closest('button');
      button.focus();
      await user.keyboard('{Enter}');

      expect(onFloorSelect).toHaveBeenCalledWith(2);
    });

    it('should trigger onFloorSelect on Space key', async () => {
      const user = userEvent.setup();
      const onFloorSelect = vi.fn();

      render(<FloorSelector {...defaultProps} onFloorSelect={onFloorSelect} />);

      const button = screen.getByText('2nd').closest('button');
      button.focus();
      await user.keyboard(' ');

      expect(onFloorSelect).toHaveBeenCalledWith(2);
    });
  });

  describe('button structure', () => {
    it('should have floor number and label in each button', () => {
      const { container } = render(<FloorSelector {...defaultProps} />);

      const buttons = container.querySelectorAll('.floor-button');

      buttons.forEach(button => {
        expect(button.querySelector('.floor-number')).toBeInTheDocument();
        expect(button.querySelector('.floor-label')).toBeInTheDocument();
      });
    });

    it('should render correct number of buttons', () => {
      render(<FloorSelector {...defaultProps} floors={[1, 2, 3, 4]} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(4);
    });
  });

  describe('edge cases', () => {
    it('should handle empty floors array', () => {
      render(<FloorSelector {...defaultProps} floors={[]} />);

      const buttons = screen.queryAllByRole('button');
      expect(buttons).toHaveLength(0);
    });

    it('should handle single floor', () => {
      render(<FloorSelector {...defaultProps} floors={[1]} />);

      expect(screen.getByText('1st')).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('should handle non-sequential floors', () => {
      render(<FloorSelector {...defaultProps} floors={[1, 3, 5]} />);

      expect(screen.getByText('1st')).toBeInTheDocument();
      expect(screen.getByText('3rd')).toBeInTheDocument();
      expect(screen.getByText('5th')).toBeInTheDocument();
      expect(screen.queryByText('2nd')).not.toBeInTheDocument();
    });
  });
});
