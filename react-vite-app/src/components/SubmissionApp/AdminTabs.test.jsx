import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminTabs from './AdminTabs';

// Mock child components
vi.mock('./AdminReview', () => ({
  default: () => <div data-testid="admin-review">Admin Review Component</div>
}));

vi.mock('./MapEditor', () => ({
  default: () => <div data-testid="map-editor">Map Editor Component</div>
}));

describe('AdminTabs', () => {
  const mockOnTabChange = vi.fn();
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial render', () => {
    it('should render admin panel header', () => {
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    });

    it('should render back button', () => {
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      expect(screen.getByText('← Back to Submission')).toBeInTheDocument();
    });

    it('should render Review Submissions tab', () => {
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      expect(screen.getByText('Review Submissions')).toBeInTheDocument();
    });

    it('should render Map Editor tab', () => {
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      expect(screen.getByText('Map Editor')).toBeInTheDocument();
    });
  });

  describe('tab navigation', () => {
    it('should show AdminReview when activeTab is review', () => {
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      expect(screen.getByTestId('admin-review')).toBeInTheDocument();
      expect(screen.queryByTestId('map-editor')).not.toBeInTheDocument();
    });

    it('should show MapEditor when activeTab is mapEditor', () => {
      render(
        <AdminTabs activeTab="mapEditor" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      expect(screen.getByTestId('map-editor')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-review')).not.toBeInTheDocument();
    });

    it('should have active class on review tab when activeTab is review', () => {
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      const reviewTab = screen.getByText('Review Submissions');
      expect(reviewTab).toHaveClass('active');
    });

    it('should have active class on mapEditor tab when activeTab is mapEditor', () => {
      render(
        <AdminTabs activeTab="mapEditor" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      const mapEditorTab = screen.getByText('Map Editor');
      expect(mapEditorTab).toHaveClass('active');
    });

    it('should not have active class on review tab when activeTab is mapEditor', () => {
      render(
        <AdminTabs activeTab="mapEditor" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      const reviewTab = screen.getByText('Review Submissions');
      expect(reviewTab).not.toHaveClass('active');
    });
  });

  describe('tab click handlers', () => {
    it('should call onTabChange with review when Review tab is clicked', async () => {
      const user = userEvent.setup();
      render(
        <AdminTabs activeTab="mapEditor" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );

      await user.click(screen.getByText('Review Submissions'));

      expect(mockOnTabChange).toHaveBeenCalledWith('review');
    });

    it('should call onTabChange with mapEditor when Map Editor tab is clicked', async () => {
      const user = userEvent.setup();
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );

      await user.click(screen.getByText('Map Editor'));

      expect(mockOnTabChange).toHaveBeenCalledWith('mapEditor');
    });
  });

  describe('back button', () => {
    it('should call onBack when back button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );

      await user.click(screen.getByText('← Back to Submission'));

      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('styling classes', () => {
    it('should have admin-panel container class', () => {
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      expect(document.querySelector('.admin-panel')).toBeInTheDocument();
    });

    it('should have admin-panel-header class', () => {
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      expect(document.querySelector('.admin-panel-header')).toBeInTheDocument();
    });

    it('should have admin-tabs class for tab container', () => {
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      expect(document.querySelector('.admin-tabs')).toBeInTheDocument();
    });

    it('should have admin-content class for content area', () => {
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      expect(document.querySelector('.admin-content')).toBeInTheDocument();
    });

    it('should have admin-tab class on tab buttons', () => {
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      const tabs = document.querySelectorAll('.admin-tab');
      expect(tabs.length).toBe(2);
    });

    it('should have back-button class', () => {
      render(
        <AdminTabs activeTab="review" onTabChange={mockOnTabChange} onBack={mockOnBack} />
      );
      expect(document.querySelector('.back-button')).toBeInTheDocument();
    });
  });
});
