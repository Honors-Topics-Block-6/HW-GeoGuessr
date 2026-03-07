import { useState, useRef, useCallback, useEffect } from 'react';

const MIN_SCALE = 1;
const MAX_SCALE = 4.5;
const ZOOM_STEP = 1.8;
const WHEEL_ZOOM_FACTOR = 0.016;
const PINCH_ZOOM_EXPONENT = 8;
const DRAG_THRESHOLD = 5;

interface Point {
  x: number;
  y: number;
}

interface ZoomResult {
  scale: number;
  translate: Point;
}

export interface MapZoomHandlers {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onDoubleClick: (e: React.MouseEvent) => void;
}

export interface UseMapZoomReturn {
  scale: number;
  translate: Point;
  transformStyle: string;
  handlers: MapZoomHandlers;
  zoomIn: () => void;
  zoomInAtPoint: (x: number, y: number) => void;
  zoomOut: () => void;
  zoomOutAtPoint: (x: number, y: number) => void;
  resetZoom: () => void;
  hasMoved: () => boolean;
  isPanning: boolean;
  isTouchActive: boolean;
}

/**
 * Clamp translate values to keep panned content visible.
 * With transform: translate(tx, ty) scale(s) and transform-origin: 0 0,
 * the content's natural (untransformed) top-left sits at (contentOffsetX, contentOffsetY)
 * within the container (e.g. from flexbox centering in fullscreen mode). After the
 * transform the content occupies:
 *   X: [contentOffsetX + tx,  contentOffsetX + tx + contentWidth  * scale]
 *   Y: [contentOffsetY + ty,  contentOffsetY + ty + contentHeight * scale]
 *
 * We enforce two symmetric constraints:
 *   A = -(contentOffsetX)                          — content left edge at container left
 *   B = containerWidth - contentOffsetX - contentWidth * scale — content right edge at container right
 * and clamp tx to [min(A,B), max(A,B)].
 *
 * When content fills the container (contentOffsetX = 0, contentWidth = containerWidth):
 *   A = 0, B = containerWidth * (1 - scale)  →  reduces to the original formula.
 * When content is smaller (centred, scale = 1):
 *   A = -offsetX < 0, B = offsetX > 0  →  image can drift slightly but stays inside container.
 * At the crossover point (contentWidth * scale = containerWidth):
 *   A = B = -offsetX  →  image exactly covers the container and is left-anchored.
 */
function clampTranslate(
  tx: number,
  ty: number,
  scale: number,
  containerWidth: number,
  containerHeight: number,
  contentOffsetX = 0,
  contentOffsetY = 0,
  contentWidth = containerWidth,
  contentHeight = containerHeight
): Point {
  const nearlyEqual = (a: number, b: number): boolean => Math.abs(a - b) < 0.5;
  const matchesContainer =
    nearlyEqual(contentOffsetX, 0) &&
    nearlyEqual(contentOffsetY, 0) &&
    nearlyEqual(contentWidth, containerWidth) &&
    nearlyEqual(contentHeight, containerHeight);

  // Original strict clamp: content must always cover the viewport.
  // This is ideal when the zoom content exactly matches container size.
  if (matchesContainer) {
    const minX = containerWidth * (1 - scale);
    const maxX = 0;
    const minY = containerHeight * (1 - scale);
    const maxY = 0;

    return {
      x: Math.max(minX, Math.min(maxX, tx)),
      y: Math.max(minY, Math.min(maxY, ty))
    };
  }

  // Relaxed clamp for centred/non-matching content (e.g. fullscreen map with letterboxing):
  // keep at least a sliver visible so zoom can stay anchored to cursor.
  const MIN_VISIBLE_PX = 48;
  const minX = -contentOffsetX - contentWidth * scale + MIN_VISIBLE_PX;
  const maxX = containerWidth - contentOffsetX - MIN_VISIBLE_PX;
  const minY = -contentOffsetY - contentHeight * scale + MIN_VISIBLE_PX;
  const maxY = containerHeight - contentOffsetY - MIN_VISIBLE_PX;

  return {
    x: Math.max(minX, Math.min(maxX, tx)),
    y: Math.max(minY, Math.min(maxY, ty))
  };
}

/**
 * Get distance between two touch points.
 */
function getTouchDistance(touches: React.TouchList | TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get midpoint between two touch points.
 */
function getTouchMidpoint(touches: React.TouchList | TouchList): Point {
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
 * @param containerRef  The scrollable/event-listening container element.
 * @param options.maxScale  Optional override for maximum zoom level.
 * @param options.zoomContentRef  Optional ref to the element that receives the CSS transform.
 *   When provided (e.g. in fullscreen mode where the content is flex-centred inside
 *   the container) its offsetLeft/Top/Width/Height are used so that zoom always
 *   centres on the cursor relative to the actual content, not the surrounding container.
 */
export interface UseMapZoomOptions {
  /** Lower max scale for mobile to reduce excessive zoom (default: 4.5) */
  maxScale?: number;
  /** Optional zoomed content element used for offset-aware cursor anchoring */
  zoomContentRef?: React.RefObject<HTMLElement | null>;
  /** Optional ref to zoom controls - double-click zoom is disabled when click is within deadZonePadding of this element */
  zoomControlsRef?: React.RefObject<HTMLElement | null>;
  /** Padding (px) around zoom controls where double-click zoom is disabled (default: 24) */
  deadZonePadding?: number;
}

function useMapZoom(
  containerRef: React.RefObject<HTMLElement | null>,
  options?: UseMapZoomOptions
): UseMapZoomReturn {
  const maxScale = options?.maxScale ?? MAX_SCALE;
  const zoomContentRef = options?.zoomContentRef;
  const zoomControlsRef = options?.zoomControlsRef;
  const deadZonePadding = options?.deadZonePadding ?? 24;
  const [scale, setScale] = useState<number>(MIN_SCALE);
  const [translate, setTranslate] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isTouchActive, setIsTouchActive] = useState<boolean>(false);

  // Refs for gesture tracking (don't trigger re-renders)
  const isDragging = useRef<boolean>(false);
  const dragStart = useRef<Point>({ x: 0, y: 0 });
  const translateStart = useRef<Point>({ x: 0, y: 0 });
  const dragMoved = useRef<boolean>(false);
  const wasPanning = useRef<boolean>(false); // Track if we were actually panning (left-click drag)
  const lastTouchDistance = useRef<number | null>(null);
  const scaleRef = useRef<number>(scale);
  const translateRef = useRef<Point>(translate);
  const animationFrameRef = useRef<number | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    scaleRef.current = scale;
    translateRef.current = translate;
  }, [scale, translate]);

  const animateTo = useCallback((targetScale: number, targetTranslate: Point): void => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const startScale = scaleRef.current;
    const startTranslate = { ...translateRef.current };

    const scaleDelta = targetScale - startScale;
    const translateDelta = {
      x: targetTranslate.x - startTranslate.x,
      y: targetTranslate.y - startTranslate.y
    };

    if (
      Math.abs(scaleDelta) < 0.001 &&
      Math.abs(translateDelta.x) < 0.5 &&
      Math.abs(translateDelta.y) < 0.5
    ) {
      return;
    }

    const duration = 220;
    let startTime: number | null = null;

    const step = (timestamp: number): void => {
      if (startTime === null) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);

      const nextScale = startScale + scaleDelta * eased;
      const nextTranslate = {
        x: startTranslate.x + translateDelta.x * eased,
        y: startTranslate.y + translateDelta.y * eased
      };

      scaleRef.current = nextScale;
      translateRef.current = nextTranslate;
      setScale(nextScale);
      setTranslate(nextTranslate);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);
  }, []);

  /**
   * Read the zoom-content element's layout offset and natural size within the container.
   * These are unaffected by the CSS transform, so they give the "before-transform"
   * position — exactly what the zoom math needs.
   * Falls back to (0, 0, containerW, containerH) when no zoomContentRef is provided,
   * which reproduces the original behaviour for non-fullscreen callers.
   */
  const getContentInfo = useCallback((containerW: number, containerH: number) => {
    const el = zoomContentRef?.current;
    if (el) {
      return {
        offsetX: el.offsetLeft,
        offsetY: el.offsetTop,
        contentW: el.offsetWidth,
        contentH: el.offsetHeight,
      };
    }
    return { offsetX: 0, offsetY: 0, contentW: containerW, contentH: containerH };
  }, [zoomContentRef]);

  /**
   * Zoom toward a specific point (in container-relative screen pixels).
   * The point under the cursor/finger stays fixed on screen.
   *
   * When a zoomContentRef is provided the cursor is first translated into the
   * content's own coordinate space (subtracting the flex-centering offset) so
   * that the anchor point is computed against the actual image, not the surrounding
   * container space.
   */
  const zoomToPoint = useCallback((
    cursorX: number,
    cursorY: number,
    newScale: number,
    currentScale: number,
    currentTranslate: Point
  ): ZoomResult | null => {
    const container = containerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    const clampedScale = Math.max(MIN_SCALE, Math.min(maxScale, newScale));

    if (clampedScale === currentScale) return null;

    // To keep the point under cursor fixed:
    // Before zoom: cursorRelX = tx + contentX * currentScale
    // After zoom:  cursorRelX = newTx + contentX * clampedScale
    // => newTx = cursorRelX - (cursorRelX - tx) * (clampedScale / currentScale)
    const { offsetX, offsetY, contentW, contentH } = getContentInfo(rect.width, rect.height);
    const scaleRatio = clampedScale / currentScale;
    const cursorRelX = cursorX - offsetX;
    const cursorRelY = cursorY - offsetY;
    const newTx = cursorRelX - scaleRatio * (cursorRelX - currentTranslate.x);
    const newTy = cursorRelY - scaleRatio * (cursorRelY - currentTranslate.y);

    const clamped = clampTranslate(
      newTx,
      newTy,
      clampedScale,
      rect.width,
      rect.height,
      offsetX,
      offsetY,
      contentW,
      contentH
    );

    return { scale: clampedScale, translate: clamped };
  }, [containerRef, getContentInfo, maxScale]);

  /**
   * Handle wheel zoom - zoom toward cursor position.
   * Attached as native event listener for { passive: false }.
   */
  const handleWheel = useCallback((e: WheelEvent): void => {
    e.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const currentScale = scaleRef.current;
    const currentTranslate = translateRef.current;

    const newScale = currentScale * Math.pow(2, -e.deltaY * WHEEL_ZOOM_FACTOR);

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
   * Left-click (button 0) or middle-click (button 1) trigger panning.
   * A left-click that doesn't drag will still place a marker (handled via hasMoved).
   */
  const handleMouseDown = useCallback((e: React.MouseEvent): void => {
    const isLeftClick = e.button === 0;
    const isMiddleClick = e.button === 1;
    const isRightClick = e.button === 2;
    if (!isLeftClick && !isMiddleClick && !isRightClick) return;

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
  const handleMouseMove = useCallback((e: React.MouseEvent): void => {
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
  const handleMouseUp = useCallback((): void => {
    isDragging.current = false;
    wasPanning.current = false;
    setIsPanning(false);
  }, []);

  /**
   * Mouse leave - end drag if pointer leaves container.
   */
  const handleMouseLeave = useCallback((): void => {
    isDragging.current = false;
    wasPanning.current = false;
    setIsPanning(false);
  }, []);

  /**
   * Touch start - start pinch or single-finger pan.
   */
  const handleTouchStart = useCallback((e: React.TouchEvent): void => {
    setIsTouchActive(true);
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
  const handleTouchMove = useCallback((e: TouchEvent): void => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

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

      const rawRatio = newDist / lastTouchDistance.current;
      const scaleChange = Math.pow(rawRatio, PINCH_ZOOM_EXPONENT);
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
      const { offsetX, offsetY, contentW, contentH } = getContentInfo(rect.width, rect.height);
      const clamped = clampTranslate(
        translateStart.current.x + dx,
        translateStart.current.y + dy,
        scaleRef.current,
        rect.width,
        rect.height,
        offsetX,
        offsetY,
        contentW,
        contentH
      );
      setTranslate(clamped);
    }
  }, [containerRef, zoomToPoint, getContentInfo]);

  /**
   * Touch end - clean up gesture state.
   */
  const handleTouchEnd = useCallback((): void => {
    isDragging.current = false;
    lastTouchDistance.current = null;
    setIsTouchActive(false);
  }, []);

  // Attach native touchmove listener with { passive: false } for preventDefault support
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', handleTouchMove);
  }, [containerRef, handleTouchMove]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  /**
   * Zoom in by ZOOM_STEP factor, centered on container.
   */
  const zoomIn = useCallback((): void => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const currentScale = scaleRef.current;
    const currentTranslate = translateRef.current;
    const newScale = Math.min(maxScale, currentScale * ZOOM_STEP);

    const result = zoomToPoint(cx, cy, newScale, currentScale, currentTranslate);
    if (result) {
      animateTo(result.scale, result.translate);
    }
  }, [containerRef, zoomToPoint, animateTo, maxScale]);

  /**
   * Zoom in by ZOOM_STEP factor toward a specific point (container-relative coords).
   */
  const zoomInAtPoint = useCallback((x: number, y: number): void => {
    const currentScale = scaleRef.current;
    const currentTranslate = translateRef.current;
    const newScale = Math.min(maxScale, currentScale * ZOOM_STEP);

    const result = zoomToPoint(x, y, newScale, currentScale, currentTranslate);
    if (result) {
      animateTo(result.scale, result.translate);
    }
  }, [zoomToPoint, animateTo, maxScale]);

  const zoomOutAtPoint = useCallback((x: number, y: number): void => {
    const currentScale = scaleRef.current;
    const currentTranslate = translateRef.current;
    const newScale = Math.max(MIN_SCALE, currentScale / ZOOM_STEP);

    if (newScale <= MIN_SCALE) {
      animateTo(MIN_SCALE, { x: 0, y: 0 });
      return;
    }

    const result = zoomToPoint(x, y, newScale, currentScale, currentTranslate);
    if (result) {
      animateTo(result.scale, result.translate);
    }
  }, [zoomToPoint, animateTo]);

  /**
   * Zoom out by ZOOM_STEP factor, centered on container.
   */
  const zoomOut = useCallback((): void => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const currentScale = scaleRef.current;
    const currentTranslate = translateRef.current;
    const newScale = Math.max(MIN_SCALE, currentScale / ZOOM_STEP);

    if (newScale <= MIN_SCALE) {
      animateTo(MIN_SCALE, { x: 0, y: 0 });
      return;
    }

    const result = zoomToPoint(cx, cy, newScale, currentScale, currentTranslate);
    if (result) {
      animateTo(result.scale, result.translate);
    }
  }, [containerRef, zoomToPoint, animateTo]);

  /**
   * Reset zoom to default (no zoom, no pan).
   */
  const resetZoom = useCallback((): void => {
    animateTo(MIN_SCALE, { x: 0, y: 0 });
  }, [animateTo]);

  const handleDoubleClick = useCallback((e: React.MouseEvent): void => {
    const container = containerRef.current;
    if (!container) return;

    // Skip double-click zoom when click is near zoom controls (avoids accidental zoom-in when rapidly clicking zoom-out)
    if (zoomControlsRef?.current) {
      const controlsRect = zoomControlsRef.current.getBoundingClientRect();
      const pad = deadZonePadding;
      const inDeadZone =
        e.clientX >= controlsRect.left - pad &&
        e.clientX <= controlsRect.right + pad &&
        e.clientY >= controlsRect.top - pad &&
        e.clientY <= controlsRect.bottom + pad;
      if (inDeadZone) return;
    }

    e.preventDefault();

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (e.shiftKey || e.altKey) {
      zoomOutAtPoint(x, y);
    } else {
      zoomInAtPoint(x, y);
    }
  }, [containerRef, zoomControlsRef, deadZonePadding, zoomInAtPoint, zoomOutAtPoint]);

  /**
   * Check if we were panning (left-click dragging).
   * Used by click handlers to prevent pin placement during pan.
   */
  const hasMoved = useCallback((): boolean => dragMoved.current, []);

  // Computed transform style string
  const transformStyle = `translate(${translate.x}px, ${translate.y}px) scale(${scale})`;

  const handlers: MapZoomHandlers = {
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onMouseLeave: handleMouseLeave,
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onDoubleClick: handleDoubleClick
  };

  return {
    scale,
    translate,
    transformStyle,
    handlers,
    zoomIn,
    zoomInAtPoint,
    zoomOut,
    zoomOutAtPoint,
    resetZoom,
    hasMoved,
    isPanning,
    isTouchActive
  };
}

export default useMapZoom;

// Export constants for testing
export { MIN_SCALE, MAX_SCALE, ZOOM_STEP, PINCH_ZOOM_EXPONENT, DRAG_THRESHOLD };
