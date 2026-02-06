import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GuessButton from './GuessButton';

describe('GuessButton', () => {
  const defaultProps = {
    disabled: false,
    onClick: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the button', () => {
      render(<GuessButton {...defaultProps} />);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should render the guess text', () => {
      render(<GuessButton {...defaultProps} />);

      expect(screen.getByText('Guess')).toBeInTheDocument();
    });

    it('should render the target emoji icon', () => {
      render(<GuessButton {...defaultProps} />);

      expect(screen.getByText('🎯')).toBeInTheDocument();
    });

    it('should have guess-button class', () => {
      render(<GuessButton {...defaultProps} />);

      expect(screen.getByRole('button')).toHaveClass('guess-button');
    });
  });

  describe('enabled state', () => {
    it('should not be disabled when disabled prop is false', () => {
      render(<GuessButton {...defaultProps} disabled={false} />);

      expect(screen.getByRole('button')).not.toBeDisabled();
    });

    it('should not have disabled class when enabled', () => {
      render(<GuessButton {...defaultProps} disabled={false} />);

      expect(screen.getByRole('button')).not.toHaveClass('disabled');
    });

    it('should call onClick when clicked', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();

      render(<GuessButton {...defaultProps} onClick={onClick} />);

      await user.click(screen.getByRole('button'));

      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('disabled state', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<GuessButton {...defaultProps} disabled={true} />);

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should have disabled class when disabled', () => {
      render(<GuessButton {...defaultProps} disabled={true} />);

      expect(screen.getByRole('button')).toHaveClass('disabled');
    });

    it('should not call onClick when disabled and clicked', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();

      render(<GuessButton {...defaultProps} disabled={true} onClick={onClick} />);

      await user.click(screen.getByRole('button'));

      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should be focusable when enabled', () => {
      render(<GuessButton {...defaultProps} disabled={false} />);

      const button = screen.getByRole('button');
      button.focus();

      expect(button).toHaveFocus();
    });

    it('should have accessible button role', () => {
      render(<GuessButton {...defaultProps} />);

      expect(screen.getByRole('button', { name: /guess/i })).toBeInTheDocument();
    });

    it('should respond to Enter key when focused', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();

      render(<GuessButton {...defaultProps} onClick={onClick} />);

      const button = screen.getByRole('button');
      button.focus();
      await user.keyboard('{Enter}');

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should respond to Space key when focused', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();

      render(<GuessButton {...defaultProps} onClick={onClick} />);

      const button = screen.getByRole('button');
      button.focus();
      await user.keyboard(' ');

      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('button structure', () => {
    it('should contain icon element', () => {
      const { container } = render(<GuessButton {...defaultProps} />);

      expect(container.querySelector('.guess-icon')).toBeInTheDocument();
    });

    it('should contain text element', () => {
      const { container } = render(<GuessButton {...defaultProps} />);

      expect(container.querySelector('.guess-text')).toBeInTheDocument();
    });
  });

  describe('state transitions', () => {
    it('should update when disabled prop changes', () => {
      const { rerender } = render(<GuessButton {...defaultProps} disabled={false} />);

      expect(screen.getByRole('button')).not.toBeDisabled();

      rerender(<GuessButton {...defaultProps} disabled={true} />);

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should update class when disabled prop changes', () => {
      const { rerender } = render(<GuessButton {...defaultProps} disabled={false} />);

      expect(screen.getByRole('button')).not.toHaveClass('disabled');

      rerender(<GuessButton {...defaultProps} disabled={true} />);

      expect(screen.getByRole('button')).toHaveClass('disabled');
    });
  });
});
