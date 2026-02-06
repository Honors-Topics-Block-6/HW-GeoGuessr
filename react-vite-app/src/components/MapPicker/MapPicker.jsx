import { useRef } from 'react';
import './MapPicker.css';

function MapPicker({ markerPosition, onMapClick }) {
  const mapRef = useRef(null);

  const handleClick = (event) => {
    if (!mapRef.current) return;

    const rect = mapRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    // Clamp values between 0 and 100
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));

    onMapClick({ x: clampedX, y: clampedY });
  };

  return (
    <div className="map-picker-container">
      <div className="map-header">
        <span className="map-icon">🗺️</span>
        <span>Click to place your guess</span>
      </div>
      <div
        className="map-picker"
        ref={mapRef}
        onClick={handleClick}
      >
        <img
          className="map-image"
          src="/map.png"
          alt="Campus Map"
        />

        {/* Marker */}
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
    </div>
  );
}

export default MapPicker;
