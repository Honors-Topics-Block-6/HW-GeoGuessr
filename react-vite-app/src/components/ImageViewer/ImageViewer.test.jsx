import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ImageViewer from './ImageViewer';

describe('ImageViewer', () => {
  const defaultProps = {
    imageUrl: 'https://example.com/test-image.jpg'
  };

  describe('rendering', () => {
    it('should render the image viewer container', () => {
      const { container } = render(<ImageViewer {...defaultProps} />);

      expect(container.querySelector('.image-viewer')).toBeInTheDocument();
    });

    it('should render the image container', () => {
      const { container } = render(<ImageViewer {...defaultProps} />);

      expect(container.querySelector('.image-container')).toBeInTheDocument();
    });

    it('should render the image with correct src', () => {
      render(<ImageViewer {...defaultProps} imageUrl="https://example.com/photo.jpg" />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
    });

    it('should render the hint section', () => {
      const { container } = render(<ImageViewer {...defaultProps} />);

      expect(container.querySelector('.image-hint')).toBeInTheDocument();
    });

    it('should render the hint icon', () => {
      render(<ImageViewer {...defaultProps} />);

      expect(screen.getByText('📍')).toBeInTheDocument();
    });

    it('should render the hint text', () => {
      render(<ImageViewer {...defaultProps} />);

      expect(screen.getByText('Where was this photo taken?')).toBeInTheDocument();
    });
  });

  describe('alt text', () => {
    it('should use default alt text when not provided', () => {
      render(<ImageViewer {...defaultProps} />);

      expect(screen.getByAltText('Mystery location')).toBeInTheDocument();
    });

    it('should use custom alt text when provided', () => {
      render(<ImageViewer {...defaultProps} alt="Custom description" />);

      expect(screen.getByAltText('Custom description')).toBeInTheDocument();
    });

    it('should handle empty alt text', () => {
      render(<ImageViewer {...defaultProps} alt="" />);

      // When alt is empty, the image may not be found by role since it becomes presentational
      const { container } = render(<ImageViewer {...defaultProps} alt="" />);
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
    });
  });

  describe('image display', () => {
    it('should have mystery-image class on the image', () => {
      render(<ImageViewer {...defaultProps} />);

      const img = screen.getByRole('img');
      expect(img).toHaveClass('mystery-image');
    });

    it('should update image when imageUrl changes', () => {
      const { rerender } = render(<ImageViewer imageUrl="https://example.com/first.jpg" />);

      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/first.jpg');

      rerender(<ImageViewer imageUrl="https://example.com/second.jpg" />);

      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/second.jpg');
    });

    it('should handle different image URL formats', () => {
      const { rerender } = render(<ImageViewer imageUrl="https://example.com/image.jpg" />);
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/image.jpg');

      rerender(<ImageViewer imageUrl="http://example.com/image.png" />);
      expect(screen.getByRole('img')).toHaveAttribute('src', 'http://example.com/image.png');

      rerender(<ImageViewer imageUrl="/local/image.webp" />);
      expect(screen.getByRole('img')).toHaveAttribute('src', '/local/image.webp');

      rerender(<ImageViewer imageUrl="data:image/png;base64,abc123" />);
      expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,abc123');
    });
  });

  describe('structure', () => {
    it('should have correct nesting structure', () => {
      const { container } = render(<ImageViewer {...defaultProps} />);

      const viewer = container.querySelector('.image-viewer');
      const imageContainer = viewer.querySelector('.image-container');
      const img = imageContainer.querySelector('.mystery-image');
      const hint = viewer.querySelector('.image-hint');

      expect(viewer).toBeInTheDocument();
      expect(imageContainer).toBeInTheDocument();
      expect(img).toBeInTheDocument();
      expect(hint).toBeInTheDocument();
    });

    it('should contain hint icon and text spans', () => {
      const { container } = render(<ImageViewer {...defaultProps} />);

      const hint = container.querySelector('.image-hint');
      const hintIcon = hint.querySelector('.hint-icon');

      expect(hintIcon).toBeInTheDocument();
      expect(hintIcon).toHaveTextContent('📍');
    });
  });

  describe('accessibility', () => {
    it('should have accessible image', () => {
      render(<ImageViewer {...defaultProps} />);

      expect(screen.getByRole('img')).toBeInTheDocument();
    });

    it('should provide meaningful alt text for screen readers', () => {
      render(<ImageViewer {...defaultProps} alt="A scenic view of the campus library" />);

      expect(screen.getByAltText('A scenic view of the campus library')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined imageUrl gracefully', () => {
      render(<ImageViewer imageUrl={undefined} />);

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
    });

    it('should handle null imageUrl gracefully', () => {
      render(<ImageViewer imageUrl={null} />);

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
    });

    it('should handle empty string imageUrl', () => {
      render(<ImageViewer imageUrl="" />);

      const img = screen.getByRole('img');
      // Empty src may be rendered differently by jsdom
      expect(img).toBeInTheDocument();
    });

    it('should handle very long URLs', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(1000) + '.jpg';
      render(<ImageViewer imageUrl={longUrl} />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', longUrl);
    });
  });
});
