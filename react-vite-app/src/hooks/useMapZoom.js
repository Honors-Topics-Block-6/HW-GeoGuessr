import { useState, useRef, useCallback, useEffect } from 'react';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.5;
const WHEEL_ZOOM_FACTOR = 0.002;
const DRAG_THRESHOLD = 5;

/**
 * Clamp translate values to prevent panning content off-screen.
 * With transform: translate(tx, ty) scale(s) and transform-origin: 0 0,
 * the content is first translated then scaled from top-left.
 *
 * Visible area covers [0, containerWidth] x [0, containerHeight] in screen space.
 * Content occupies [tx, tx + containerWidth * scale] x [ty, ty + containerHeight * scale].
 * We want the content to always cover the visible area:
 *   tx <= 0  and  tx + containerWidth * scale >= containerWidth
 *   => tx <= 0  and  tx >= containerWidth * (1 - scale)
 *   => containerWidth * (1 - scale) <= tx <= 0
 */
function clampTranslate(tx, ty, scale, containerWidth, containerHeight) {
  const minX = containerWidth * (1 - scale);
  const maxX = 0;
  const minY = containerHeight * (1 - scale);
  const maxY = 0;

  return {
    x: Math.max(minX, Math.min(maxX, tx)),
    y: Math.max(minY, Math.min(maxY, ty))
  };
}

/**
 * Get distance between two touch points.
 */
function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get midpoint between two touch points.
 */
function getTouchMidpoint(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

/**
 * Custom hook for map zoom and pan functionality.
 *
 * Uses CSS transform: translate(tx, ty) scale(s) with transform-origin: 0 0
 * on a wrapper div. All child elements (image, SVG overlay, markers) zoom
 * together automatically.
 *
 * @param {React.RefObject} containerRef - Ref to the outer container element
 * @returns {Object} Zoom state and handlers
 */
function useMapZoom(containerRef) {
  const [scale, setScale] = useState(MIN_SCALE);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Refs for gesture tracking (don't trigger re-renders)
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const wasPanning = useRef(false); // Track if we were actually panning (right-click)
  const lastTouchDistance = useRef(null);
  const scaleRef = useRef(scale);
  const translateRef = useRef(translate);

  // Keep refs in sync with state
  useEffect(() => {
    scaleRef.current = scale;
    translateRef.current = translate;
  }, [scale, translate]);

  /**
   * Zoom toward a specific point (in container-relative screen pixels).
   * The point under the cursor/finger stays fixed on screen.
   */
  const zoomToPoint = useCallback((cursorX, cursorY, newScale, currentScale, currentTranslate) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

    if (clampedScale === currentScale) return null;

    // To keep the point under cursor fixed:
    // Before zoom: screenPoint = cursorX = tx + contentX * currentScale
    // After zoom:  screenPoint = cursorX = newTx + contentX * clampedScale
    // => newTx = cursorX - (cursorX - tx) * (clampedScale / currentScale)
    const scaleRatio = clampedScale / currentScale;
    const newTx = cursorX - scaleRatio * (cursorX - currentTranslate.x);
    const newTy = cursorY - scaleRatio * (cursorY - currentTranslate.y);

    const clamped = clampTranslate(newTx, newTy, clampedScale, rect.width, rect.height);

    return { scale: clampedScale, translate: clamped };
  }, [containerRef]);

  /**
   * Handle wheel zoom - zoom toward cursor position.
   * Attached as native event listener for { passive: false }.
   */
  const handleWheel = useCallback((e) => {
    e.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const currentScale = scaleRef.current;
    const currentTranslate = translateRef.current;

    const delta = -e.deltaY * WHEEL_ZOOM_FACTOR;
    const newScale = currentScale * (1 + delta);

    const result = zoomToPoint(cursorX, cursorY, newScale, currentScale, currentTranslate);
    if (result) {
      setScale(result.scale);
      setTranslate(result.translate);
    }
  }, [containerRef, zoomToPoint]);

  // Attach native wheel listener with { passive: false }
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [containerRef, handleWheel]);

  /**
   * Mouse down - start potential drag/pan.
   * Only right-click (button 2) or middle-click (button 1) trigger panning.
   * Left-click (button 0) is reserved for placing pins.
   */
  const handleMouseDown = useCallback((e) => {
    // Only allow panning on right-click or middle-click
    const isRightClick = e.button === 2;
    const isMiddleClick = e.button === 1;
    if (!isRightClick && !isMiddleClick) return;

    isDragging.current = true;
    dragMoved.current = false;
    wasPanning.current = true; // Mark that we're panning
    dragStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translateRef.current };
    setIsPanning(true);
  }, []);

  /**
   * Mouse move - pan if dragging.
   */
  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return;

    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      dragMoved.current = true;
    }

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const newTx = translateStart.current.x + dx;
    const newTy = translateStart.current.y + dy;
    const clamped = clampTranslate(newTx, newTy, scaleRef.current, rect.width, rect.height);
    setTranslate(clamped);
  }, [containerRef]);

  /**
   * Mouse up - end drag.
   */
  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    wasPanning.current = false;
    setIsPanning(false);
  }, []);

  /**
   * Mouse leave - end drag if pointer leaves container.
   */
  const handleMouseLeave = useCallback(() => {
    isDragging.current = false;
    wasPanning.current = false;
    setIsPanning(false);
  }, []);

  /**
   * Touch start - start pinch or single-finger pan.
   */
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      // Pinch start
      lastTouchDistance.current = getTouchDistance(e.touches);
      isDragging.current = false; // Cancel any single-finger drag
    } else if (e.touches.length === 1) {
      // Single-finger pan (allow at any zoom level for native panning support)
      isDragging.current = true;
      dragMoved.current = false;
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      translateStart.current = { ...translateRef.current };
    }
  }, []);

  /**
   * Touch move - handle pinch zoom or single-finger pan.
   */
  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && lastTouchDistance.current !== null) {
      // Pinch zoom
      e.preventDefault();

      const newDist = getTouchDistance(e.touches);
      const midpoint = getTouchMidpoint(e.touches);

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const cursorX = midpoint.x - rect.left;
      const cursorY = midpoint.y - rect.top;

      const currentScale = scaleRef.current;
      const currentTranslate = translateRef.current;

      const scaleChange = newDist / lastTouchDistance.current;
      const newScale = currentScale * scaleChange;

      const result = zoomToPoint(cursorX, cursorY, newScale, currentScale, currentTranslate);
      if (result) {
        setScale(result.scale);
        setTranslate(result.translate);
      }

      lastTouchDistance.current = newDist;
    } else if (e.touches.length === 1 && isDragging.current) {
      // Single-finger pan
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;

      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        dragMoved.current = true;
        // Prevent page scroll when panning the map
        e.preventDefault();
      }

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const clamped = clampTranslate(
        translateStart.current.x + dx,
        translateStart.current.y + dy,
        scaleRef.current,
        rect.width,
        rect.height
      );
      setTranslate(clamped);
    }
  }, [containerRef, zoomToPoint]);

  /**
   * Touch end - clean up gesture state.
   */
  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    lastTouchDistance.current = null;
  }, []);

  // Attach native touchmove listener with { passive: false } for preventDefault support
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', handleTouchMove);
  }, [containerRef, handleTouchMove]);

  /**
   * Zoom in by ZOOM_STEP, centered on container.
   */
  const zoomIn = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const currentScale = scaleRef.current;
    const currentTranslate = translateRef.current;
    const newScale = Math.min(MAX_SCALE, currentScale + ZOOM_STEP);

    const result = zoomToPoint(cx, cy, newScale, currentScale, currentTranslate);
    if (result) {
      setScale(result.scale);
      setTranslate(result.translate);
    }
  }, [containerRef, zoomToPoint]);

  /**
   * Zoom out by ZOOM_STEP, centered on container.
   */
  const zoomOut = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const currentScale = scaleRef.current;
    const currentTranslate = translateRef.current;
    const newScale = Math.max(MIN_SCALE, currentScale - ZOOM_STEP);

    if (newScale <= MIN_SCALE) {
      setScale(MIN_SCALE);
      setTranslate({ x: 0, y: 0 });
      return;
    }

    const result = zoomToPoint(cx, cy, newScale, currentScale, currentTranslate);
    if (result) {
      setScale(result.scale);
      setTranslate(result.translate);
    }
  }, [containerRef, zoomToPoint]);

  /**
   * Reset zoom to default (no zoom, no pan).
   */
  const resetZoom = useCallback(() => {
    setScale(MIN_SCALE);
    setTranslate({ x: 0, y: 0 });
  }, []);

  /**
   * Check if we were panning (right-click dragging).
   * Used by click handlers to prevent pin placement during pan.
   */
  const hasMoved = useCallback(() => wasPanning.current && dragMoved.current, []);

  // Computed transform style string
  const transformStyle = `translate(${translate.x}px, ${translate.y}px) scale(${scale})`;

  const handlers = {
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onMouseLeave: handleMouseLeave,
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd
  };

  return {
    scale,
    translate,
    transformStyle,
    handlers,
    zoomIn,
    zoomOut,
    resetZoom,
    hasMoved,
    isPanning
  };
}

export default useMapZoom;

// Export constants for testing
export { MIN_SCALE, MAX_SCALE, ZOOM_STEP, DRAG_THRESHOLD };
