import { useRef, useImperativeHandle, forwardRef, useCallback, type Ref } from 'react';
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
    zoomOut,
    resetZoom,
    hasMoved,
    isPanning
  } = useMapZoom(containerRef);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (hasMoved()) return;
    const coords = coordsFromClientPos(event.clientX, event.clientY);
    if (coords) onMapClick(coords);
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
    <div className="map-picker-container">
      <div className="map-header">
        <span className="map-icon">🗺️</span>
        <span>Click & drag to pan • Click to place your guess</span>
      </div>
      <div
        className={`map-picker ${clickRejected ? 'click-rejected' : ''} ${isZoomed ? 'zoomed' : ''} ${isPanning ? 'is-panning' : ''}`}
        ref={containerRef}
        onClick={handleClick}
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

          {/* Marker - positioned relative to the container which matches image size */}
          {markerPosition && (
            <div
              className="marker"
              style={{
                left: `${markerPosition.x}%`,
                top: `${markerPosition.y}%`
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
