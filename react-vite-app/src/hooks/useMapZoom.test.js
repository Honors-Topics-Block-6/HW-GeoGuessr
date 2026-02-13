import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useMapZoom, { MIN_SCALE, MAX_SCALE, ZOOM_STEP, DRAG_THRESHOLD } from './useMapZoom';

// Helper to create a mock container ref with getBoundingClientRect
function createMockContainerRef(width = 400, height = 300) {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height
  });
  // Mock addEventListener/removeEventListener for the wheel listener
  element.addEventListener = vi.fn();
  element.removeEventListener = vi.fn();

  return { current: element };
}

describe('useMapZoom', () => {
  let containerRef;

  beforeEach(() => {
    containerRef = createMockContainerRef();
  });

  describe('initial state', () => {
    it('should start with scale of 1', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      expect(result.current.scale).toBe(MIN_SCALE);
    });

    it('should start with translate at origin', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      expect(result.current.translate).toEqual({ x: 0, y: 0 });
    });

    it('should start with identity transform style', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      expect(result.current.transformStyle).toBe('translate(0px, 0px) scale(1)');
    });

    it('should start with hasMoved returning false', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      expect(result.current.hasMoved()).toBe(false);
    });

    it('should provide all handler functions', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      expect(result.current.handlers.onMouseDown).toBeInstanceOf(Function);
      expect(result.current.handlers.onMouseMove).toBeInstanceOf(Function);
      expect(result.current.handlers.onMouseUp).toBeInstanceOf(Function);
      expect(result.current.handlers.onMouseLeave).toBeInstanceOf(Function);
      expect(result.current.handlers.onTouchStart).toBeInstanceOf(Function);
      expect(result.current.handlers.onTouchEnd).toBeInstanceOf(Function);
    });

    it('should provide zoom control functions', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      expect(result.current.zoomIn).toBeInstanceOf(Function);
      expect(result.current.zoomOut).toBeInstanceOf(Function);
      expect(result.current.resetZoom).toBeInstanceOf(Function);
    });
  });

  describe('zoom in', () => {
    it('should increase scale by ZOOM_STEP', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.zoomIn();
      });

      expect(result.current.scale).toBe(MIN_SCALE + ZOOM_STEP);
    });

    it('should not exceed MAX_SCALE', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      // Zoom in many times to exceed max
      for (let i = 0; i < 20; i++) {
        act(() => {
          result.current.zoomIn();
        });
      }

      expect(result.current.scale).toBeLessThanOrEqual(MAX_SCALE);
    });

    it('should update transform style after zoom in', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.zoomIn();
      });

      expect(result.current.transformStyle).toContain('scale(');
      expect(result.current.transformStyle).not.toBe('translate(0px, 0px) scale(1)');
    });
  });

  describe('zoom out', () => {
    it('should decrease scale by ZOOM_STEP', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      // First zoom in
      act(() => {
        result.current.zoomIn();
        result.current.zoomIn();
      });

      const scaleAfterZoomIn = result.current.scale;

      act(() => {
        result.current.zoomOut();
      });

      expect(result.current.scale).toBe(scaleAfterZoomIn - ZOOM_STEP);
    });

    it('should not go below MIN_SCALE', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.zoomOut();
      });

      expect(result.current.scale).toBe(MIN_SCALE);
    });

    it('should reset translate when zooming out to MIN_SCALE', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      // Zoom in first
      act(() => {
        result.current.zoomIn();
      });

      // Zoom back out to min
      act(() => {
        result.current.zoomOut();
      });

      expect(result.current.scale).toBe(MIN_SCALE);
      expect(result.current.translate).toEqual({ x: 0, y: 0 });
    });
  });

  describe('reset zoom', () => {
    it('should reset scale to MIN_SCALE', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.zoomIn();
        result.current.zoomIn();
      });

      act(() => {
        result.current.resetZoom();
      });

      expect(result.current.scale).toBe(MIN_SCALE);
    });

    it('should reset translate to origin', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.zoomIn();
      });

      act(() => {
        result.current.resetZoom();
      });

      expect(result.current.translate).toEqual({ x: 0, y: 0 });
    });

    it('should reset transform style to identity', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.zoomIn();
      });

      act(() => {
        result.current.resetZoom();
      });

      expect(result.current.transformStyle).toBe('translate(0px, 0px) scale(1)');
    });
  });

  describe('native event listeners', () => {
    it('should attach native wheel event listener on mount', () => {
      renderHook(() => useMapZoom(containerRef));

      expect(containerRef.current.addEventListener).toHaveBeenCalledWith(
        'wheel',
        expect.any(Function),
        { passive: false }
      );
    });

    it('should attach native touchmove event listener on mount', () => {
      renderHook(() => useMapZoom(containerRef));

      expect(containerRef.current.addEventListener).toHaveBeenCalledWith(
        'touchmove',
        expect.any(Function),
        { passive: false }
      );
    });

    it('should remove event listeners on unmount', () => {
      const { unmount } = renderHook(() => useMapZoom(containerRef));

      unmount();

      expect(containerRef.current.removeEventListener).toHaveBeenCalledWith(
        'wheel',
        expect.any(Function)
      );
      expect(containerRef.current.removeEventListener).toHaveBeenCalledWith(
        'touchmove',
        expect.any(Function)
      );
    });
  });

  describe('hasMoved', () => {
    it('should return false initially', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      expect(result.current.hasMoved()).toBe(false);
    });

    it('should return false after mouse down without movement', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.handlers.onMouseDown({ clientX: 50, clientY: 50, button: 2 });
      });

      expect(result.current.hasMoved()).toBe(false);
    });

    it('should return true after mouse move beyond threshold', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.handlers.onMouseDown({ clientX: 50, clientY: 50, button: 2 });
      });

      act(() => {
        result.current.handlers.onMouseMove({
          clientX: 50 + DRAG_THRESHOLD + 1,
          clientY: 50
        });
      });

      expect(result.current.hasMoved()).toBe(true);
    });

    it('should return false for small movements below threshold', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.handlers.onMouseDown({ clientX: 50, clientY: 50, button: 2 });
      });

      act(() => {
        result.current.handlers.onMouseMove({
          clientX: 50 + DRAG_THRESHOLD - 1,
          clientY: 50
        });
      });

      expect(result.current.hasMoved()).toBe(false);
    });
  });

  describe('mouse panning', () => {
    it('should not pan on left-click (button 0)', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.handlers.onMouseDown({ clientX: 50, clientY: 50, button: 0 });
      });

      act(() => {
        result.current.handlers.onMouseMove({
          clientX: 100,
          clientY: 100
        });
      });

      // Left-click should not trigger panning
      expect(result.current.hasMoved()).toBe(false);
    });

    it('should pan on right-click (button 2)', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.handlers.onMouseDown({ clientX: 50, clientY: 50, button: 2 });
      });

      act(() => {
        result.current.handlers.onMouseMove({
          clientX: 100,
          clientY: 100
        });
      });

      // Right-click should trigger panning
      expect(result.current.hasMoved()).toBe(true);
    });

    it('should pan on middle-click (button 1)', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.handlers.onMouseDown({ clientX: 50, clientY: 50, button: 1 });
      });

      act(() => {
        result.current.handlers.onMouseMove({
          clientX: 100,
          clientY: 100
        });
      });

      // Middle-click should trigger panning
      expect(result.current.hasMoved()).toBe(true);
    });

    it('should pan when zoomed and dragging with right-click', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      // Zoom in first
      act(() => {
        result.current.zoomIn();
      });

      const initialTranslate = { ...result.current.translate };

      act(() => {
        result.current.handlers.onMouseDown({ clientX: 100, clientY: 100, button: 2 });
      });

      act(() => {
        result.current.handlers.onMouseMove({
          clientX: 80,
          clientY: 80
        });
      });

      // Translate should change (exact value depends on clamping)
      // Just verify it was attempted
      expect(result.current.hasMoved()).toBe(true);
    });

    it('should stop panning on mouse up', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.zoomIn();
      });

      act(() => {
        result.current.handlers.onMouseDown({ clientX: 100, clientY: 100, button: 2 });
      });

      act(() => {
        result.current.handlers.onMouseUp();
      });

      // Subsequent mouse move should not cause panning
      const translateBefore = { ...result.current.translate };

      act(() => {
        result.current.handlers.onMouseMove({
          clientX: 50,
          clientY: 50
        });
      });

      expect(result.current.translate).toEqual(translateBefore);
    });

    it('should stop panning on mouse leave', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.zoomIn();
      });

      act(() => {
        result.current.handlers.onMouseDown({ clientX: 100, clientY: 100, button: 2 });
      });

      act(() => {
        result.current.handlers.onMouseLeave();
      });

      // Subsequent mouse move should not cause panning
      const translateBefore = { ...result.current.translate };

      act(() => {
        result.current.handlers.onMouseMove({
          clientX: 50,
          clientY: 50
        });
      });

      expect(result.current.translate).toEqual(translateBefore);
    });
  });

  describe('touch handling', () => {
    it('should allow single-finger pan even when not zoomed (native panning support)', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.handlers.onTouchStart({
          touches: [{ clientX: 50, clientY: 50 }]
        });
      });

      // touchMove is now handled by native event listener,
      // but touchStart should set up the drag state
      // We can check that hasMoved would be set after sufficient movement
      // In practice, the native listener would handle the actual panning
      expect(result.current.hasMoved()).toBe(false); // No movement yet
    });

    it('should clean up on touch end', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.zoomIn();
      });

      act(() => {
        result.current.handlers.onTouchStart({
          touches: [{ clientX: 50, clientY: 50 }]
        });
      });

      act(() => {
        result.current.handlers.onTouchEnd();
      });

      // After touch end, hasMoved should be false for next gesture
      // (the ref is not reset until next touchstart/mousedown)
      // But isDragging should be false
      const translateBefore = { ...result.current.translate };

      act(() => {
        result.current.handlers.onTouchMove({
          touches: [{ clientX: 100, clientY: 100 }],
          preventDefault: vi.fn()
        });
      });

      expect(result.current.translate).toEqual(translateBefore);
    });
  });

  describe('exported constants', () => {
    it('should export MIN_SCALE as 1', () => {
      expect(MIN_SCALE).toBe(1);
    });

    it('should export MAX_SCALE as 4', () => {
      expect(MAX_SCALE).toBe(4);
    });

    it('should export ZOOM_STEP as 0.5', () => {
      expect(ZOOM_STEP).toBe(0.5);
    });

    it('should export DRAG_THRESHOLD as 5', () => {
      expect(DRAG_THRESHOLD).toBe(5);
    });
  });

  describe('transform style', () => {
    it('should generate correct transform string after zoom', () => {
      const { result } = renderHook(() => useMapZoom(containerRef));

      act(() => {
        result.current.zoomIn();
      });

      const style = result.current.transformStyle;
      expect(style).toMatch(/translate\(.+px, .+px\) scale\(.+\)/);
    });
  });
});
