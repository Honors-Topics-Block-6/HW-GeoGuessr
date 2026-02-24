import {
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useState,
  useEffect,
  type Ref
} from 'react';
import useMapZoom from '../../hooks/useMapZoom';
import './MapPicker.css';

export interface MapCoordinates {
  x: number;
  y: number;
}

export interface PolygonPoint {
  x: number;
  y: number;
}

export interface PlayingArea {
  polygon: PolygonPoint[];
}

export interface MapPickerProps {
  markerPosition: MapCoordinates | null;
  onMapClick: (coords: MapCoordinates) => void;
  clickRejected?: boolean;
  playingArea?: PlayingArea | null;
}

export interface MapPickerHandle {
  clickAtCursor: () => boolean;
}

const MapPicker = forwardRef<MapPickerHandle, MapPickerProps>(function MapPicker(
  { markerPosition, onMapClick, clickRejected = false, playingArea = null },
  ref: Ref<MapPickerHandle>
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const coordsFromClientPos = useCallback((clientX: number, clientY: number): MapCoordinates | null => {
    if (!imageRef.current) return null;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y))
    };
  }, []);

  const {
    scale,
    transformStyle,
    handlers,
    zoomIn,
    zoomInAtPoint,
    zoomOut,
    resetZoom,
    hasMoved,
    isPanning,
    isTouchActive
  } = useMapZoom(containerRef);

  const placeMarkerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (event.detail === 2) {
      // Second click of a double-click: cancel any pending single-click placement
      if (placeMarkerTimeoutRef.current) {
        clearTimeout(placeMarkerTimeoutRef.current);
        placeMarkerTimeoutRef.current = null;
      }
      return;
    }
    if (hasMoved()) return;
    const coords = coordsFromClientPos(event.clientX, event.clientY);
    if (!coords) return;
    // Delay placement slightly so double-click can cancel it and zoom instead
    placeMarkerTimeoutRef.current = setTimeout(() => {
      placeMarkerTimeoutRef.current = null;
      onMapClick(coords);
    }, 200);
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (placeMarkerTimeoutRef.current) {
      clearTimeout(placeMarkerTimeoutRef.current);
      placeMarkerTimeoutRef.current = null;
    }
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    zoomInAtPoint(x, y);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>): void => {
    lastMousePos.current = { x: event.clientX, y: event.clientY };
    // Forward to zoom/pan handler
    if (handlers.onMouseMove) handlers.onMouseMove(event);
  };

  const handleMouseLeave = (_event: React.MouseEvent<HTMLDivElement>): void => {
    lastMousePos.current = null;
    if (handlers.onMouseLeave) handlers.onMouseLeave();
  };

  const toggleFullscreen = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    setIsFullscreen((prev) => !prev);
  };

  useEffect(() => {
    if (!isFullscreen) return;

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFullscreen]);

  useEffect(() => {
    document.body.classList.toggle('map-fullscreen-open', isFullscreen);
    return () => document.body.classList.remove('map-fullscreen-open');
  }, [isFullscreen]);

  useEffect(() => {
    return () => {
      if (placeMarkerTimeoutRef.current) clearTimeout(placeMarkerTimeoutRef.current);
    };
  }, []);

  /**
   * Expose clickAtCursor() — places a marker at the current mouse position.
   * Returns false if the cursor isn't over the map.
   */
  useImperativeHandle(ref, () => ({
    clickAtCursor(): boolean {
      if (!lastMousePos.current) return false;
      const coords = coordsFromClientPos(lastMousePos.current.x, lastMousePos.current.y);
      if (coords) {
        onMapClick(coords);
        return true;
      }
      return false;
    }
  }), [coordsFromClientPos, onMapClick]);

  // Check if playing area is defined
  const hasPlayingArea = playingArea && playingArea.polygon && playingArea.polygon.length >= 3;
  const isZoomed = scale > 1;

  return (
    <div className={`map-picker-container ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <div className="map-header">
        <div className="map-header-left">
          <span className="map-icon">🗺️</span>
          <span>Click to place • Double-click to zoom in • Drag or pinch to pan</span>
        </div>
        <button
          className="map-fullscreen-toggle"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen map' : 'Enter fullscreen map'}
          title={isFullscreen ? 'Exit fullscreen' : 'Expand map'}
        >
          {isFullscreen ? '⤡' : '⤢'}
        </button>
      </div>
      <div
        className={`map-picker ${clickRejected ? 'click-rejected' : ''} ${isZoomed ? 'zoomed' : ''} ${isPanning ? 'is-panning' : ''} ${isTouchActive ? 'touch-active' : ''} ${isFullscreen ? 'fullscreen' : ''}`}
        ref={containerRef}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
        {...handlers}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="map-zoom-content" style={{ transform: transformStyle }}>
          <img
            ref={imageRef}
            className="map-image"
            src="/FINAL_MAP.png"
            alt="Campus Map"
            draggable="false"
            onDragStart={(e: React.DragEvent<HTMLImageElement>) => e.preventDefault()}
          />

          {/* SVG overlay showing playing area - darkens outside area */}
          {hasPlayingArea && (
            <svg
              className="playing-regions-overlay"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                {/* Define the playing area as a mask - white = visible, black = hidden */}
                <mask id="playing-area-mask">
                  {/* Start with white background (everything visible) */}
                  <rect x="0" y="0" width="100" height="100" fill="white" />
                  {/* Cut out the playing area (make it black = hidden from dark overlay) */}
                  <polygon
                    points={playingArea!.polygon.map((p: PolygonPoint) => `${p.x},${p.y}`).join(' ')}
                    fill="black"
                  />
                </mask>
              </defs>

              {/* Dark overlay outside the playing area */}
              <rect
                x="0"
                y="0"
                width="100"
                height="100"
                fill="rgba(0, 0, 0, 0.5)"
                mask="url(#playing-area-mask)"
              />

              {/* Border around the playing area */}
              <polygon
                points={playingArea!.polygon.map((p: PolygonPoint) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#27ae60"
                strokeWidth="0.4"
                strokeOpacity="0.8"
              />
            </svg>
          )}

          {/* Marker - positioned relative to the container; scale inversely with zoom so pin stays same visual size */}
          {markerPosition && (
            <div
              className="marker"
              style={{
                left: `${markerPosition.x}%`,
                top: `${markerPosition.y}%`,
                transform: `translate(-50%, calc(-100% - 5.4px)) scale(${1 / scale})`,
                transformOrigin: '50% 31.4px'
              }}
            >
              <div className="marker-pin"></div>
              <div className="marker-pulse"></div>
            </div>
          )}
        </div>

        {/* Zoom controls - positioned outside the transform wrapper */}
        <div className="zoom-controls">
          <button
            className="zoom-btn zoom-in-btn"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); zoomIn(); }}
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="zoom-btn zoom-out-btn"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); zoomOut(); }}
            title="Zoom out"
            aria-label="Zoom out"
            disabled={!isZoomed}
          >
            -
          </button>
          <button
            className="zoom-btn zoom-reset-btn"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); resetZoom(); }}
            title="Reset zoom"
            aria-label="Reset zoom"
            disabled={!isZoomed}
          >
            &#x21BA;
          </button>
        </div>

        {/* Zoom level indicator */}
        {isZoomed && (
          <div className="zoom-indicator">
            {Math.round(scale * 100)}%
          </div>
        )}
      </div>
    </div>
  );
});

export default MapPicker;
