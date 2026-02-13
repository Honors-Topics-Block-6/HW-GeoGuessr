import { useRef } from 'react';
import useMapZoom from '../../hooks/useMapZoom';
import './MapPicker.css';

function MapPicker({ markerPosition, onMapClick, clickRejected = false, playingArea = null }) {
  const containerRef = useRef(null);
  const imageRef = useRef(null);

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

  const handleClick = (event) => {
    // If the user was dragging/panning, don't place a marker
    if (hasMoved()) return;

    if (!imageRef.current) return;

    // Get coordinates relative to the actual image element
    // getBoundingClientRect() already accounts for CSS transforms
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    // Clamp values between 0 and 100
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));

    onMapClick({ x: clampedX, y: clampedY });
  };

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
        onContextMenu={(e) => e.preventDefault()}
        {...handlers}
      >
        <div className="map-zoom-content" style={{ transform: transformStyle }}>
          <img
            ref={imageRef}
            className="map-image"
            src="/FINAL_MAP.png"
            alt="Campus Map"
            draggable="false"
            onDragStart={(e) => e.preventDefault()}
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
                    points={playingArea.polygon.map(p => `${p.x},${p.y}`).join(' ')}
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
                points={playingArea.polygon.map(p => `${p.x},${p.y}`).join(' ')}
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
            onClick={(e) => { e.stopPropagation(); zoomIn(); }}
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="zoom-btn zoom-out-btn"
            onClick={(e) => { e.stopPropagation(); zoomOut(); }}
            title="Zoom out"
            aria-label="Zoom out"
            disabled={!isZoomed}
          >
            -
          </button>
          <button
            className="zoom-btn zoom-reset-btn"
            onClick={(e) => { e.stopPropagation(); resetZoom(); }}
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
}

export default MapPicker;
